import { useEffect, useRef, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { networkUtility } from '../api/network';

type TableListenerPayload = Record<string, unknown> & {
  __source?: string;
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
};

/**
 * Supabase realtime for couple-scoped tables (+ broadcast fallback), using AppState vs document visibility.
 */
export function useCoupleRealtime(
  coupleId: string | null,
  table: string,
  fetcher: () => void | Promise<void>,
  options: { userIdField?: string | null; currentUserId?: string | null } = {}
) {
  const { userIdField = null, currentUserId = null } = options;
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const load = useCallback(async () => {
    if (!coupleId) return;
    await fetcherRef.current();
  }, [coupleId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!coupleId) return;

    let pendingWhileBackground = false;

    const isOwnPostgresChange = (payload: TableListenerPayload) => {
      if (payload?.__source !== 'postgres') return false;
      if (!userIdField || !currentUserId) return false;
      const row = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
      return row?.[userIdField] === currentUserId;
    };

    const onChange = (payload: TableListenerPayload) => {
      if (isOwnPostgresChange(payload)) return;
      if (AppState.currentState !== 'active') {
        pendingWhileBackground = true;
        return;
      }
      void load();
    };

    const unsubscribe = networkUtility.subscribeToCoupleTable(coupleId, table, onChange);

    const onAppState = (next: AppStateStatus) => {
      if (next !== 'active' || !pendingWhileBackground) return;
      pendingWhileBackground = false;
      void load();
    };

    const sub = AppState.addEventListener('change', onAppState);

    return () => {
      sub.remove();
      unsubscribe();
    };
  }, [coupleId, table, load, userIdField, currentUserId]);

  return { reload: load };
}
