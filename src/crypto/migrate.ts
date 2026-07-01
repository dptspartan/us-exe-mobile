import { supabase } from '../lib/supabase';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../constants/env';
import { invalidateCoupleCache } from '../cache/dataCache';
import { clearPhotoDisplayCache } from '../cache/photoDisplayCache';
import {
  decryptBytes,
  encryptBytes,
  encryptString,
  isEncryptedJson,
  isEncryptedText,
} from './envelope';
import { ensureCoupleKey, getMigrationVersion, setMigrationVersion } from './coupleKey';

export const MIGRATION_TARGET_VERSION = 1;

type ProgressFn = (msg: string) => void;

const MIGRATING = new Set<string>();

export async function migrateCoupleContent(
  coupleId: string,
  onProgress?: ProgressFn,
): Promise<boolean> {
  if (!coupleId || MIGRATING.has(coupleId)) return false;
  if (getMigrationVersion() >= MIGRATION_TARGET_VERSION) return true;

  const cek = await ensureCoupleKey(coupleId);
  if (!cek) return false;

  MIGRATING.add(coupleId);
  const progress = onProgress ?? (() => {});

  try {
    progress('Securing letters…');
    await migrateTableText(coupleId, cek, 'flip_letters', 'content');

    progress('Securing notes…');
    await migrateTableText(coupleId, cek, 'sticky_notes', 'content');

    progress('Securing goals…');
    await migrateTableText(coupleId, cek, 'todos', 'task');

    progress('Securing dates…');
    await migrateDiary(coupleId, cek);

    progress('Securing jam links…');
    await migrateLinkDrops(coupleId, cek);

    progress('Securing triggers…');
    await migrateTriggers(coupleId, cek);

    progress('Securing photos…');
    await migratePhotos(coupleId, cek, progress);

    progress('Securing doodles…');
    await migrateDoodle(coupleId, cek);

    const migrated = await completeMigration(coupleId);
    return migrated;
  } catch (e) {
    console.error('[e2ee migrate]', e);
    return false;
  } finally {
    MIGRATING.delete(coupleId);
  }
}

async function migrateTableText(
  coupleId: string,
  cek: Uint8Array,
  table: string,
  field: string,
) {
  const { data } = await supabase.from(table).select(`id, ${field}`).eq('couple_id', coupleId);
  for (const row of data || []) {
    const val = row[field];
    if (!val || isEncryptedText(val)) continue;
    const enc = encryptString(cek, val);
    await supabase.from(table).update({ [field]: enc }).eq('id', row.id);
  }
}

async function migrateDiary(coupleId: string, cek: Uint8Array) {
  const { data: dates } = await supabase
    .from('date_diary')
    .select('id, title, location')
    .eq('couple_id', coupleId);

  for (const d of dates || []) {
    const updates: Record<string, string> = {};
    if (d.title && !isEncryptedText(d.title)) updates.title = encryptString(cek, d.title);
    if (d.location && !isEncryptedText(d.location)) {
      updates.location = encryptString(cek, d.location);
    }
    if (Object.keys(updates).length) {
      await supabase.from('date_diary').update(updates).eq('id', d.id);
    }
  }

  const dateIds = (dates || []).map((d) => d.id);
  if (!dateIds.length) return;

  const { data: notes } = await supabase
    .from('date_diary_notes')
    .select('id, notes')
    .in('date_diary_id', dateIds);

  for (const n of notes || []) {
    if (!n.notes || isEncryptedText(n.notes)) continue;
    await supabase
      .from('date_diary_notes')
      .update({ notes: encryptString(cek, n.notes) })
      .eq('id', n.id);
  }
}

async function migrateLinkDrops(coupleId: string, cek: Uint8Array) {
  const { data } = await supabase
    .from('link_drops')
    .select('id, title, url')
    .eq('couple_id', coupleId);

  for (const row of data || []) {
    const updates: Record<string, string> = {};
    if (row.title && !isEncryptedText(row.title)) updates.title = encryptString(cek, row.title);
    if (row.url && !isEncryptedText(row.url)) updates.url = encryptString(cek, row.url);
    if (Object.keys(updates).length) {
      await supabase.from('link_drops').update(updates).eq('id', row.id);
    }
  }
}

async function migrateTriggers(coupleId: string, cek: Uint8Array) {
  const { data } = await supabase
    .from('dynamic_triggers')
    .select('couple_id, creator_id, payload')
    .eq('couple_id', coupleId);

  for (const row of data || []) {
    if (!row.payload || isEncryptedJson(row.payload)) continue;
    const { encryptJson } = await import('./envelope');
    await supabase
      .from('dynamic_triggers')
      .update({ payload: encryptJson(cek, row.payload) })
      .eq('couple_id', row.couple_id)
      .eq('creator_id', row.creator_id);
  }
}

async function migrateDoodle(coupleId: string, cek: Uint8Array) {
  const { data } = await supabase
    .from('doodle_canvas')
    .select('couple_id, strokes')
    .eq('couple_id', coupleId)
    .maybeSingle();

  if (!data?.strokes || isEncryptedJson(data.strokes)) return;
  const strokes = data.strokes;
  if (Array.isArray(strokes) && strokes.length === 0) return;
  const { encryptJson } = await import('./envelope');
  await supabase
    .from('doodle_canvas')
    .update({ strokes: encryptJson(cek, strokes) })
    .eq('couple_id', coupleId);
}

async function migratePhotos(coupleId: string, cek: Uint8Array, progress: ProgressFn) {
  const { data: photos } = await supabase
    .from('photo_wall')
    .select('id, storage_path, caption, encryption_meta')
    .eq('couple_id', coupleId);

  for (const photo of photos || []) {
    if (photo.encryption_meta) continue;

    if (photo.caption && !isEncryptedText(photo.caption)) {
      await supabase
        .from('photo_wall')
        .update({ caption: encryptString(cek, photo.caption) })
        .eq('id', photo.id);
    }

    const { data: blob } = await supabase.storage.from('memories').download(photo.storage_path);
    if (!blob) continue;

    const buf = new Uint8Array(await blob.arrayBuffer());
    if (buf.length < 20) continue;

    const mime = blob.type || 'image/jpeg';
    const enc = encryptBytes(cek, buf);

    await supabase.storage.from('memories').upload(photo.storage_path, enc, {
      upsert: true,
      contentType: mime,
    });

    await supabase
      .from('photo_wall')
      .update({ encryption_meta: { v: 1, mime } })
      .eq('id', photo.id);

    progress('Securing photos…');
  }
}

async function completeMigration(coupleId: string): Promise<boolean> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return false;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/get-couple-cek`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'complete_migration' }),
  });

  if (!res.ok) {
    console.error('[e2ee migrate] complete_migration failed', res.status);
    return false;
  }

  const body = (await res.json()) as { migration_version?: number };
  setMigrationVersion(body.migration_version ?? MIGRATION_TARGET_VERSION);
  await invalidateCoupleCache(coupleId);
  clearPhotoDisplayCache();
  return true;
}

export { decryptBytes };
