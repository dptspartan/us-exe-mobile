const path = require('path');
const { load } = require('@expo/env');

// Load .env before config is evaluated (local dev + EAS CLI on build submit).
load(path.join(__dirname));

const appJson = require('./app.json');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

module.exports = () => ({
  expo: {
    ...appJson.expo,
    extra: {
      ...appJson.expo.extra,
      supabaseUrl,
      supabaseAnonKey,
    },
  },
});
