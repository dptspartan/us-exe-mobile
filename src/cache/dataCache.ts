import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = 'us_exe_cache:';
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const SOFT_STALE_MS = 60 * 1000;

type CacheEntry<T = unknown> = {
  data: T;
  savedAt: number;
  ttlMs: number;
};

const memory = new Map<string, CacheEntry>();

function storageKey(key: string) {
  return `${STORAGE_PREFIX}${key}`;
}

export const dataCache = {
  getSync<T>(key: string): T | null {
    const entry = memory.get(key);
    return entry ? (entry.data as T) : null;
  },

  async get<T>(key: string): Promise<T | null> {
    const hit = memory.get(key);
    if (hit) return hit.data as T;

    try {
      const raw = await AsyncStorage.getItem(storageKey(key));
      if (!raw) return null;
      const entry = JSON.parse(raw) as CacheEntry<T>;
      memory.set(key, entry);
      return entry.data;
    } catch {
      return null;
    }
  },

  isFresh(key: string): boolean {
    const entry = memory.get(key);
    if (!entry) return false;
    return Date.now() - entry.savedAt < entry.ttlMs;
  },

  isSoftStale(key: string): boolean {
    const entry = memory.get(key);
    if (!entry) return true;
    return Date.now() - entry.savedAt > SOFT_STALE_MS;
  },

  async set<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS) {
    const entry: CacheEntry<T> = { data, savedAt: Date.now(), ttlMs };
    memory.set(key, entry);
    try {
      await AsyncStorage.setItem(storageKey(key), JSON.stringify(entry));
    } catch {
      /* persistence is best-effort */
    }
  },

  async invalidate(key: string) {
    memory.delete(key);
    try {
      await AsyncStorage.removeItem(storageKey(key));
    } catch {
      /* ignore */
    }
  },

  async invalidateMany(keys: string[]) {
    for (const key of keys) memory.delete(key);
    try {
      await AsyncStorage.multiRemove(keys.map(storageKey));
    } catch {
      /* ignore */
    }
  },

  async invalidatePrefix(prefix: string) {
    for (const key of [...memory.keys()]) {
      if (key.startsWith(prefix)) memory.delete(key);
    }
    try {
      const all = await AsyncStorage.getAllKeys();
      const ours = all.filter((k) => k.startsWith(storageKey(prefix)));
      if (ours.length) await AsyncStorage.multiRemove(ours);
    } catch {
      /* ignore */
    }
  },

  async clearAll() {
    memory.clear();
    try {
      const all = await AsyncStorage.getAllKeys();
      const ours = all.filter((k) => k.startsWith(STORAGE_PREFIX));
      if (ours.length) await AsyncStorage.multiRemove(ours);
    } catch {
      /* ignore */
    }
  },
};

export const cacheKeys = {
  coupleProfile: (userId: string) => `coupleProfile:${userId}`,
  moods: (coupleId: string) => `moods:${coupleId}`,
  names: (coupleId: string, userId: string) => `names:${coupleId}:${userId}`,
  flipLetters: (coupleId: string) => `flipLetters:${coupleId}`,
  photos: (coupleId: string) => `photos:${coupleId}`,
  photosWithUrls: (coupleId: string) => `photosWithUrls:${coupleId}`,
  savedDoodles: (coupleId: string) => `savedDoodles:${coupleId}`,
  photoDateTags: (coupleId: string) => `photoDateTags:${coupleId}`,
  stickyNotes: (coupleId: string, userId: string) => `stickyNotes:${coupleId}:${userId}`,
  todos: (coupleId: string) => `todos:${coupleId}`,
  jamSessions: (coupleId: string) => `jamSessions:${coupleId}`,
  diaryDates: (coupleId: string) => `diaryDates:${coupleId}`,
  doodleCanvas: (coupleId: string) => `doodleCanvas:${coupleId}`,
};

const TABLE_CACHE_KEYS: Record<string, (coupleId: string) => string[]> = {
  moods: (cid) => [cacheKeys.moods(cid)],
  todos: (cid) => [cacheKeys.todos(cid)],
  sticky_notes: (cid) => [`stickyNotes:${cid}:`], // prefix — per-user keys
  photo_wall: (cid) => [
    cacheKeys.photos(cid),
    cacheKeys.photosWithUrls(cid),
    cacheKeys.savedDoodles(cid),
    cacheKeys.photoDateTags(cid),
  ],
  link_drops: (cid) => [cacheKeys.jamSessions(cid)],
  flip_letters: (cid) => [cacheKeys.flipLetters(cid)],
  date_diary: (cid) => [cacheKeys.diaryDates(cid), cacheKeys.photoDateTags(cid)],
  doodle_canvas: (cid) => [cacheKeys.doodleCanvas(cid)],
};

export async function invalidateCoupleTableCache(coupleId: string, table: string) {
  const keys = TABLE_CACHE_KEYS[table]?.(coupleId);
  if (keys?.length) {
    for (const key of keys) {
      if (key.endsWith(':')) {
        await dataCache.invalidatePrefix(key);
      } else {
        await dataCache.invalidate(key);
      }
    }
  }
}

export async function invalidateCoupleCache(coupleId: string) {
  await dataCache.invalidatePrefix(`${coupleId}`);
  await dataCache.invalidatePrefix(`moods:${coupleId}`);
  await dataCache.invalidatePrefix(`todos:${coupleId}`);
  await dataCache.invalidatePrefix(`photos:${coupleId}`);
  await dataCache.invalidatePrefix(`flipLetters:${coupleId}`);
  await dataCache.invalidatePrefix(`diaryDates:${coupleId}`);
  await dataCache.invalidatePrefix(`stickyNotes:${coupleId}`);
  await dataCache.invalidatePrefix(`jamSessions:${coupleId}`);
  await dataCache.invalidatePrefix(`doodleCanvas:${coupleId}`);
  await dataCache.invalidatePrefix(`names:${coupleId}`);
  await dataCache.invalidatePrefix(`savedDoodles:${coupleId}`);
  await dataCache.invalidatePrefix(`photoDateTags:${coupleId}`);
}
