import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { networkUtility } from '../api/network';
import { supabase } from '../lib/supabase';
import {
  getPushRegistrationState,
  startPushRegistration,
  stopPushRegistration,
} from '../lib/pushTokens';

export type AppCtx = {
  user: { id: string; email?: string } | null;
  coupleId: string | null;
  coupleProfile: Record<string, unknown> | null;
  partnerId: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  isPaired: boolean;
};

const AppContext = createContext<AppCtx | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppCtx['user']>(null);
  const [coupleProfile, setCoupleProfile] = useState<Record<string, unknown> | null>(
    null
  );
  const [hydrated, setHydrated] = useState(false);
  const [initializing, setInitializing] = useState(true);

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

  useEffect(() => {
    if (!hydrated) return;
    if (!user?.id) {
      setCoupleProfile(null);
      setInitializing(false);
      return;
    }

    let cancelled = false;
    setInitializing(true);
    void (async () => {
      try {
        const profile = await networkUtility.getCoupleProfile(user.id);
        if (cancelled) return;
        setCoupleProfile(profile as Record<string, unknown> | null);
        const id = (profile as { id?: string } | null)?.id;
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
  }, [hydrated, user?.id]);

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
    });
    return () => {
      sub.remove();
      stopPushRegistration();
    };
  }, [user?.id, coupleProfile]);

  const coupleId = (coupleProfile?.id as string) ?? null;

  const value = useMemo(
    (): AppCtx => ({
      user,
      coupleId,
      coupleProfile,
      partnerId,
      loading: !hydrated || initializing,
      isAuthenticated: !!user,
      isPaired: !!coupleProfile,
    }),
    [user, coupleProfile, partnerId, hydrated, initializing, coupleId]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
