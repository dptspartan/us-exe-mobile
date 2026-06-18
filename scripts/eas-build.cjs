/**
 * Push .env Supabase vars to the EAS cloud environment, then run eas build.
 * Required because preview/production profiles resolve the EAS "preview" environment,
 * which does NOT automatically read your local .env file.
 */
const path = require('path');
const { existsSync } = require('fs');
const { spawnSync } = require('child_process');
const { load } = require('@expo/env');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');

const PROFILE_TO_ENV = {
  preview: 'preview',
  production: 'production',
  development: 'development',
};

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function fail(msg) {
  console.error(`\n[eas-build] ${msg}\n`);
  process.exit(1);
}

const profile = process.argv[2];
const buildArgs = process.argv.slice(3);

if (!profile || !PROFILE_TO_ENV[profile]) {
  fail('Usage: node scripts/eas-build.cjs <preview|production|development> [eas build flags...]');
}

load(root);

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const key = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

if (!existsSync(envPath)) {
  fail('Missing .env — copy env.example.txt to .env and set EXPO_PUBLIC_SUPABASE_*.');
}
if (!url || !key) {
  fail('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be non-empty in .env.');
}

const environment = PROFILE_TO_ENV[profile];

console.log(`[eas-build] Pushing .env → EAS "${environment}" environment...`);
run('npx', ['eas-cli', 'env:push', environment, '--path', '.env', '--force']);

console.log(`[eas-build] Starting EAS build (profile: ${profile})...`);
run('npx', ['eas-cli', 'build', '--profile', profile, ...buildArgs]);
