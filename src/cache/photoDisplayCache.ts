const photoDisplayCache = new Map<string, string>();
const MAX_ENTRIES = 48;

export function getPhotoDisplayCache(key: string): string | undefined {
  return photoDisplayCache.get(key);
}

export function setPhotoDisplayCache(key: string, uri: string): void {
  if (photoDisplayCache.size >= MAX_ENTRIES && !photoDisplayCache.has(key)) {
    const oldest = photoDisplayCache.keys().next().value;
    if (oldest) photoDisplayCache.delete(oldest);
  }
  photoDisplayCache.set(key, uri);
}

export function clearPhotoDisplayCache(): void {
  photoDisplayCache.clear();
}
