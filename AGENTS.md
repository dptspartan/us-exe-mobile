# AGENTS.md — Us.exe Mobile

**Audience:** AI coding agents and human contributors.  
**Goal:** Every change should match existing patterns, stay compatible with **us-exe-web**, and preserve security, realtime behavior, and EAS deployability.

Read [`README.md`](./README.md) for setup and deploy commands. This file is the **rules of the road**.

---

## Table of contents

1. [Project identity](#1-project-identity)
2. [Golden rules (always)](#2-golden-rules-always)
3. [Architecture](#3-architecture)
4. [DO — required patterns](#4-do--required-patterns)
5. [DON'T — forbidden patterns](#5-dont--forbidden-patterns)
6. [File placement guide](#6-file-placement-guide)
7. [Data & Supabase](#7-data--supabase)
8. [End-to-end encryption (E2EE)](#8-end-to-end-encryption-e2ee)
9. [Realtime & caching](#9-realtime--caching)
10. [UI & components](#10-ui--components)
11. [Notifications & push](#11-notifications--push)
12. [Configuration & secrets](#12-configuration--secrets)
13. [Native code & Expo](#13-native-code--expo)
14. [Testing & verification](#14-testing--verification)
15. [Build, CI & releases](#15-build-ci--releases)
16. [Change checklist](#16-change-checklist)
17. [When unsure](#17-when-unsure)

---

## 1. Project identity

| Fact | Detail |
|------|--------|
| **What** | React Native companion to **us-exe-web** — same Supabase project, couples, realtime tables |
| **Stack** | Expo SDK **54**, React Native **0.81**, TypeScript, Hermes |
| **Runtime** | Custom **dev client** (`expo-dev-client`) — **not Expo Go** |
| **Platforms** | Android-first (APK via EAS); iOS via EAS / macOS local |
| **Auth** | Supabase email/password; user must exist in `couples` with paired partner IDs |
| **Encryption** | Client-side E2EE; envelope format **must match web** (`enc:v1:` + AES-GCM JSON) |

**Expo docs version:** use [Expo SDK 54 docs](https://docs.expo.dev/versions/v54.0.0/) — not v55/v56 unless the project upgrades.

---

## 2. Golden rules (always)

1. **Minimize scope** — smallest correct diff; no drive-by refactors or unrelated files.
2. **Match existing code** — naming, imports, `StyleSheet` placement, error logging style.
3. **Web parity** — schema, E2EE envelopes, table names, and behavior should stay aligned with `us-exe-web` / `us-exe-backend`.
4. **No secrets in source** — URLs, API keys, EAS project IDs, and Expo owner go in **env files** only.
5. **One Supabase client** — `src/lib/supabase.ts` only; never `createClient()` elsewhere.
6. **Data through `networkUtility`** — components/hooks call `src/api/network.ts`, not raw Supabase (exceptions: `api/sparks.ts`, `api/pushTokens.ts`, crypto edge calls).
7. **Dual-read E2EE** — reads must tolerate plaintext *and* encrypted rows until migration completes.
8. **Don't break Metro** — keep `metro.config.js` Supabase CJS + OTEL stub unless upgrading with a verified fix.
9. **Don't break EAS env flow** — builds go through `scripts/eas-build.cjs` and `.env.dev` / `.env.prod`.
10. **Test what you touch** — run `npm test`; for crypto/schema changes, consult `src/crypto/e2ee.checklist.ts`.

---

## 3. Architecture

```
App.tsx
  └── AppProvider (auth, couple, push registration)
        └── MoodProvider
              └── Shell → LoginScreen | DashboardScreen
                    └── SparksProvider (per dashboard)
                          └── Session modules (Desk, Wall, Notes, …)

DashboardScreen
  ├── RadialSessionNav      # session switcher (no tab bar)
  ├── SessionStage          # hosts active module
  ├── MoodPickerOrb
  ├── StickyNotesTray
  └── PushSetupBanner

Data flow:
  Component/Hook → networkUtility | api/sparks | api/pushTokens
                 → supabase (+ e2eeBoundary / crypto)
                 → cache (dataCache, imageUrlCache, photoDisplayCache)
```

**Sessions** are defined in `src/components/sessionTiles.ts` (`SessionId`). Adding a session requires: tile entry, `DashboardScreen` switch case, and a module component.

**Global state** lives in `src/context/` — do not introduce Redux/MobX/Zustand without an explicit project decision.

---

## 4. DO — required patterns

### TypeScript & modules

- Use **functional components** and hooks.
- Export screen/module components as **named functions** (`export function GoalsModule()`).
- Put **`StyleSheet.create` at the bottom** of the file (existing convention).
- Define shared types in `src/types/`; colocate small types in the module if used once.
- Use `useVibeTheme()` and `hexAlpha()` from `src/utils/theme.ts` for colors — keep the dark “room” aesthetic.
- Use `useApp()` for `user`, `coupleId`, `partnerId`; `useMood()` for moods.

### Supabase & API

- Import env via `src/constants/env.ts` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) — never inline URLs or keys.
- Add new table operations to **`networkUtility`** in `src/api/network.ts` (or a focused `src/api/<feature>.ts` if the domain is isolated, like sparks).
- Log errors with **`console.error('[feature]', message)`** — match existing `[realtime]`, `[push]`, `[sparks]` prefixes.
- Use **`useCoupleRealtime(coupleId, table, fetcher)`** when a module needs live updates on a couple-scoped table.
- Invalidate cache before refetch: `invalidateCoupleTableCache(coupleId, table)` (handled inside `useCoupleRealtime`).

### E2EE

- Encrypt on write with `maybeEncryptText` / `maybeEncryptJson` from `src/crypto/fields.ts`.
- Decrypt on read with `maybeDecryptText` / `maybeDecryptJson` or `decryptRowTexts`.
- Photo/binary paths go through **`src/api/e2eeBoundary.ts`** (`encryptBytes`, `resolvePhotoDisplayUrl`).
- CEK lifecycle: `ensureCoupleKey` / `clearCoupleKey` in `src/crypto/coupleKey.ts` — tied to login/logout in `network.ts`.

### Realtime

- Couple-wide sync uses the shared channel in `network.ts` (`couple-sync:${coupleId}`) — postgres changes + broadcast for doodles.
- Reconnect with exponential backoff is already implemented — don't add duplicate channels for the same table.
- Debounce burst refreshes (~280ms) like `useCoupleRealtime`.

### UI

- Long lists: **`FlatList` or `ScrollView` inside a bounded stage** — don't page the entire screen.
- Full-bleed exception: **Sparks** session (`SESSION_STAGE_PADDING_X.sparks === 0`).
- Haptics: `src/utils/sparkHaptics.ts` for spark actions.
- Deep links from push: `usePushDeepLink` + `SPARK_DEEP_LINK_SCREEN` in `types/sparks.ts`.

### Config & builds

- Copy `env.dev.example.txt` → `.env.dev` and `env.prod.example.txt` → `.env.prod` for new machines.
- Local dev: **`npm run start:dev`** (loads `.env.dev`, dev client).
- EAS: **`npm run eas:dev:android`** / **`eas:preview:android`** — never raw `eas build` without env push unless debugging scripts.
- Native config changes (plugins, permissions, `google-services`): require **rebuild**, document in PR.

### Git & security

- **Never commit:** `.env`, `.env.dev`, `.env.prod`, `google-services.json`, `google-services.dev.json`, `*firebase-adminsdk*.json`, keystores.
- Update **`env.*.example.txt`** when adding new env vars (placeholders only).

---

## 5. DON'T — forbidden patterns

### Security & config

| ❌ Don't | Why |
|----------|-----|
| Hardcode Supabase URL, anon key, EAS project ID, Expo owner | Use env + `app.config.js` → `extra` |
| Commit secrets or Firebase JSON | Gitignored; upload FCM to Expo only |
| Create a second `supabase` client | Breaks auth session consistency |
| Store CEK in AsyncStorage or plain state | Use existing secure-store flow in crypto layer |
| Log full push tokens or CEK material | Prefix-only logging exists (`token.slice(0, 28)`) |

### Architecture

| ❌ Don't | Why |
|----------|-----|
| Call `supabase.from()` directly from components | Bypasses E2EE, cache, and web parity in `network.ts` |
| Add Redux / global event buses | Project uses React context + `networkUtility` |
| Duplicate realtime channels per component | Use `useCoupleRealtime` / shared couple channel |
| Invoke `send-spark-push` from client on insert | Webhook on `sparks` INSERT already sends push; duplicates notifications |
| Add Framer Motion | DOM-only; use Reanimated / built-in `Animated` |
| Target Expo Go | Native modules (notifications, Skia, secure store) require dev client |

### Code quality

| ❌ Don't | Why |
|----------|-----|
| Large refactors in unrelated files | Review burden; regression risk |
| One-line “helper” files used once | Inline instead (project convention) |
| `@ts-nocheck` on new files | Only `network.ts` is intentionally loose for web port parity |
| Change `TEXT_PREFIX` or envelope shape | Breaks cross-client decrypt with web |
| Remove `metro.config.js` Supabase CJS resolver | Hermes crashes on dynamic `import()` in supabase-js ESM |
| Edit `android/` or `ios/` by hand for config | Prefer `app.json` / `app.config.js` + `expo prebuild` when needed |
| Add README/MD files unless asked | User/docs policy; update `README.md` when deploy/setup changes |

### Dependencies

| ❌ Don't | Why |
|----------|-----|
| Upgrade `@supabase/supabase-js` without testing Hermes + `metro.config.js` | Known ESM/Hermes issue — see README |
| Add heavy UI kits (NativeBase, Paper) | Custom radial/vibe UI is intentional |
| Add `axios` | Use `fetch` (already used for edge functions, uploads) |

---

## 6. File placement guide

| You are adding… | Put it in… |
|-----------------|------------|
| New couple-table CRUD | `src/api/network.ts` (+ e2ee in `e2eeBoundary` if needed) |
| Isolated API (sparks-scale) | `src/api/<name>.ts` |
| Screen-level view | `src/screens/` |
| Session module UI | `src/components/` or `src/components/<feature>/` |
| Shared hook | `src/hooks/` |
| Global state | `src/context/` |
| Crypto primitive | `src/crypto/` |
| Env / constants | `src/constants/` |
| Pure helpers | `src/utils/` |
| Shared TS types | `src/types/` |
| In-memory cache | `src/cache/` |
| Notification plumbing | `src/lib/` |
| Unit tests | Colocated `*.test.ts` next to source (see `envelope.test.ts`) |
| Build / env scripts | `scripts/*.cjs` |
| EAS / workflow changes | `eas.json`, `.github/workflows/` |

---

## 7. Data & Supabase

### Source of truth

- **Backend schema & RLS:** `us-exe-backend` / same as web.
- **Mobile port of web data layer:** `src/api/network.ts` (from web `NetworkUtils.js`).

### Conventions

- Tables are **couple-scoped** (`couple_id` filter) unless user-scoped (`user_id`).
- `networkUtility.signIn` / `signOut` — only auth entry points from UI.
- `prefetchCoupleData` runs after login — fetches CEK, runs migration, warms cache.
- Storage bucket **`memories`** for photos; encrypted bytes uploaded when CEK active.
- Signed URLs cached via `imageUrlCache` / `photoDisplayCache`.

### Adding a new field

1. Confirm web already reads/writes the column (or add web + backend first).
2. Add field to encrypt list in `src/crypto/fields.ts` / migration if sensitive.
3. Wire read/write in `network.ts` with maybeEncrypt/maybeDecrypt.
4. Update UI module; subscribe with `useCoupleRealtime` if live.
5. Add manual line to `e2ee.checklist.ts` if encrypted.

---

## 8. End-to-end encryption (E2EE)

### Format (do not change)

- **Text:** `enc:v1:` + base64 payload (`TEXT_PREFIX` in `envelope.ts`)
- **JSON:** `{ v: 1, alg: 'AES-GCM', iv, ct }`
- **CEK:** fetched from edge function `get-couple-cek` (`coupleKey.ts`)

### Rules

- **Always dual-read:** if no CEK or decrypt fails, fall back to plaintext value when safe.
- **Never encrypt twice:** `maybeEncrypt*` checks `isEncryptedText` / `isEncryptedJson`.
- **Migration:** `migrateCoupleContent` in `src/crypto/migrate.ts` — bump `MIGRATION_TARGET_VERSION` only with a deliberate migration plan.
- **Logout:** `clearCoupleKey()` must run on sign-out.
- **Realtime broadcast:** use `encryptBroadcastPayload` / `decryptBroadcastPayload` in `e2eeBoundary.ts`.

### Backend dependency

`get-couple-cek` must be deployed with `E2EE_MASTER_KEY` on the Supabase project you're testing against.

---

## 9. Realtime & caching

### `dataCache`

- Key pattern via `cacheKeys` in `src/cache/dataCache.ts`.
- TTL default 10 minutes (`CACHE_TTL_MS` in `network.ts`).
- Stale-while-revalidate: `readThroughCache` pattern.

### `useCoupleRealtime`

- Debounces rapid postgres events (280ms).
- Catches up when app returns from background (`AppState`).
- Pass `userIdField` + `currentUserId` to skip self-triggered refreshes when needed.

### Doodles

- Broadcast on `couple-sync` channel — not only postgres_changes.
- Merge logic in `src/utils/doodleMerge.ts`; canvas in `useDoodleCanvas.ts`.

**Don't** cache decrypted CEK or decrypted partner content in unbounded global caches.

---

## 10. UI & components

### Navigation model

- **No bottom tab bar.** Sessions switch via `RadialSessionNav`.
- `DashboardScreen` is the router; keep new modules pluggable via `renderModule()`.

### Visual system

- Dark background (`#0a0a0c`), pink accent (`#ec4899`).
- `VibeBackground` + mood-driven theme via `useVibeTheme`.
- Glass/blur: `expo-blur` where already used — don't mix inconsistent card styles in one module.

### Animations

| Use case | Tool |
|----------|------|
| Letter 3D flip | Built-in `Animated` |
| Gestures / doodle | `react-native-gesture-handler` + Reanimated |
| Spark hearts / overlays | Reanimated or simple state + `Animated` |

### Accessibility & platform

- Use `SafeAreaView` / `useSafeAreaInsets` where dashboard already does.
- `KeyboardAvoidingView` on forms (see `LoginScreen`).
- `Platform.OS` checks only when behavior differs (Android vs iOS notifications).

---

## 11. Notifications & push

### Registration flow

- `AppContext` calls `startPushRegistration(userId)` after pair confirmed.
- Implementation: `src/lib/pushTokens.ts` → `api/pushTokens.ts` (Supabase `user_push_tokens`).
- EAS `projectId` from `getEasProjectId()` — set via env (`EAS_PROJECT_ID` / `EAS_PROJECT_ID_DEV`).

### Spark & sticky push

- **Server sends push** via edge functions + DB webhooks — not client-side invoke on insert.
- Local notifications: `src/lib/notifications.ts`, `sparkNotifications.ts` for foreground/background fallback.
- Channels: `ensureSparksNotificationChannels()` — Android notification channels with custom sounds (`assets/sounds/`).

### UX

- `PushSetupBanner` shows when registration fails; links to `EXPO_CREDENTIALS_URL` from env-driven `app.config.js`.
- Don't show duplicate banners for sticky tray + push when app is foreground (tray wins).

---

## 12. Configuration & secrets

### Env files

| File | Purpose |
|------|---------|
| `.env.dev` | Dev Supabase + `EAS_PROJECT_ID_DEV` + `EXPO_OWNER` |
| `.env.prod` | Prod Supabase + `EAS_PROJECT_ID` + `EXPO_OWNER` |
| `.env` | Optional fallback for plain `expo start` |

### Variable reference

| Variable | Consumed by |
|----------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Metro bundle + `app.config.js` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Metro bundle + `app.config.js` |
| `EAS_PROJECT_ID` | `app.config.js` (preview/production) |
| `EAS_PROJECT_ID_DEV` | `app.config.js` (development) |
| `EXPO_OWNER` | `app.config.js` → owner + credentials URL |

### `app.config.js` behavior

- `EXPO_PUBLIC_ENV=dev` → **Us.exe Dev**, package `.dev`, slug `us-exe-mobile-dev`
- `EXPO_PUBLIC_ENV=prod` → **Us.exe Mobile**, production package, slug `us-exe-mobile`
- Picks `google-services.dev.json` vs `google-services.json` when present (gitignored).

**Agents:** when adding new config, thread through `app.config.js` `extra`, `env.*.example.txt`, `scripts/check-eas-env.cjs`, and CI workflows if needed.

---

## 13. Native code & Expo

### Plugins (in `app.json`)

- `expo-dev-client`, `expo-secure-store`, `expo-notifications`, `expo-build-properties`, `expo-media-library`

### When native rebuild is required

- New Expo plugin or plugin config change
- `google-services.json` added/changed
- `expo-build-properties` (minSdk, ABIs)
- New native dependency

### Android

- **minSdk 24**, ABIs: `armeabi-v7a`, `arm64-v8a`
- After FCM/config change: `npm run eas:preview:android:clean` + uninstall old APK

### iOS

- EAS builds; local requires macOS.

### `metro.config.js`

- Resolves `@supabase/supabase-js` → CJS build.
- Stubs `@opentelemetry/api` → `src/shims/opentelemetry-api.js`.

**Do not remove or simplify without running a release Android build.**

---

## 14. Testing & verification

### Automated

```bash
npm test    # vitest — crypto envelope tests
```

Add unit tests for pure crypto/util logic. Don't add trivial tests that only assert mocks.

### Manual

- `src/crypto/e2ee.checklist.ts` — cross-client E2EE scenarios with web.
- Push: [`PUSH_SETUP.md`](./PUSH_SETUP.md) device steps.
- Samsung install issues: [`SAMSUNG_INSTALL.md`](./SAMSUNG_INSTALL.md).

### Before opening a PR

1. `npm test` passes.
2. No secrets in diff.
3. Tested on **dev Supabase** for feature work (prod only for release fixes).
4. If UI: verified on Android dev client at least.
5. If native/config: rebuilt dev or preview APK.

---

## 15. Build, CI & releases

### Local EAS commands

| Command | Profile | Env file |
|---------|---------|----------|
| `npm run eas:dev:android` | development | `.env.dev` |
| `npm run eas:preview:android` | preview | `.env.prod` |
| `npm run eas:prod:android` | production | `.env.prod` |

Scripts push env to EAS cloud (`eas env:push`) before building.

### CI

- **Preview APK:** tag `v*` on `main` → `.github/workflows/deploy-preview.yml`
- **Dev APK:** manual → `deploy-dev-apk.yml`
- `main` does **not** auto-build on every push.

### Versioning

- `app.json` `expo.version` — CI may sync from tag on preview deploy.
- `eas.json` `appVersionSource: remote` for store builds.

---

## 16. Change checklist

Copy into PR / agent handoff when done:

```
[ ] Diff is focused — no unrelated refactors
[ ] No hardcoded URLs, keys, or project IDs
[ ] env.*.example.txt updated if new env vars
[ ] Data changes go through network.ts (or api/*) with E2EE if needed
[ ] Realtime uses useCoupleRealtime or existing couple channel
[ ] No duplicate push invokes for sparks/sticky notes
[ ] npm test passes
[ ] README.md updated if setup/deploy behavior changed
[ ] Native rebuild noted if app.json / plugins / google-services changed
[ ] Tested against dev Supabase (or reason prod-only)
```

---

## 17. When unsure

| Question | Where to look |
|----------|----------------|
| How do I run/build? | [`README.md`](./README.md) |
| Push / FCM setup? | [`PUSH_SETUP.md`](./PUSH_SETUP.md) |
| Web data shape? | `us-exe-web` NetworkUtils / same table names in `network.ts` |
| E2EE format? | `src/crypto/envelope.ts`, web crypto utils |
| Env vars? | `env.dev.example.txt`, `env.prod.example.txt`, `src/constants/env.ts` |
| Session list? | `src/components/sessionTiles.ts` |
| Build profiles? | `eas.json`, `scripts/eas-build.cjs` |
| Backend SQL / webhooks? | `us-exe-backend/supabase/` |

**Default decision:** copy the nearest existing module (e.g. sticky notes for a new couple-scoped text feature, sparks for a new notification type). When two patterns exist, prefer the one already used in the same session.

---

## Quick reference — imports

```typescript
// Auth / couple
import { useApp } from '../context/AppContext';

// Data
import { networkUtility } from '../api/network';

// Realtime
import { useCoupleRealtime } from '../hooks/useCoupleRealtime';

// Theme
import { useVibeTheme } from '../hooks/useVibeTheme';

// Env (api/crypto only — not components)
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants/env';

// E2EE
import { maybeEncryptText, maybeDecryptText } from '../crypto';
```

---

*Last aligned with Expo SDK 54, EAS env-based config, and E2EE mobile port. Update this file when introducing a new cross-cutting pattern.*
