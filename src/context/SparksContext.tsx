import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  fetchActiveNeedHugs,
  fetchRecentIncomingSparks,
  resolveNeedHugsAndSendReturn,
  sendSpark,
  subscribeToIncomingSparks,
} from '../api/sparks';
import { parseSparkNotificationData } from '../lib/sparkNotifications';
import type { SparkRow, SparkType } from '../types/sparks';
import { playBuzzPattern } from '../utils/sparkHaptics';
import { useApp } from './AppContext';

type SparksCtx = {
  partnerName: string;
  sending: boolean;
  sendSparkAction: (type: SparkType) => Promise<void>;
  pendingHug: SparkRow | null;
  dismissHug: () => void;
  sendHugBack: () => Promise<void>;
  hugSending: boolean;
  heartsVisible: boolean;
  heartsBurstId: number;
  clearHearts: () => void;
};

const SparksContext = createContext<SparksCtx | undefined>(undefined);

const HEARTS_MS = 8000;

export function SparksProvider({
  children,
  partnerName,
}: {
  children: React.ReactNode;
  partnerName: string;
}) {
  const { user, partnerId } = useApp();
  const [sending, setSending] = useState(false);
  const [hugSending, setHugSending] = useState(false);
  const [pendingHug, setPendingHug] = useState<SparkRow | null>(null);
  const [heartsVisible, setHeartsVisible] = useState(false);
  const [heartsBurstId, setHeartsBurstId] = useState(0);

  const processedIds = useRef(new Set<string>());
  const partnerNameRef = useRef(partnerName);
  const heartsCoalesceRef = useRef(false);

  useEffect(() => {
    partnerNameRef.current = partnerName;
  }, [partnerName]);

  const markProcessed = useCallback((sparkId?: string) => {
    if (sparkId) processedIds.current.add(sparkId);
  }, []);

  const isProcessed = useCallback((sparkId?: string) => {
    return sparkId ? processedIds.current.has(sparkId) : false;
  }, []);

  const triggerHearts = useCallback(() => {
    if (heartsCoalesceRef.current) return;
    heartsCoalesceRef.current = true;
    setHeartsVisible(true);
    setHeartsBurstId((n) => n + 1);
    setTimeout(() => {
      heartsCoalesceRef.current = false;
    }, 2000);
  }, []);

  useEffect(() => {
    if (!heartsVisible) return;
    const t = setTimeout(() => setHeartsVisible(false), HEARTS_MS);
    return () => clearTimeout(t);
  }, [heartsVisible, heartsBurstId]);

  const showNeedHugs = useCallback((row: SparkRow) => {
    if (row.resolved) return;
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return;
    setPendingHug(row);
  }, []);

  useEffect(() => {
    if (!pendingHug?.expires_at) return;
    const ms = new Date(pendingHug.expires_at).getTime() - Date.now();
    if (ms <= 0) {
      setPendingHug(null);
      return;
    }
    const t = setTimeout(() => setPendingHug(null), ms);
    return () => clearTimeout(t);
  }, [pendingHug?.id, pendingHug?.expires_at]);

  const handleSparkType = useCallback(
    async (type: SparkType, opts?: { sparkId?: string; row?: SparkRow }) => {
      const { sparkId, row } = opts ?? {};
      if (sparkId && isProcessed(sparkId)) return;
      if (sparkId) markProcessed(sparkId);

      switch (type) {
        case 'buzz':
          await playBuzzPattern();
          break;
        case 'need_hugs':
          if (row) showNeedHugs(row);
          else {
            const hug = await fetchActiveNeedHugs(user?.id ?? '');
            if (hug) showNeedHugs(hug);
          }
          break;
        case 'love_you':
        case 'hug_returned':
          triggerHearts();
          break;
        default:
          break;
      }
    },
    [user?.id, showNeedHugs, triggerHearts, isProcessed, markProcessed]
  );

  const processSpark = useCallback(
    async (row: SparkRow) => {
      if (!user?.id || row.receiver_id !== user.id) return;
      if (processedIds.current.has(row.id)) return;
      processedIds.current.add(row.id);

      // Background/killed: remote push from send-spark-push webhook only (no local duplicate).

      switch (row.type) {
        case 'buzz':
          await playBuzzPattern();
          break;
        case 'need_hugs':
          showNeedHugs(row);
          break;
        case 'love_you':
        case 'hug_returned':
          triggerHearts();
          break;
        default:
          break;
      }
    },
    [user?.id, showNeedHugs, triggerHearts]
  );

  const syncMissedSparks = useCallback(async () => {
    if (!user?.id || AppState.currentState !== 'active') return;

    const hug = await fetchActiveNeedHugs(user.id);
    if (hug) {
      showNeedHugs(hug);
      processedIds.current.add(hug.id);
    }

    const rows = await fetchRecentIncomingSparks(user.id, 300_000);
    let showHearts = false;

    for (const row of rows) {
      if (processedIds.current.has(row.id)) continue;
      processedIds.current.add(row.id);

      if (row.type === 'need_hugs' && !row.resolved) {
        if (!row.expires_at || new Date(row.expires_at).getTime() > Date.now()) {
          showNeedHugs(row);
        }
        continue;
      }

      if (row.type === 'love_you' || row.type === 'hug_returned') {
        showHearts = true;
      }
    }

    if (showHearts) triggerHearts();
  }, [user?.id, showNeedHugs, triggerHearts]);

  useEffect(() => {
    if (!user?.id) return;
    void syncMissedSparks();
  }, [user?.id, syncMissedSparks]);

  useEffect(() => {
    if (!user?.id) return;
    const onAppState = (next: AppStateStatus) => {
      if (next === 'active') void syncMissedSparks();
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => sub.remove();
  }, [user?.id, syncMissedSparks]);

  useEffect(() => {
    if (!user?.id) return;
    return subscribeToIncomingSparks(user.id, (row) => {
      void processSpark(row);
    });
  }, [user?.id, processSpark]);

  useEffect(() => {
    const onReceived = (notification: Notifications.Notification) => {
      const parsed = parseSparkNotificationData(notification.request.content.data);
      if (!parsed?.sparkType) return;
      // Foreground: realtime already runs haptics/hearts; only mark id so tap handler won't replay.
      if (AppState.currentState === 'active') {
        markProcessed(parsed.sparkId);
        return;
      }
    };

    const onResponse = (response: Notifications.NotificationResponse) => {
      const parsed = parseSparkNotificationData(response.notification.request.content.data);
      if (!parsed?.sparkType) return;
      void handleSparkType(parsed.sparkType, { sparkId: parsed.sparkId });
    };

    const r1 = Notifications.addNotificationReceivedListener(onReceived);
    const r2 = Notifications.addNotificationResponseReceivedListener(onResponse);

    return () => {
      r1.remove();
      r2.remove();
    };
  }, [handleSparkType, markProcessed]);

  const sendSparkAction = useCallback(
    async (type: SparkType) => {
      if (!user?.id || !partnerId || sending) return;
      if (type === 'hug_returned') return;
      setSending(true);
      try {
        await sendSpark(user.id, partnerId, type);
      } finally {
        setTimeout(() => setSending(false), 500);
      }
    },
    [user?.id, partnerId, sending]
  );

  const dismissHug = useCallback(() => setPendingHug(null), []);

  const sendHugBack = useCallback(async () => {
    if (!user?.id || !partnerId || !pendingHug || hugSending) return;
    setHugSending(true);
    try {
      const ok = await resolveNeedHugsAndSendReturn(pendingHug.id, user.id, partnerId);
      if (ok) {
        processedIds.current.add(pendingHug.id);
        setPendingHug(null);
      }
    } finally {
      setHugSending(false);
    }
  }, [user?.id, partnerId, pendingHug, hugSending]);

  const clearHearts = useCallback(() => setHeartsVisible(false), []);

  const value = useMemo(
    (): SparksCtx => ({
      partnerName,
      sending,
      sendSparkAction,
      pendingHug,
      dismissHug,
      sendHugBack,
      hugSending,
      heartsVisible,
      heartsBurstId,
      clearHearts,
    }),
    [
      partnerName,
      sending,
      sendSparkAction,
      pendingHug,
      dismissHug,
      sendHugBack,
      hugSending,
      heartsVisible,
      heartsBurstId,
      clearHearts,
    ]
  );

  return <SparksContext.Provider value={value}>{children}</SparksContext.Provider>;
}

export function useSparks() {
  const ctx = useContext(SparksContext);
  if (!ctx) throw new Error('useSparks must be inside SparksProvider');
  return ctx;
}
