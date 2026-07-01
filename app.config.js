const path = require('path');
const { existsSync } = require('fs');
const { load } = require('@expo/env');
const { readEnvFileVars } = require('./scripts/read-env-file.cjs');

const root = __dirname;

const PROD_ANDROID_PACKAGE = 'com.anonymous.usexemobile';
const DEV_ANDROID_PACKAGE = 'com.anonymous.usexemobile.dev';
const PROD_IOS_BUNDLE = 'com.anonymous.usexemobile';
const DEV_IOS_BUNDLE = 'com.anonymous.usexemobile.dev';

function isDevBuild() {
  return (
    process.env.APP_ENV === 'development' ||
    process.env.EXPO_PUBLIC_ENV === 'dev'
  );
}

function isProdLikeBuild() {
  return (
    process.env.APP_ENV === 'production' ||
    process.env.APP_ENV === 'preview' ||
    process.env.EXPO_PUBLIC_ENV === 'prod'
  );
}

function resolveEnvFile() {
  if (process.env.DOTENV_CONFIG_PATH) {
    return path.isAbsolute(process.env.DOTENV_CONFIG_PATH)
      ? process.env.DOTENV_CONFIG_PATH
      : path.join(root, process.env.DOTENV_CONFIG_PATH);
  }
  if (isDevBuild()) {
    const devPath = path.join(root, '.env.dev');
    if (existsSync(devPath)) return devPath;
  }
  if (isProdLikeBuild()) {
    const prodPath = path.join(root, '.env.prod');
    if (existsSync(prodPath)) return prodPath;
    return path.join(root, '.env');
  }
  return path.join(root, '.env');
}

const envPath = resolveEnvFile();
const fileVars = readEnvFileVars(envPath);
if (existsSync(envPath)) {
  load(root, { silent: false, path: envPath });
}

const appJson = require('./app.json');

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? fileVars.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? fileVars.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const expoOwner = (process.env.EXPO_OWNER ?? fileVars.EXPO_OWNER ?? '').trim();
const prodProjectId = (
  process.env.EAS_PROJECT_ID ?? fileVars.EAS_PROJECT_ID ?? ''
).trim();
const devProjectId = (
  process.env.EAS_PROJECT_ID_DEV ?? fileVars.EAS_PROJECT_ID_DEV ?? ''
).trim();

function expoCredentialsUrl(owner, slug) {
  if (!owner || !slug) return '';
  return `https://expo.dev/accounts/${owner}/projects/${slug}/credentials`;
}

function resolveGoogleServicesFile(androidPackage) {
  if (androidPackage === DEV_ANDROID_PACKAGE) {
    const devFile = path.join(root, 'google-services.dev.json');
    if (existsSync(devFile)) return './google-services.dev.json';
    return undefined;
  }
  return appJson.expo.android?.googleServicesFile ?? './google-services.json';
}

function androidConfig(androidPackage, baseAndroid) {
  const { googleServicesFile: _ignored, package: _pkg, ...rest } = baseAndroid ?? {};
  const googleServicesFile = resolveGoogleServicesFile(androidPackage);
  return {
    ...rest,
    package: androidPackage,
    ...(googleServicesFile ? { googleServicesFile } : {}),
  };
}

module.exports = () => {
  const dev = isDevBuild();
  const base = appJson.expo;

  if (dev) {
    const { eas: _prodEas, ...baseExtra } = base.extra ?? {};

    if (!devProjectId && process.env.EAS_BUILD === 'true') {
      console.warn(
        '[app.config] EAS_PROJECT_ID_DEV is not set — run `npm run eas:init:dev` and add the ID to .env.dev.',
      );
    }

    const devSlug = 'us-exe-mobile-dev';

    return {
      expo: {
        ...base,
        name: 'Us.exe Dev',
        slug: devSlug,
        scheme: 'usexe-dev',
        ...(expoOwner ? { owner: expoOwner } : {}),
        ios: {
          ...base.ios,
          bundleIdentifier: DEV_IOS_BUNDLE,
        },
        android: androidConfig(DEV_ANDROID_PACKAGE, base.android),
        extra: {
          ...baseExtra,
          supabaseUrl,
          supabaseAnonKey,
          expoCredentialsUrl: expoCredentialsUrl(expoOwner, devSlug),
          appEnv: 'development',
          ...(devProjectId ? { eas: { projectId: devProjectId } } : {}),
        },
      },
    };
  }

  const prodSlug = base.slug ?? 'us-exe-mobile';

  if (!prodProjectId && process.env.EAS_BUILD === 'true') {
    console.warn(
      '[app.config] EAS_PROJECT_ID is not set — add it to .env.prod (see env.prod.example.txt).',
    );
  }

  return {
    expo: {
      ...base,
      name: 'Us.exe Mobile',
      slug: prodSlug,
      scheme: 'usexe',
      ...(expoOwner ? { owner: expoOwner } : {}),
      ios: {
        ...base.ios,
        bundleIdentifier: PROD_IOS_BUNDLE,
      },
      android: androidConfig(PROD_ANDROID_PACKAGE, base.android),
      extra: {
        ...base.extra,
        supabaseUrl,
        supabaseAnonKey,
        expoCredentialsUrl: expoCredentialsUrl(expoOwner, prodSlug),
        appEnv: 'production',
        ...(prodProjectId ? { eas: { projectId: prodProjectId } } : {}),
      },
    },
  };
};
