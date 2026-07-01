import { cacheDirectory, writeAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import {
  clearPhotoDisplayCache,
  getPhotoDisplayCache,
  setPhotoDisplayCache,
} from '../cache/photoDisplayCache';
import {
  bytesToB64,
  decryptBytes,
  encryptBytes,
  encryptJson,
  ensureCoupleKey,
  maybeDecryptJson,
  maybeDecryptText,
  maybeEncryptJson,
  maybeEncryptText,
  decryptRowsTexts,
  decryptRowTexts,
} from '../crypto';

function isImageMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return true;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return true;
  if (
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true;
  }
  return false;
}

function resolvePlainImageBytes(
  buf: Uint8Array,
  cek: Uint8Array,
  encryptionMeta: unknown,
): Uint8Array | null {
  if (!encryptionMeta) {
    return isImageMagic(buf) ? buf : null;
  }
  try {
    const decrypted = decryptBytes(cek, buf);
    if (isImageMagic(decrypted)) return decrypted;
  } catch {
    // GCM auth failure — try dual-read plaintext in storage
  }
  if (isImageMagic(buf)) return buf;
  return null;
}

export async function requireCek(coupleId: string | null | undefined) {
  return ensureCoupleKey(coupleId);
}

export async function resolvePhotoDisplayUrl(
  coupleId: string,
  storagePath: string,
  encryptionMeta: unknown,
  expiresIn = 3600,
): Promise<string | null> {
  const cacheKey = `${storagePath}:${JSON.stringify(encryptionMeta ?? null)}`;
  const cached = getPhotoDisplayCache(cacheKey);
  if (cached) return cached;

  const { data, error } = await supabase.storage
    .from('memories')
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) {
    if (__DEV__) console.warn('[e2ee photo] signed URL failed', storagePath, error?.message);
    return null;
  }

  if (!encryptionMeta) {
    setPhotoDisplayCache(cacheKey, data.signedUrl);
    return data.signedUrl;
  }

  const cek = await ensureCoupleKey(coupleId);
  if (!cek) {
    if (__DEV__) console.warn('[e2ee photo] no CEK for', storagePath);
    return null;
  }

  try {
    const res = await fetch(data.signedUrl);
    if (!res.ok) {
      if (__DEV__) console.warn('[e2ee photo] fetch failed', storagePath, res.status);
      return null;
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    const plain = resolvePlainImageBytes(buf, cek, encryptionMeta);
    if (!plain) {
      if (__DEV__) console.warn('[e2ee photo] decrypt produced non-image bytes', storagePath);
      return null;
    }

    if (!cacheDirectory) {
      if (__DEV__) console.warn('[e2ee photo] cacheDirectory unavailable');
      return null;
    }

    const fileUri = `${cacheDirectory}e2ee_${storagePath.replace(/\//g, '_')}`;
    await writeAsStringAsync(fileUri, bytesToB64(plain), { encoding: EncodingType.Base64 });
    setPhotoDisplayCache(cacheKey, fileUri);
    return fileUri;
  } catch (e) {
    if (__DEV__) console.warn('[e2ee photo] resolve failed', storagePath, e);
    return null;
  }
}

export { clearPhotoDisplayCache };

export async function encryptBroadcastPayload(coupleId: string, payload: Record<string, unknown>) {
  const cek = await ensureCoupleKey(coupleId);
  if (!cek) return payload;
  return { enc: encryptJson(cek, payload) };
}

export async function decryptBroadcastPayload<T>(
  coupleId: string,
  payload: Record<string, unknown>,
): Promise<T> {
  if (!payload?.enc) return payload as T;
  const cek = await ensureCoupleKey(coupleId);
  if (!cek) return payload as T;
  return (maybeDecryptJson<T>(cek, payload.enc) ?? payload) as T;
}

export {
  maybeEncryptText,
  maybeDecryptText,
  maybeEncryptJson,
  maybeDecryptJson,
  decryptRowsTexts,
  decryptRowTexts,
  encryptBytes,
};
