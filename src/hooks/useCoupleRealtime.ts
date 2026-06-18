import { useEffect, useRef, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { networkUtility } from '../api/network';
import { invalidateCoupleTableCache } from '../cache/dataCache';

type TableListenerPayload = Record<string, unknown> & {
  __source?: string;
  table?: string;
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
};

const REFRESH_DEBOUNCE_MS = 280;

/**
 * Supabase realtime for couple-scoped tables (+ broadcast fallback), using AppState vs document visibility.
 * Invalidates read cache before refresh; debounces burst events; catches up after background.
 */
export function useCoupleRealtime(
  coupleId: string | null,
  table: string,
  fetcher: () => void | Promise<void>,
  options: { userIdField?: string | null; currentUserId?: string | null } = {}
) {
  const { userIdField = null, currentUserId = null } = options;
  const fetcherRef = useRef(fetcher);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const load = useCallback(async (opts: { skipInvalidate?: boolean } = {}) => {
    if (!coupleId) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      if (!opts.skipInvalidate) {
        await invalidateCoupleTableCache(coupleId, table);
      }
      await fetcherRef.current();
    } finally {
      inFlightRef.current = false;
    }
  }, [coupleId, table]);

  const scheduleLoad = useCallback(
    (opts: { skipInvalidate?: boolean } = {}) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void load(opts);
      }, REFRESH_DEBOUNCE_MS);
    },
    [load]
  );

  useEffect(() => {
    void load({ skipInvalidate: true });
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

      if (payload.__source === 'reconnect') {
        void load();
        return;
      }

      if (AppState.currentState !== 'active') {
        pendingWhileBackground = true;
        return;
      }
      scheduleLoad();
    };

    const unsubscribe = networkUtility.subscribeToCoupleTable(coupleId, table, onChange);

    const onAppState = (next: AppStateStatus) => {
      if (next !== 'active' || !pendingWhileBackground) return;
      pendingWhileBackground = false;
      void load();
    };

    const sub = AppState.addEventListener('change', onAppState);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      sub.remove();
      unsubscribe();
    };
  }, [coupleId, table, load, scheduleLoad, userIdField, currentUserId]);

  return { reload: load };
}
