import { supabase } from '../lib/supabase';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../constants/env';
import { cekFromB64 } from './envelope';

const cache = new Map<string, Uint8Array>();
const pending = new Map<string, Promise<Uint8Array | null>>();
let migrationVersion = 0;

export function setMigrationVersion(version: number): void {
  migrationVersion = version;
}

export function getMigrationVersion(): number {
  return migrationVersion;
}

export function clearCoupleKey(coupleId?: string): void {
  if (coupleId) {
    cache.delete(coupleId);
    pending.delete(coupleId);
    return;
  }
  cache.clear();
  pending.clear();
  migrationVersion = 0;
}

async function fetchCek(coupleId: string): Promise<Uint8Array | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return null;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/get-couple-cek`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (!res.ok) {
    console.error('[e2ee] get-couple-cek failed', res.status);
    return null;
  }

  const body = (await res.json()) as {
    cek?: string;
    migration_version?: number;
  };
  if (!body.cek) return null;
  migrationVersion = body.migration_version ?? 0;
  return cekFromB64(body.cek);
}

export async function ensureCoupleKey(coupleId: string | null | undefined): Promise<Uint8Array | null> {
  if (!coupleId) return null;
  const hit = cache.get(coupleId);
  if (hit) return hit;

  const inflight = pending.get(coupleId);
  if (inflight) return inflight;

  const promise = fetchCek(coupleId).then((key) => {
    if (key) cache.set(coupleId, key);
    return key;
  });
  pending.set(coupleId, promise);
  try {
    return await promise;
  } finally {
    pending.delete(coupleId);
  }
}

export function getCachedCoupleKey(coupleId: string): Uint8Array | null {
  return cache.get(coupleId) ?? null;
}
