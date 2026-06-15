import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

export async function upsertExpoPushToken(
  userId: string,
  expoPushToken: string
): Promise<boolean> {
  const { error } = await supabase.from('user_push_tokens').upsert(
    {
      user_id: userId,
      expo_push_token: expoPushToken,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    console.error('[pushTokens] upsert failed:', error.message, error.code, error.details);
    return false;
  }
  return true;
}

/** Confirms RLS allows the signed-in user to read their saved token. */
export async function fetchOwnPushToken(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_push_tokens')
    .select('expo_push_token')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[pushTokens] fetch failed:', error.message);
    return null;
  }
  return (data?.expo_push_token as string | undefined) ?? null;
}
