import { useCallback, useEffect, useRef, useState } from 'react';
import { networkUtility } from '../api/network';
import { useCoupleRealtime } from './useCoupleRealtime';
import type { DoodleStroke } from '../types/doodle';
import { mergeStrokes, newStrokeId, normalizeBrushWidth, normalizePoint, normalizeStrokeList } from '../utils/doodleMerge';

const PERSIST_DEBOUNCE_MS = 1500;
const BROADCAST_THROTTLE_MS = 80;

const DEFAULT_COLORS = ['#f472b6', '#a78bfa', '#38bdf8', '#fbbf24', '#f87171', '#ffffff'];

type DoodleBroadcastPayload = {
  event: string;
  stroke?: DoodleStroke;
  final?: boolean;
  strokeId?: string;
};

export function useDoodleCanvas(coupleId: string | null, userId: string | null) {
  const [strokes, setStrokes] = useState<DoodleStroke[]>([]);
  const [version, setVersion] = useState(1);
  const [loading, setLoading] = useState(true);
  const [color, setColor] = useState(DEFAULT_COLORS[0]);
  const [brushWidth, setBrushWidth] = useState(4);

  const strokesRef = useRef<DoodleStroke[]>([]);
  const versionRef = useRef(1);
  const activeStrokeRef = useRef<DoodleStroke | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPersistingRef = useRef(false);
  const skipNextRealtimeRef = useRef(false);
  const canvasSizeRef = useRef({ width: 1, height: 1 });

  const setCanvasSize = useCallback((width: number, height: number) => {
    canvasSizeRef.current = { width: Math.max(width, 1), height: Math.max(height, 1) };
  }, []);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => {
    versionRef.current = version;
  }, [version]);

  const applyRemoteStrokes = useCallback((remote: DoodleStroke[], remoteVersion: number) => {
    setStrokes((prev) => mergeStrokes(prev, remote));
    setVersion((v) => Math.max(v, remoteVersion));
  }, []);

  const loadFromDb = useCallback(async () => {
    if (!coupleId || !userId) return;
    const row = await networkUtility.getDoodleCanvas(coupleId, userId);
    if (!row) return;
    const remoteStrokes = normalizeStrokeList((row.strokes as DoodleStroke[]) || []);
    setStrokes((prev) => mergeStrokes(prev, remoteStrokes));
    setVersion(row.version ?? 1);
    setLoading(false);
  }, [coupleId, userId]);

  useEffect(() => {
    void loadFromDb();
  }, [loadFromDb]);

  useCoupleRealtime(coupleId, 'doodle_canvas', async () => {
    if (skipNextRealtimeRef.current) {
      skipNextRealtimeRef.current = false;
      return;
    }
    if (!coupleId || !userId) return;
    const row = await networkUtility.getDoodleCanvas(coupleId, userId);
    if (!row) return;
    applyRemoteStrokes(
      normalizeStrokeList((row.strokes as DoodleStroke[]) || []),
      row.version ?? 1,
    );
  }, { userIdField: 'updated_by', currentUserId: userId });

  const schedulePersist = useCallback(() => {
    if (!coupleId || !userId) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(async () => {
      if (isPersistingRef.current) return;
      isPersistingRef.current = true;
      try {
        const currentStrokes = strokesRef.current;
        const expectedVersion = versionRef.current;
        let result = await networkUtility.persistDoodleCanvas(
          coupleId,
          userId,
          currentStrokes,
          expectedVersion,
        );

        if (result.conflict && result.data) {
          const merged = mergeStrokes(
            currentStrokes,
            normalizeStrokeList((result.data.strokes as DoodleStroke[]) || []),
          );
          setStrokes(merged);
          strokesRef.current = merged;
          const retryVersion = result.data.version ?? expectedVersion;
          setVersion(retryVersion);
          versionRef.current = retryVersion;
          result = await networkUtility.persistDoodleCanvas(
            coupleId,
            userId,
            merged,
            retryVersion,
          );
        }

        if (result.data) {
          skipNextRealtimeRef.current = true;
          setVersion(result.data.version ?? versionRef.current + 1);
        }
      } catch (err) {
        console.error('Failed to persist doodle canvas:', err);
      } finally {
        isPersistingRef.current = false;
      }
    }, PERSIST_DEBOUNCE_MS);
  }, [coupleId, userId]);

  const broadcastStroke = useCallback(
    (stroke: DoodleStroke, final = false) => {
      if (!coupleId) return;
      networkUtility.broadcastDoodleEvent(coupleId, 'doodle_stroke', { stroke, final });
    },
    [coupleId],
  );

  const throttledBroadcast = useCallback(
    (stroke: DoodleStroke) => {
      if (broadcastTimerRef.current) return;
      broadcastTimerRef.current = setTimeout(() => {
        broadcastTimerRef.current = null;
        if (activeStrokeRef.current) {
          broadcastStroke(activeStrokeRef.current, false);
        }
      }, BROADCAST_THROTTLE_MS);
    },
    [broadcastStroke],
  );

  useEffect(() => {
    if (!coupleId) return;
    const unsub = networkUtility.subscribeToDoodleEvents(
      coupleId,
      (payload: DoodleBroadcastPayload) => {
        if (payload.event === 'reconnect') {
          void loadFromDb();
          return;
        }
        if (payload.event === 'doodle_clear') {
          setStrokes([]);
          strokesRef.current = [];
          return;
        }
        if (payload.event === 'doodle_undo' && payload.strokeId) {
          setStrokes((prev) => {
            const next = prev.filter((s) => s.id !== payload.strokeId);
            strokesRef.current = next;
            return next;
          });
          return;
        }
        if (payload.event === 'doodle_stroke' && payload.stroke) {
          const incoming = normalizeStrokeList([payload.stroke])[0];
          if (incoming.authorId === userId) return;
          setStrokes((prev) => {
            const idx = prev.findIndex((s) => s.id === incoming.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = incoming;
              return next;
            }
            return [...prev, incoming];
          });
        }
      },
    );
    return unsub;
  }, [coupleId, userId, loadFromDb]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current);
    };
  }, []);

  const startStroke = useCallback(
    (px: number, py: number) => {
      if (!userId) return;
      const { width, height } = canvasSizeRef.current;
      const point = normalizePoint(px, py, width, height);
      const stroke: DoodleStroke = {
        id: newStrokeId(),
        authorId: userId,
        color,
        width: normalizeBrushWidth(brushWidth, width, height),
        points: [point],
        createdAt: new Date().toISOString(),
      };
      activeStrokeRef.current = stroke;
      setStrokes((prev) => [...prev, stroke]);
    },
    [userId, color, brushWidth],
  );

  const extendStroke = useCallback(
    (px: number, py: number) => {
      const active = activeStrokeRef.current;
      if (!active) return;
      const { width, height } = canvasSizeRef.current;
      const point = normalizePoint(px, py, width, height);
      const updated: DoodleStroke = {
        ...active,
        points: [...active.points, point],
      };
      activeStrokeRef.current = updated;
      setStrokes((prev) => {
        const idx = prev.findIndex((s) => s.id === updated.id);
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = updated;
        return next;
      });
      throttledBroadcast(updated);
    },
    [throttledBroadcast],
  );

  const endStroke = useCallback(() => {
    const active = activeStrokeRef.current;
    if (!active) return;
    broadcastStroke(active, true);
    activeStrokeRef.current = null;
    schedulePersist();
  }, [broadcastStroke, schedulePersist]);

  const undoLastStroke = useCallback(() => {
    if (!coupleId || !userId) return;
    if (activeStrokeRef.current) return;

    const current = strokesRef.current;
    let removeIdx = -1;
    for (let i = current.length - 1; i >= 0; i--) {
      if (current[i].authorId === userId) {
        removeIdx = i;
        break;
      }
    }
    if (removeIdx < 0) return;

    const removedId = current[removeIdx].id;
    const next = current.filter((_, i) => i !== removeIdx);
    setStrokes(next);
    strokesRef.current = next;

    networkUtility.broadcastDoodleEvent(coupleId, 'doodle_undo', { strokeId: removedId });
    schedulePersist();
  }, [coupleId, userId, schedulePersist]);

  const canUndo =
    !!userId && strokes.some((s) => s.authorId === userId);

  const clearCanvas = useCallback(async () => {
    if (!coupleId || !userId) return;
    setStrokes([]);
    strokesRef.current = [];
    networkUtility.broadcastDoodleEvent(coupleId, 'doodle_clear', {});
    try {
      skipNextRealtimeRef.current = true;
      const result = await networkUtility.persistDoodleCanvas(
        coupleId,
        userId,
        [],
        versionRef.current,
      );
      if (result.data) setVersion(result.data.version ?? 1);
    } catch (err) {
      console.error('Failed to clear doodle canvas:', err);
    }
  }, [coupleId, userId]);

  return {
    strokes,
    loading,
    color,
    setColor,
    brushWidth,
    setBrushWidth,
    colors: DEFAULT_COLORS,
    startStroke,
    extendStroke,
    endStroke,
    clearCanvas,
    undoLastStroke,
    canUndo,
    setCanvasSize,
  };
}
