const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

const supabaseRoot = path.join(projectRoot, 'node_modules/@supabase/supabase-js/dist');
const otelStub = path.join(projectRoot, 'src/shims/opentelemetry-api.js');

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@opentelemetry/api': otelStub,
};

/**
 * @supabase/supabase-js@2.106.x ESM (index.mjs) uses dynamic import() for OTEL, which Hermes rejects.
 * Force the CJS build (require-based) for React Native. See: supabase/supabase-js#2380
 */
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@supabase/supabase-js') {
    return { type: 'sourceFile', filePath: path.join(supabaseRoot, 'index.cjs') };
  }
  if (moduleName === '@supabase/supabase-js/cors') {
    return { type: 'sourceFile', filePath: path.join(supabaseRoot, 'cors.cjs') };
  }
  if (moduleName === '@opentelemetry/api') {
    return { type: 'sourceFile', filePath: otelStub };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
