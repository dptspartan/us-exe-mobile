import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react';
import { AppState } from 'react-native';
import { networkUtility } from '../api/network';
import { supabase } from '../lib/supabase';
import { dataCache, cacheKeys } from '../cache/dataCache';
import {
  getPushRegistrationState,
  startPushRegistration,
  stopPushRegistration,
} from '../lib/pushTokens';

export type AccessStatus = {
  couple_id: string;
  onboarding_status: string;
  access_allowed: boolean;
  subscription_status: string | null;
  grace_period_ends_at: string | null;
  reminder_active: boolean;
};

export type AppCtx = {
  user: { id: string; email?: string } | null;
  coupleId: string | null;
  coupleProfile: Record<string, unknown> | null;
  partnerId: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  isPaired: boolean;
  onboardingStatus: string | null;
  accessStatus: AccessStatus | null;
  accessStatusLoading: boolean;
  accessAllowed: boolean;
  reminderActive: boolean;
  gracePeriodEndsAt: string | null;
  refreshCoupleProfile: () => Promise<void>;
  refreshAccessStatus: () => Promise<void>;
};

const AppContext = createContext<AppCtx | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppCtx['user']>(null);
  const [coupleProfile, setCoupleProfile] = useState<Record<string, unknown> | null>(
    null
  );
  const [hydrated, setHydrated] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [accessStatus, setAccessStatus] = useState<AccessStatus | null>(null);
  const [accessStatusLoading, setAccessStatusLoading] = useState(false);

  const partnerId =
    coupleProfile && user?.id
      ? user.id === (coupleProfile.partner_1_id as string)
        ? (coupleProfile.partner_2_id as string)
        : (coupleProfile.partner_1_id as string)
      : null;

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      const u = session?.user;
      setUser(u ? { id: u.id, email: u.email ?? undefined } : null);
      setHydrated(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => {
        if (!mounted) return;
        const u = session?.user;
        setUser(u ? { id: u.id, email: u.email ?? undefined } : null);
      }, 0);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const fetchCoupleProfile = useCallback(async (userId: string) => {
    const profile = await networkUtility.getCoupleProfile(userId);
    setCoupleProfile(profile as Record<string, unknown> | null);
    return profile as { id?: string } | null;
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!user?.id) {
      setCoupleProfile(null);
      setAccessStatus(null);
      setInitializing(false);
      return;
    }

    let cancelled = false;
    setInitializing(true);
    void (async () => {
      try {
        const profile = await fetchCoupleProfile(user.id);
        if (cancelled) return;
        const id = profile?.id;
        if (id) {
          await networkUtility.prefetchCoupleData(id, user.id);
        }
      } catch {
        if (!cancelled) setCoupleProfile(null);
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, user?.id, fetchCoupleProfile]);

  const coupleId = (coupleProfile?.id as string) ?? null;
  const onboardingStatus = (coupleProfile?.onboarding_status as string) ?? null;

  const refreshAccessStatus = useCallback(async () => {
    if (!coupleId) {
      setAccessStatus(null);
      return;
    }
    setAccessStatusLoading(true);
    try {
      const status = await networkUtility.getAccessStatus();
      setAccessStatus(status as AccessStatus | null);
    } finally {
      setAccessStatusLoading(false);
    }
  }, [coupleId]);

  const refreshCoupleProfile = useCallback(async () => {
    if (!user?.id) return;
    await dataCache.invalidate(cacheKeys.coupleProfile(user.id));
    await fetchCoupleProfile(user.id);
  }, [user?.id, fetchCoupleProfile]);

  // Only meaningful once a couple has fully onboarded (source of truth for
  // whether the Dashboard should even be reachable).
  useEffect(() => {
    if (!coupleId || onboardingStatus !== 'active') {
      setAccessStatus(null);
      return;
    }
    void refreshAccessStatus();
  }, [coupleId, onboardingStatus, refreshAccessStatus]);

  useEffect(() => {
    if (!user?.id || !coupleProfile) {
      stopPushRegistration();
      return;
    }
    startPushRegistration(user.id);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && getPushRegistrationState().status !== 'saved') {
        startPushRegistration(user.id);
      }
      if (state === 'active' && onboardingStatus === 'active') {
        void refreshAccessStatus();
      }
    });
    return () => {
      sub.remove();
      stopPushRegistration();
    };
  }, [user?.id, coupleProfile, onboardingStatus, refreshAccessStatus]);

  const value = useMemo(
    (): AppCtx => ({
      user,
      coupleId,
      coupleProfile,
      partnerId,
      loading: !hydrated || initializing,
      isAuthenticated: !!user,
      isPaired: !!coupleProfile,
      onboardingStatus,
      accessStatus,
      accessStatusLoading,
      accessAllowed: accessStatus ? accessStatus.access_allowed : true,
      reminderActive: accessStatus?.reminder_active ?? false,
      gracePeriodEndsAt: accessStatus?.grace_period_ends_at ?? null,
      refreshCoupleProfile,
      refreshAccessStatus,
    }),
    [
      user,
      coupleProfile,
      partnerId,
      hydrated,
      initializing,
      coupleId,
      onboardingStatus,
      accessStatus,
      accessStatusLoading,
      refreshCoupleProfile,
      refreshAccessStatus,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
