/**
 * Parse KEY=VALUE lines from a dotenv file.
 * @expo/env only inlines EXPO_PUBLIC_* — use this for EAS_PROJECT_ID_DEV etc.
 */
const { existsSync, readFileSync } = require('fs');

function readEnvFileVars(filePath) {
  if (!existsSync(filePath)) return {};
  const vars = {};
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return vars;
}

module.exports = { readEnvFileVars };
