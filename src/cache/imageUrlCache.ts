type SignedUrlEntry = {
  url: string;
  expiresAt: number;
};

const signedUrls = new Map<string, SignedUrlEntry>();

/** Reuse signed URLs until ~2 min before expiry to cut storage round-trips. */
export function getCachedSignedUrl(storagePath: string): string | null {
  const hit = signedUrls.get(storagePath);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now() + 120_000) {
    signedUrls.delete(storagePath);
    return null;
  }
  return hit.url;
}

export function setCachedSignedUrl(storagePath: string, url: string, expiresInSec: number) {
  signedUrls.set(storagePath, {
    url,
    expiresAt: Date.now() + Math.max(60, expiresInSec - 120) * 1000,
  });
}

export function clearSignedUrlCache() {
  signedUrls.clear();
}

export function invalidateSignedUrlsForPaths(paths: string[]) {
  for (const p of paths) signedUrls.delete(p);
}
