/**
 * Ensures Supabase EXPO_PUBLIC_* vars are present before `eas build`.
 * Usage: node scripts/check-eas-env.cjs [path-to-env-file]
 */
const path = require('path');
const { existsSync } = require('fs');
const { load } = require('@expo/env');
const { readEnvFileVars } = require('./read-env-file.cjs');

const root = path.join(__dirname, '..');
const envFile = process.argv[2] || '.env.prod';
const envPath = path.isAbsolute(envFile) ? envFile : path.join(root, envFile);

if (!existsSync(envPath)) {
  console.error(`\n[eas-env] Missing ${envFile} — copy env.prod.example.txt (or env.dev.example.txt) first.\n`);
  process.exit(1);
}

load(root, { silent: true, path: envPath });
const fileVars = readEnvFileVars(envPath);

const url = (
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? fileVars.EXPO_PUBLIC_SUPABASE_URL ?? ''
).trim();
const key = (
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? fileVars.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''
).trim();
const easProjectId = (
  process.env.EAS_PROJECT_ID ?? fileVars.EAS_PROJECT_ID ?? ''
).trim();
const expoOwner = (process.env.EXPO_OWNER ?? fileVars.EXPO_OWNER ?? '').trim();

if (!url || !key) {
  console.error(
    `\n[eas-env] EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be non-empty in ${envFile}.\n`,
  );
  console.error(
    'GitHub Actions: set repo secrets with the same names.\n' +
      `Local builds: fill us-exe-mobile/${envFile} then rerun eas build.\n`,
  );
  process.exit(1);
}

const isProdEnvFile = envFile.includes('prod') || envFile === '.env';
if (isProdEnvFile && !easProjectId) {
  console.error(
    `\n[eas-env] EAS_PROJECT_ID must be non-empty in ${envFile} for preview/production builds.\n`,
  );
  process.exit(1);
}

if (!expoOwner) {
  console.warn(`[eas-env] EXPO_OWNER is not set in ${envFile} — Expo credentials links in the app will be hidden.`);
}

console.log(`[eas-env] Supabase config present (${envFile}).`);
