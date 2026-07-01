import Constants from 'expo-constants';

type AppExtra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  expoCredentialsUrl?: string;
};

const legacy = Constants as {
  manifest2?: { extra?: AppExtra };
  manifest?: { extra?: AppExtra };
};

const extra = (Constants.expoConfig?.extra ??
  legacy.manifest2?.extra ??
  legacy.manifest?.extra ??
  {}) as AppExtra;

/** Supabase public URL — inlined from EXPO_PUBLIC_* at bundle time, or app.config extra. */
export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl ?? '';

/** Supabase anon (publishable) key */
export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseAnonKey ?? '';

/** Expo Android credentials page — set via EXPO_OWNER + EAS slug in app.config.js */
export const EXPO_CREDENTIALS_URL = extra.expoCredentialsUrl ?? '';

export function assertSupabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error(
      'Missing Supabase config. Set EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY in .env before `eas build`, or add them as GitHub Actions secrets for CI preview builds.',
    );
  }
}
