/**
 * Create the dev EAS project (slug: us-exe-mobile-dev) without touching production.
 * With dynamic app.config.js, EAS cannot auto-write the project ID — this script
 * captures it from CLI output and saves EAS_PROJECT_ID_DEV to .env.dev.
 */
const path = require('path');
const { existsSync, readFileSync, writeFileSync } = require('fs');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const envDevPath = path.join(root, '.env.dev');
const PROD_PROJECT_ID = 'ef0ca527-53b7-4e6a-bde9-afde99890794';

const devEnv = {
  APP_ENV: 'development',
  EXPO_PUBLIC_ENV: 'dev',
  DOTENV_CONFIG_PATH: '.env.dev',
};

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function readEnvDevProjectId() {
  if (!existsSync(envDevPath)) return '';
  const match = readFileSync(envDevPath, 'utf8').match(/^EAS_PROJECT_ID_DEV=(.+)$/m);
  return match?.[1]?.trim() ?? '';
}

function upsertEnvDev(projectId) {
  if (!existsSync(envDevPath)) {
    console.error('\n[eas-init-dev] Missing .env.dev — copy env.dev.example.txt first.\n');
    process.exit(1);
  }

  let content = readFileSync(envDevPath, 'utf8');
  if (/^EAS_PROJECT_ID_DEV=/m.test(content)) {
    content = content.replace(/^EAS_PROJECT_ID_DEV=.*$/m, `EAS_PROJECT_ID_DEV=${projectId}`);
  } else {
    content = content.trimEnd() + `\nEAS_PROJECT_ID_DEV=${projectId}\n`;
  }
  writeFileSync(envDevPath, content);
}

function runInit() {
  return spawnSync('npx', ['eas-cli', 'init', '--force'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...devEnv },
  });
}

function extractProjectId(output) {
  const linked = output.match(/linked \(ID:\s*([0-9a-f-]{36})\)/i);
  if (linked?.[1] && linked[1] !== PROD_PROJECT_ID) return linked[1];

  const created = output.match(/project ID[:\s]+([0-9a-f-]{36})/i);
  if (created?.[1] && created[1] !== PROD_PROJECT_ID) return created[1];

  const uuids = [...output.matchAll(new RegExp(UUID_RE, 'gi'))].map((m) => m[0]);
  return uuids.find((id) => id !== PROD_PROJECT_ID) ?? '';
}

const existing = readEnvDevProjectId();
if (existing) {
  console.log(`[eas-init-dev] EAS_PROJECT_ID_DEV already set in .env.dev: ${existing}`);
  console.log('[eas-init-dev] Dev builds: npm run eas:dev:android\n');
  process.exit(0);
}

if (!existsSync(envDevPath)) {
  console.error('\n[eas-init-dev] Missing .env.dev — copy env.dev.example.txt first.\n');
  process.exit(1);
}

console.log('[eas-init-dev] Creating dev EAS project (Us.exe Dev / us-exe-mobile-dev)...');
console.log('[eas-init-dev] Production project stays on us-exe-mobile — do not reuse its ID.\n');

const result = runInit();
const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
if (output.trim()) process.stdout.write(output);

const projectId = extractProjectId(output);
if (!projectId) {
  console.error(`
[eas-init-dev] Could not detect a new dev project ID.

Create it manually:
  1. Open https://expo.dev/accounts/dptspartan/projects
  2. New project → slug "us-exe-mobile-dev"
  3. Copy the project ID into .env.dev:
     EAS_PROJECT_ID_DEV=<paste-id-here>

Or run (logged in to Expo):
  APP_ENV=development EXPO_PUBLIC_ENV=dev npx eas-cli init --force
  then paste the printed ID into .env.dev
`);
  process.exit(1);
}

upsertEnvDev(projectId);

console.log(`\n[eas-init-dev] Saved EAS_PROJECT_ID_DEV=${projectId} to .env.dev`);
if (result.status !== 0) {
  console.log(
    '[eas-init-dev] eas init could not write app.config.js — that is expected with dynamic config.',
  );
}
console.log('[eas-init-dev] Dev builds: npm run eas:dev:android\n');
