/**
 * Push env-file Supabase vars to the EAS cloud environment, then run eas build.
 */
const path = require('path');
const { existsSync } = require('fs');
const { spawnSync } = require('child_process');
const { load } = require('@expo/env');
const { readEnvFileVars } = require('./read-env-file.cjs');

const root = path.join(__dirname, '..');

const PROFILE_TO_ENV = {
  preview: 'preview',
  production: 'production',
  development: 'development',
};

const PROFILE_TO_ENV_FILE = {
  development: '.env.dev',
  preview: '.env.prod',
  production: '.env.prod',
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

const envFile = PROFILE_TO_ENV_FILE[profile];
const envPath = path.join(root, envFile);

if (!existsSync(envPath)) {
  const example = profile === 'development' ? 'env.dev.example.txt' : 'env.prod.example.txt';
  fail(`Missing ${envFile} — copy ${example} to ${envFile}.`);
}

process.env.DOTENV_CONFIG_PATH = envFile;
load(root, { silent: false, path: envPath });

const fileVars = readEnvFileVars(envPath);

const url = (
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? fileVars.EXPO_PUBLIC_SUPABASE_URL ?? ''
).trim();
const key = (
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? fileVars.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''
).trim();
const devProjectId = (
  process.env.EAS_PROJECT_ID_DEV ?? fileVars.EAS_PROJECT_ID_DEV ?? ''
).trim();

if (!url || !key) {
  fail(`EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be non-empty in ${envFile}.`);
}

if (profile === 'development' && !devProjectId) {
  fail(
    'EAS_PROJECT_ID_DEV must be set in .env.dev — run `npm run eas:init:dev` once to create the dev EAS project.',
  );
}

const environment = PROFILE_TO_ENV[profile];

console.log(`[eas-build] Pushing ${envFile} → EAS "${environment}" environment...`);
run('npx', ['eas-cli', 'env:push', environment, '--path', envFile, '--force']);

console.log(`[eas-build] Starting EAS build (profile: ${profile})...`);
run('npx', ['eas-cli', 'build', '--profile', profile, ...buildArgs]);
