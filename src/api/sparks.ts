import { supabase } from '../lib/supabase';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../constants/env';
import type { SparkRow, SparkType } from '../types/sparks';

const sparksChannels = new Map<string, { channel: ReturnType<typeof supabase.channel>; listeners: Set<(row: SparkRow) => void> }>();

type PushInvokeResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
};

export async function sendSpark(
  senderId: string,
  receiverId: string,
  type: SparkType
): Promise<SparkRow | null> {
  const payload: Record<string, unknown> = {
    sender_id: senderId,
    receiver_id: receiverId,
    type,
  };

  if (type === 'need_hugs') {
    const expires = new Date(Date.now() + 60_000);
    payload.expires_at = expires.toISOString();
  }

  const { data, error } = await supabase.from('sparks').insert(payload).select().single();

  if (error) {
    console.error('[sparks] send failed:', error.message);
    return null;
  }

  // Remote push is sent by the Supabase webhook on sparks INSERT (send-spark-push).
  // Do not invoke here — that duplicates notifications when the webhook is enabled.
  return data as SparkRow;
}

/** Expo push via Supabase Edge Function (works when app is killed). */
export async function requestSparkRemotePush(sparkId: string): Promise<PushInvokeResult> {
  const body = { spark_id: sparkId };

  const { data, error } = await supabase.functions.invoke('send-spark-push', { body });

  if (!error && data) {
    const res = data as { ok?: boolean; skipped?: boolean; reason?: string };
    if (res.skipped) {
      return { ok: false, skipped: true, reason: res.reason ?? 'skipped' };
    }
    return { ok: res.ok !== false };
  }

  const fallback = await requestSparkRemotePushFetch(body);
  if (fallback.ok) return fallback;

  return {
    ok: false,
    error: error?.message ?? fallback.error ?? 'invoke failed',
    reason: fallback.reason,
  };
}

async function requestSparkRemotePushFetch(body: { spark_id: string }): Promise<PushInvokeResult> {
  if (!SUPABASE_URL) return { ok: false, error: 'missing SUPABASE_URL' };

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? SUPABASE_ANON_KEY;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-spark-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as {
      ok?: boolean;
      skipped?: boolean;
      reason?: string;
      error?: string;
    };

    if (!res.ok) {
      return { ok: false, error: json.error ?? res.statusText };
    }
    if (json.skipped) {
      return { ok: false, skipped: true, reason: json.reason };
    }
    return { ok: json.ok !== false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function resolveNeedHugsAndSendReturn(
  originalSparkId: string,
  senderId: string,
  receiverId: string
): Promise<boolean> {
  const { error: updateError } = await supabase
    .from('sparks')
    .update({ resolved: true })
    .eq('id', originalSparkId)
    .eq('resolved', false);

  if (updateError) {
    console.error('[sparks] resolve failed:', updateError.message);
    return false;
  }

  const returned = await sendSpark(senderId, receiverId, 'hug_returned');
  return !!returned;
}

export async function fetchRecentHugReturned(receiverId: string): Promise<SparkRow | null> {
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data, error } = await supabase
    .from('sparks')
    .select('*')
    .eq('receiver_id', receiverId)
    .eq('type', 'hug_returned')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[sparks] fetch hug_returned:', error.message);
    return null;
  }
  return (data as SparkRow) ?? null;
}

export async function fetchRecentIncomingSparks(
  receiverId: string,
  sinceMs = 90_000
): Promise<SparkRow[]> {
  const since = new Date(Date.now() - sinceMs).toISOString();
  const { data, error } = await supabase
    .from('sparks')
    .select('*')
    .eq('receiver_id', receiverId)
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[sparks] fetch recent:', error.message);
    return [];
  }
  return (data as SparkRow[]) ?? [];
}

export async function fetchActiveNeedHugs(receiverId: string): Promise<SparkRow | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('sparks')
    .select('*')
    .eq('receiver_id', receiverId)
    .eq('type', 'need_hugs')
    .eq('resolved', false)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[sparks] fetch active need_hugs:', error.message);
    return null;
  }
  return (data as SparkRow) ?? null;
}

export function subscribeToIncomingSparks(
  receiverId: string,
  onInsert: (row: SparkRow) => void
): () => void {
  const key = receiverId;
  let entry = sparksChannels.get(key);

  if (!entry) {
    const listeners = new Set<(row: SparkRow) => void>();
    const channel = supabase
      .channel(`sparks-inbox:${receiverId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sparks',
          filter: `receiver_id=eq.${receiverId}`,
        },
        (payload) => {
          const row = payload.new as SparkRow;
          if (!row?.id) return;
          listeners.forEach((fn) => fn(row));
        }
      )
      .subscribe((status, err) => {
        console.log(`[sparks realtime:${receiverId}]`, status, err?.message ?? '');
      });

    entry = { channel, listeners };
    sparksChannels.set(key, entry);
  }

  entry.listeners.add(onInsert);

  return () => {
    entry!.listeners.delete(onInsert);
    if (entry!.listeners.size === 0) {
      supabase.removeChannel(entry!.channel);
      sparksChannels.delete(key);
    }
  };
}
