# Us.exe Mobile

Native companion app for the **[us-exe-web](https://github.com)** dashboard. Both clients share the same Supabase project, couple profile, and realtime data.

Built with **Expo SDK 54**, **React Native 0.81**, and **TypeScript**. Uses a custom **dev client** (`expo-dev-client`) — not Expo Go — because the app ships native modules (notifications, Skia doodles, secure store, etc.).

---

## Table of contents

1. [Features](#features)
2. [Prerequisites](#prerequisites)
3. [Tech stack](#tech-stack)
4. [Project structure](#project-structure)
5. [Environment configuration](#environment-configuration)
6. [Quick start](#quick-start)
7. [Local development](#local-development)
8. [EAS builds & deploy profiles](#eas-builds--deploy-profiles)
9. [Dev vs production (side-by-side)](#dev-vs-production-side-by-side)
10. [CI / GitHub Actions deploys](#ci--github-actions-deploys)
11. [Push notifications](#push-notifications)
12. [End-to-end encryption (E2EE)](#end-to-end-encryption-e2ee)
13. [Backend prerequisites](#backend-prerequisites)
14. [Android notes](#android-notes)
15. [Testing](#testing)
16. [Troubleshooting](#troubleshooting)
17. [Related docs](#related-docs)

---

## Features

The dashboard is organized as **sessions** opened from a radial orbit launcher (no bottom tab bar):

| Session | Module | What it does |
|---------|--------|--------------|
| **Desk** | `GoalsModule` | Shared todos, goals, doodle canvas (Skia), date diary |
| **Wall** | `MemoriesModule` | Polaroid photo wall — upload, stack, tap-through |
| **Notes** | `NotesComposerModule` | Sticky notes composer + partner tray overlay |
| **Jam** | `JamModule` | Shared listening / watch links (Spotify, Meet, etc.) |
| **Letter** | `LetterModule` | Flip-card love letters (3D `rotateY` animation) |
| **Sparks** | `SparksModule` | Buzz, love-you, need-hugs — haptics, sounds, push |

Cross-cutting behavior:

- **Moods** — bottom-right orb cluster (`MoodPickerOrb`), synced with web
- **Realtime** — Supabase channels for couple sync (`useCoupleRealtime`, `network.ts`)
- **Vibe theme** — gradient room background reacts to partner moods
- **Push** — remote sparks & sticky notes when the app is killed (Expo Push + FCM)
- **E2EE** — couple content encrypted client-side; compatible with web envelope format

---

## Prerequisites

| Tool | Version / notes |
|------|-----------------|
| **Node.js** | 20 LTS (matches CI) |
| **npm** | Comes with Node |
| **Expo account** | [expo.dev](https://expo.dev) — free tier works for internal APKs |
| **Supabase** | Dev/staging project + production project (or one project for solo testing) |
| **Android** | Physical device recommended; USB debugging for `adb` |
| **EAS CLI** | Included as devDependency — use `npx eas-cli` |

Optional:

- **Firebase** — required for Android push on preview/production builds ([`PUSH_SETUP.md`](./PUSH_SETUP.md))
- **macOS** — needed for local iOS simulator builds; otherwise use EAS for iOS

---

## Tech stack

| Layer | Libraries |
|-------|-----------|
| Runtime | Expo 54, React 19, React Native 0.81 |
| Backend | `@supabase/supabase-js` 2.106 (CJS bundle via `metro.config.js`) |
| Navigation / UI | Custom radial nav, `expo-linear-gradient`, `expo-blur` |
| Gestures / animation | `react-native-gesture-handler`, `react-native-reanimated` |
| Drawing | `@shopify/react-native-skia` |
| Crypto | `@noble/ciphers`, `@noble/hashes`, `expo-crypto`, `expo-secure-store` |
| Media | `expo-image-picker`, `expo-media-library`, `expo-file-system` |
| Notifications | `expo-notifications`, `expo-device` |
| Testing | Vitest (`src/crypto/envelope.test.ts`) |
| Builds | EAS Build (`eas.json` profiles) |

---

## Project structure

```
us-exe-mobile/
├── App.tsx                 # Root shell: auth gate → dashboard
├── app.json                # Static Expo config (plugins, icons, permissions)
├── app.config.js           # Dynamic config: env files, dev/prod variants
├── eas.json                # EAS build profiles
├── metro.config.js         # Supabase CJS + OTEL stub for Hermes
├── index.ts                # Entry: gesture-handler, reanimated, register root
│
├── env.dev.example.txt     # Template → copy to .env.dev
├── env.prod.example.txt    # Template → copy to .env.prod
│
├── scripts/
│   ├── eas-build.cjs       # Push env → EAS cloud, then `eas build`
│   ├── eas-init-dev.cjs    # One-time dev EAS project setup
│   ├── check-eas-env.cjs   # Validate env file before CI/local EAS build
│   └── read-env-file.cjs   # Parse KEY=VALUE from dotenv files
│
├── .github/workflows/
│   ├── deploy-preview.yml  # Tag on main → preview APK + QR
│   └── deploy-dev-apk.yml  # Manual dev APK build
│
└── src/
    ├── api/
    │   ├── network.ts          # Main data layer (web NetworkUtils port)
    │   ├── sparks.ts           # Sparks CRUD + realtime subscription
    │   ├── pushTokens.ts       # Supabase user_push_tokens upsert
    │   └── e2eeBoundary.ts     # Encrypted storage download helpers
    ├── cache/                  # In-memory URL + photo display caches
    ├── components/             # UI modules, radial nav, sparks, doodles
    ├── constants/
    │   ├── env.ts              # SUPABASE_URL, keys, EXPO_CREDENTIALS_URL
    │   └── sparkSounds.ts      # Notification sound asset map
    ├── context/
    │   ├── AppContext.tsx      # Auth, couple profile, push registration
    │   ├── MoodContext.tsx     # Partner mood sync
    │   └── SparksContext.tsx   # Buzz / hugs state machine
    ├── crypto/                 # E2EE envelope, CEK fetch, migration
    ├── hooks/                  # Realtime, doodle canvas, vibe theme, push deep links
    ├── lib/
    │   ├── supabase.ts         # Supabase client (AsyncStorage auth)
    │   ├── pushTokens.ts       # Expo push token registration flow
    │   ├── easProjectId.ts     # Read EAS projectId from app config extra
    │   ├── notifications.ts    # Local notification helpers
    │   └── sparkNotifications.ts
    ├── screens/
    │   ├── LoginScreen.tsx
    │   └── DashboardScreen.tsx # Session router + providers
    ├── types/                  # Sparks, doodle, push registration types
    └── utils/                  # Theme, moods, jam sessions, haptics
```

**Config flow:** `app.config.js` reads `.env.dev` or `.env.prod` (based on `APP_ENV` / `EXPO_PUBLIC_ENV`), injects Supabase URL/key and EAS project ID into `expo.extra`, and picks the correct Android package + `google-services` file. At runtime, `src/constants/env.ts` reads `EXPO_PUBLIC_*` (Metro inlines these) with a fallback to `Constants.expoConfig.extra`.

---

## Environment configuration

All secrets and service URLs live in **git-ignored** env files. Nothing sensitive is hardcoded in source.

### Files

| File | When it is used |
|------|-----------------|
| `.env.dev` | `npm run start:dev`, EAS **development** profile, dev CI workflow |
| `.env.prod` | EAS **preview** / **production** profiles, preview CI workflow |
| `.env` | Optional fallback for plain `npm start` / `expo start` |

### Variables

| Variable | Required for | Description |
|----------|--------------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | All builds | Supabase project URL (Settings → API) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | All builds | Supabase anon / publishable key |
| `EAS_PROJECT_ID` | Preview & production EAS | Production Expo project UUID |
| `EAS_PROJECT_ID_DEV` | Development EAS | Separate dev Expo project UUID |
| `EXPO_OWNER` | Push setup links | Expo account username (`expo.dev/accounts/<owner>/…`) |

`EXPO_PUBLIC_*` vars are inlined into the JS bundle at build time. `EAS_PROJECT_ID*` and `EXPO_OWNER` are read by `app.config.js` at native config time (via `scripts/read-env-file.cjs`).

### Setup

```bash
cp env.dev.example.txt .env.dev
cp env.prod.example.txt .env.prod
```

Fill values from **Supabase → Project Settings → API** for each project.

Get EAS project IDs from **expo.dev → your project → Project settings**.

---

## Quick start

```bash
cd us-exe-mobile
npm install

# 1. Configure env (see above)
cp env.dev.example.txt .env.dev
# edit .env.dev with dev Supabase URL + anon key

# 2. Install a development build on your phone (first time only)
npx eas-cli login
npm run eas:init:dev          # one-time: creates dev EAS project, saves EAS_PROJECT_ID_DEV
npm run eas:dev:android       # cloud build → install APK

# 3. Daily dev loop
npm run start:dev             # Metro bundler — open project from dev launcher on phone
```

You need a **development build** installed before `start:dev` works. Expo Go is **not** supported (custom native code).

---

## Local development

There are three common ways to run the app locally. Pick based on whether you need native rebuilds.

### Option A — Dev client + Metro (recommended)

Best for day-to-day JS/TS work. Native code changes require a new EAS build.

```bash
npm run start:dev
```

- Loads `.env.dev` via `DOTENV_CONFIG_PATH` and `APP_ENV=development`
- Expects a **development** APK already installed (`npm run eas:dev:android`)
- Shake device or use dev menu for reload, debugging

### Option B — Plain Expo start

```bash
npm start
# or: npx expo start --dev-client
```

Uses `.env` if present (fallback). Prefer **Option A** so you always hit the dev Supabase project.

### Option C — Local native run (Gradle)

Generates / uses the `android/` folder and builds on your machine:

```bash
npx expo prebuild --platform android   # when native config changes
npm run android                        # expo run:android
```

**SDK path:** if Gradle reports *SDK location not found*, create `android/local.properties`:

```properties
sdk.dir=/home/YOUR_USER/Android/Sdk
```

Or set `ANDROID_HOME` / `ANDROID_SDK_ROOT` in your shell profile. Re-run `prebuild` only when plugins or `app.json` native config change.

### Option D — iOS simulator (macOS only)

```bash
npm run eas:dev:ios
# or local: npm run ios
```

EAS profile `development-simulator` in `eas.json` targets the iOS simulator.

---

## EAS builds & deploy profiles

All EAS commands go through `scripts/eas-build.cjs`, which:

1. Validates the correct env file (`.env.dev` or `.env.prod`)
2. Runs `eas env:push` to sync vars to the EAS cloud environment
3. Starts `eas build` with the chosen profile

### npm scripts

| Command | EAS profile | Output | Env file | Use case |
|---------|-------------|--------|----------|----------|
| `npm run eas:dev:android` | `development` | APK (dev client) | `.env.dev` | Daily dev on device |
| `npm run eas:dev:ios` | `development` | Dev client | `.env.dev` | iOS dev |
| `npm run eas:preview:android` | `preview` | APK (release-like) | `.env.prod` | QA / partner testing |
| `npm run eas:preview:android:clean` | `preview` | APK (clean cache) | `.env.prod` | After native config / FCM changes |
| `npm run eas:prod:android` | `production` | AAB (Play Store) | `.env.prod` | Store submission |

### Profile details (`eas.json`)

| Profile | `APP_ENV` | Dev client | Distribution | Android output |
|---------|-----------|------------|--------------|----------------|
| `development` | `development` | Yes | internal | APK |
| `development-simulator` | `development` | Yes | internal | iOS simulator |
| `preview` | `preview` | No | internal | APK |
| `production` | `production` | No | store | AAB |

Preview and production builds set `EXPO_PUBLIC_ENV=prod`, so `app.config.js` loads `.env.prod` and points at the **production** Supabase project.

### First-time EAS setup (production)

```bash
npx eas-cli login

# Fill .env.prod (Supabase + EAS_PROJECT_ID + EXPO_OWNER)
cp env.prod.example.txt .env.prod

# Link production project if needed
npx eas-cli init    # only if you have not created us-exe-mobile on expo.dev yet

npm run eas:preview:android
```

### First-time EAS setup (development)

```bash
cp env.dev.example.txt .env.dev
# Fill dev Supabase credentials

npm run eas:init:dev    # Creates slug us-exe-mobile-dev, writes EAS_PROJECT_ID_DEV

npm run eas:dev:android
npm run start:dev       # Pair Metro with installed dev APK
```

`eas:init:dev` cannot auto-write into dynamic `app.config.js`, so the script parses CLI output and saves `EAS_PROJECT_ID_DEV` to `.env.dev`. If it fails, create the project manually on expo.dev (slug `us-exe-mobile-dev`) and paste the UUID into `.env.dev`.

### Manual EAS (without npm script)

```bash
# Ensure .env.prod exists and is filled
node scripts/check-eas-env.cjs .env.prod
npx eas-cli env:push preview --path .env.prod --force
npx eas-cli build --profile preview --platform android
```

Pass extra flags after the profile: `npm run eas:preview:android -- --clear-cache`

### Uninstall APKs

```bash
npm run android:uninstall       # production package
npm run android:uninstall:dev   # dev package only
```

---

## Dev vs production (side-by-side)

Dev and production are **fully isolated** — different app icon name, package, Supabase, and Expo project. Install both on one phone without overwriting.

| | Production (`preview` / `production`) | Development (`development`) |
|--|--|--|
| Home screen name | **Us.exe Mobile** | **Us.exe Dev** |
| Android package | `com.anonymous.usexemobile` | `com.anonymous.usexemobile.dev` |
| iOS bundle | `com.anonymous.usexemobile` | `com.anonymous.usexemobile.dev` |
| URL scheme | `usexe` | `usexe-dev` |
| EAS slug | `us-exe-mobile` | `us-exe-mobile-dev` |
| Env file | `.env.prod` | `.env.dev` |
| EAS project ID var | `EAS_PROJECT_ID` | `EAS_PROJECT_ID_DEV` |
| Supabase | Production project | Dev / staging project |
| `google-services` | `google-services.json` | `google-services.dev.json` (optional) |

---

## CI / GitHub Actions deploys

### Preview APK (tag on `main`)

Workflow: `.github/workflows/deploy-preview.yml`

**Triggers:**

| Trigger | Builds |
|---------|--------|
| Push tag `v*` on `main` (e.g. `v1.0.0`) | Tagged commit |
| Manual **Run workflow** | Latest `main` |

**`main` does not auto-build.** Tags on feature branches are rejected.

```bash
git checkout main && git pull
git tag v1.0.0
git push origin v1.0.0
```

Open the finished Actions job → **Summary** tab for install QR code and download link.

### Dev APK (manual)

Workflow: `.github/workflows/deploy-dev-apk.yml`  
Trigger: **Actions → Deploy dev APK (EAS) → Run workflow**

### GitHub secrets

Set in **Settings → Secrets and variables → Actions**:

| Secret | Used by | Purpose |
|--------|---------|---------|
| `EXPO_TOKEN` | Both | [expo.dev](https://expo.dev) → Account → Access tokens |
| `EXPO_PUBLIC_SUPABASE_URL` | Preview | Production Supabase URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Preview | Production anon key |
| `EAS_PROJECT_ID` | Preview | Production EAS project UUID |
| `EXPO_OWNER` | Both | Expo account username |
| `EXPO_PUBLIC_SUPABASE_URL_DEV` | Dev | Dev Supabase URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY_DEV` | Dev | Dev anon key |
| `EAS_PROJECT_ID_DEV` | Dev | Dev EAS project UUID |

FCM / `google-services.json` must be configured on Expo before push works on preview builds — see [`PUSH_SETUP.md`](./PUSH_SETUP.md).

---

## Push notifications

Remote **sparks** (buzz, love-you, need-hugs) and **sticky notes** when the app is force-stopped require:

1. App saves Expo push token to Supabase `user_push_tokens` on login
2. FCM V1 credentials on Expo + `google-services.json` in the APK
3. Edge functions `send-spark-push` / `send-sticky-note-push` + DB webhooks

**In-app behavior:**

- Foreground: realtime + local notifications / tray overlay
- Background: Expo push via webhooks
- Red banner (`PushSetupBanner`) if token registration fails — links to Expo credentials when `EXPO_OWNER` is set

Full setup, debug `adb logcat` commands, and test steps: **[`PUSH_SETUP.md`](./PUSH_SETUP.md)**

Dev push (optional): register `com.anonymous.usexemobile.dev` in Firebase, add `google-services.dev.json`, upload FCM to the **dev** Expo project. Without it, dev builds work — push is just disabled.

---

## End-to-end encryption (E2EE)

Couple content is encrypted client-side with a per-couple key (CEK) from the `get-couple-cek` edge function. Mobile uses the same envelope format as web (`enc:v1:` text + AES-GCM JSON blobs).

**Encrypted:** letters, sticky notes, goals, diary entries, jam links, triggers, doodle strokes, photo bytes, realtime broadcast payloads.

**First login after deploy:** `prefetchCoupleData` fetches the CEK and migrates legacy plaintext rows in the background. Until the backend is ready, the app still works — content stays plaintext (dual-read).

```bash
npm test    # envelope round-trip unit tests
```

Manual cross-client checklist: `src/crypto/e2ee.checklist.ts`

---

## Backend prerequisites

Deploy on the Supabase project you are testing against (dev first, then prod):

| Piece | Location |
|-------|----------|
| Couples / shared tables | Same schema as `us-exe-web` |
| `get-couple-cek` edge function | `E2EE_MASTER_KEY` env on function |
| `send-spark-push` | + webhook on `sparks` INSERT |
| `send-sticky-note-push` | + webhook on `sticky_notes` INSERT |
| Push token table | `us-exe-backend/supabase/sparks-push-setup.sql` |
| Sticky note push SQL | `us-exe-backend/supabase/sticky-notes-push-setup.sql` |

Auth: same email/password accounts as web. The user must exist in the `couples` table with both partner IDs set.

---

## Android notes

### Hermes + Supabase

`@supabase/supabase-js@2.106.x` ESM uses dynamic `import()`, which Hermes rejects. `metro.config.js` forces the CJS bundle and stubs `@opentelemetry/api`. Keep this config if you upgrade Supabase until they ship a `"react-native"` export ([supabase-js#2380](https://github.com/supabase/supabase-js/issues/2380)).

### Build targets

From `expo-build-properties` in `app.json`:

- **minSdkVersion:** 24
- **ABIs:** `armeabi-v7a`, `arm64-v8a` (covers devices like Samsung Galaxy A05 / Helio G85)

### Samsung install issues

If you see *App not installed*, see **[`SAMSUNG_INSTALL.md`](./SAMSUNG_INSTALL.md)** — ghost installs, Secure Folder, unknown sources, and `adb` diagnostics.

### Permissions

Configured in `app.json`:

- `POST_NOTIFICATIONS` (Android 13+)
- Photo library (doodle save) via `expo-media-library`
- Camera / gallery via `expo-image-picker` (wall & diary uploads)

---

## Testing

```bash
npm test
```

Runs Vitest (`src/crypto/envelope.test.ts` — encrypt/decrypt round-trip).

There is no Detox / Maestro E2E suite yet. Use `src/crypto/e2ee.checklist.ts` for manual cross-client E2EE verification.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| *Missing Supabase config* on launch | Fill `EXPO_PUBLIC_*` in `.env.dev` / `.env.prod`; rebuild if using EAS |
| Dev launcher cannot connect to Metro | Same Wi‑Fi; `npm run start:dev`; check firewall |
| `EAS_PROJECT_ID_DEV must be set` | Run `npm run eas:init:dev` or paste UUID into `.env.dev` |
| `EAS_PROJECT_ID must be set` | Add production UUID to `.env.prod` |
| Push red banner / `no_project_id` | Rebuild with correct EAS project ID in env |
| `Default FirebaseApp is not initialized` | APK built without `google-services.json` — see [`PUSH_SETUP.md`](./PUSH_SETUP.md) |
| `getExpoPushTokenAsync failed` | Upload FCM V1 to Expo credentials, rebuild with `:clean` |
| *No couple profile* after login | User not in `couples` table — pair IDs in Supabase |
| Gradle *SDK location not found* | `android/local.properties` or `ANDROID_HOME` — see [Local native run](#option-c--local-native-run-gradle) |
| Tag deploy rejected | Tag must be on `main`, not a feature branch |

**Push debug:**

```bash
adb logcat | grep -iE '\[push\]|\[pushTokens\]'
```

---

## UI & animation notes

- **Navigation:** `RadialSessionNav` — arc launcher swaps `SessionStage` modules
- **Lists:** `FlatList` inside bounded stage areas (not full-screen paging)
- **Letter flip:** built-in `Animated` API (`perspective` + `rotateY`) for Expo compatibility
- **Gestures / springs:** `react-native-reanimated` + `react-native-gesture-handler` (doodle canvas)
- **Framer Motion** is web-only and not used here

---

## Related docs

| Doc | Contents |
|-----|----------|
| [`PUSH_SETUP.md`](./PUSH_SETUP.md) | FCM, `google-services.json`, webhooks, device testing |
| [`SAMSUNG_INSTALL.md`](./SAMSUNG_INSTALL.md) | Samsung A05 install failures |
| [`env.dev.example.txt`](./env.dev.example.txt) | Dev env template |
| [`env.prod.example.txt`](./env.prod.example.txt) | Prod env template |

---

## License

Private — part of the Us.exe monorepo.
