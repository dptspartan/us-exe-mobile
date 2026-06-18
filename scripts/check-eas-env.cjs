/**
 * Ensures Supabase EXPO_PUBLIC_* vars are present before `eas build`.
 * Reads .env via @expo/env (same as Expo CLI) and falls back to process.env (CI).
 */
const path = require('path');
const { existsSync } = require('fs');
const { load } = require('@expo/env');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');

load(root);

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const key = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

if (!url || !key) {
  if (!existsSync(envPath)) {
    console.error(
      '\n[eas-env] Missing .env — copy env.example.txt to .env and set EXPO_PUBLIC_SUPABASE_*.\n',
    );
  } else {
    console.error(
      '\n[eas-env] EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be non-empty.\n',
    );
  }
  console.error(
    'GitHub Actions: set repo secrets with the same names.\n' +
      'Local builds: fill us-exe-mobile/.env then rerun eas build.\n',
  );
  process.exit(1);
}

console.log('[eas-env] Supabase config present for EAS build.');
