# Us.exe mobile (React Native · Expo)

Native companion for the **`us-exe-web`** dashboard: same Supabase project, couples data, realtime tables, jam links, sticky notes, photo wall (polaroids), flip letters, moods, triggers, and date diary.

## Setup

### Environment files

| File | Use |
|------|-----|
| `.env.dev` | Local dev + EAS **development** builds (staging Supabase) |
| `.env.prod` | EAS **preview** / **production** builds (prod Supabase) |
| `.env` | Optional fallback for `expo start` without flags |

```bash
cp env.dev.example.txt .env.dev    # dev / staging Supabase
cp env.prod.example.txt .env.prod  # prod Supabase (EAS preview/release)
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from the matching Supabase project (**Project Settings → API**).

### Run locally

```bash
npm install
npm run start:dev    # dev client + .env.dev (recommended)
# or: npx expo start  # uses .env if present
```

**Expo SDK 54** — Expo Go only matches the stock SDK. This repo includes **`expo-dev-client`** plus **EAS** profiles so you can ship custom native code (e.g. dev menu, same as production modules) while testing.

Open on **Android**, or use a **development build** / **EAS**. **iOS** simulator / device builds need macOS / EAS.

### Local Android Gradle (SDK path)

If `./gradlew` fails with **SDK location not found**, point Gradle at your SDK (you already use `~/Android/Sdk` with the CLI tools):

1. **`android/local.properties`** (git-ignored, safe to keep on your machine):

   ```properties
   sdk.dir=/home/YOUR_USER/Android/Sdk
   ```

   Use **forward slashes** even on Windows in this file.

2. Or export **`ANDROID_HOME`** / **`ANDROID_SDK_ROOT`** to the same directory in `~/.bashrc`.

Re-run `npx expo prebuild --platform android` only when native config changes; if `local.properties` disappears, recreate it.

**Release bundle / Hermes:** `@supabase/supabase-js@2.106.x` ships a dynamic `import()` in its ESM build, which Hermes rejects. This repo’s **`metro.config.js`** forces the CJS Supabase bundle and stubs optional `@opentelemetry/api`. If you upgrade Supabase, keep that config until their package adds a `"react-native"` export (see [supabase-js#2380](https://github.com/supabase/supabase-js/issues/2380)).

### EAS builds (dev + release)

1. Install deps: `npm install` (includes **`eas-cli`** as a devDependency).
2. Log in and link the app once (creates `extra.eas.projectId` in **`app.json`**):

   ```bash
   npx eas-cli login
   npx eas-cli init
   ```

3. **Development client** (installable APK with dev menu; pair with Metro for live JS):

   ```bash
   npm run eas:dev:android
   ```

   After install, start the bundler with **`npm run start:dev`** and open the project from the dev launcher.

4. **Internal QA (release-like, APK):** `npm run eas:preview:android` (see **`eas.json`** `preview` profile).

5. **Play Store bundle (AAB):** `npm run eas:prod:android` (`production` profile, `app-bundle`).

Profiles live in **`eas.json`**: `development`, `development-simulator` (iOS sim), `preview`, `production`.

### Dev vs production (side-by-side installs)

Like the two Supabase projects, dev builds use a **separate EAS project** and install as a **different app** on your phone so they never overwrite production.

| | Production (`preview` / `production`) | Development (`development`) |
|--|--|--|
| Home screen name | **Us.exe Mobile** | **Us.exe Dev** |
| Android package | `com.anonymous.usexemobile` | `com.anonymous.usexemobile.dev` |
| EAS slug / project | `us-exe-mobile` | `us-exe-mobile-dev` |
| Supabase | `.env.prod` / prod secrets | `.env.dev` / dev secrets |
| Expo project | existing (`app.json` `projectId`) | new — `EAS_PROJECT_ID_DEV` in `.env.dev` |

**One-time dev EAS setup:**

```bash
cp env.dev.example.txt .env.dev   # if you have not already
# fill in dev Supabase URL + anon key
npm run eas:init:dev              # creates us-exe-mobile-dev on expo.dev
```

That saves `EAS_PROJECT_ID_DEV` into `.env.dev`. With dynamic `app.config.js`, EAS cannot auto-write the ID — the init script captures it for you. If init fails, create the project at [expo.dev](https://expo.dev/accounts/dptspartan/projects) (slug `us-exe-mobile-dev`) and paste the ID into `.env.dev`.

**Build & install dev APK** (does not replace production):

```bash
npm run eas:dev:android
```

Pair with `npm run start:dev` for live JS. Uninstall dev only: `npm run android:uninstall:dev`.

**Push notifications on dev (optional):** add Android app `com.anonymous.usexemobile.dev` in Firebase, download `google-services.dev.json` into this folder, and upload FCM credentials to the **dev** Expo project on expo.dev. Without that file, dev builds still work — push is just disabled on the dev app.

**GitHub Actions (dev branch deploy):** add secret `EAS_PROJECT_ID_DEV` alongside `EXPO_PUBLIC_SUPABASE_URL_DEV` / `EXPO_PUBLIC_SUPABASE_ANON_KEY_DEV`. Trigger manually via **Actions → Deploy dev APK (EAS)**.

## End-to-end encryption (E2EE)

Couple content is encrypted client-side with a per-couple key (CEK) from the `get-couple-cek` edge function. Mobile matches the web envelope format (`enc:v1:` text + AES-GCM JSON blobs).

**Backend prerequisite:** deploy `get-couple-cek` with `E2EE_MASTER_KEY` on the Supabase project you are testing against (dev first, then prod).

**What is encrypted:** letters, sticky notes, goals, diary, jam links, triggers, doodle strokes, photo bytes, realtime broadcast payloads.

**First login after deploy:** `prefetchCoupleData` fetches the CEK and runs a background migration for legacy plaintext rows. Until the backend is ready, the app still works — content stays plaintext (dual-read).

```bash
npm test                    # envelope round-trip unit tests
```

Manual cross-client checks: see `src/crypto/e2ee.checklist.ts`.

## Tag-based preview deploy (GitHub Actions + EAS)

**`main` does not auto-build.** A preview APK is produced when you tag a commit on `main` (same `v*` convention as `us-exe-web`) or run the workflow manually.

### Release workflow

1. Merge your PR into **`main`**
2. Create a tag on **`main`**, e.g. `v1.0.0`
3. Push the tag → Actions runs **Deploy preview APK (EAS)** → EAS builds the `preview` profile (internal APK)
4. Open the finished job → **Summary** tab shows an **install QR code** and download link

Tags on feature branches are **rejected** (same guard as the web deploy).

CLI equivalent:

```bash
git checkout main && git pull
git tag v1.0.0
git push origin v1.0.0
```

### One-time GitHub setup

In **Settings → Secrets and variables → Actions** for `us-exe-mobile`:

| Secret | Purpose |
|--------|---------|
| `EXPO_TOKEN` | [expo.dev](https://expo.dev) → Account → Access tokens |
| `EXPO_PUBLIC_SUPABASE_URL` | Production Supabase URL (preview/release builds) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Production Supabase anon key |

FCM / `google-services.json` must already be configured on Expo (see **`PUSH_SETUP.md`**).

### Other deploy triggers

| Trigger | What gets built |
|---------|-----------------|
| Tag `v*` on `main` | Tagged commit → preview APK |
| Manual (Actions → Run workflow) | Latest `main` → preview APK |

Local manual build (no CI): `npm run eas:preview:android`

## UI model

- **No generic tab navbar**: an **orbit / arc launcher** swaps **sessions** — Desk · Wall · Notes · Jam · Letter · Pulse.
- **Dashboard framing**: gradient “room” vibe, one module fills the stage; inner lists use **`FlatList` in a bounded area** instead of paging the entire screen when long queues appear.
- **Moods**: bottom-right **orb cluster**, same conceptual role as the web corner deck.
- **Wall**: stacked **polaroids** with tap-through cycling and uploads.

## Animations (Expo / React Native)

**Framer Motion** targets the DOM; it is not a fit for React Native. Common choices here:

- **`react-native-reanimated`** (plus the Babel plugin from the Expo docs) — runs work on the UI thread; best for springs, gestures, and complex 3D.
- **`react-native-gesture-handler`** — already in this project; pairs with Reanimated for pan / scroll decisions.
- **`moti`** — declarative API on top of Reanimated.
- **Built-in `Animated`** — no extra native setup; used for the Letter card **3D flip** (`perspective` + `rotateY`) to keep Expo Go simple.

## Sticky-note notifications

- While the app is open: **sticky tray overlay** on new partner notes (no duplicate banner).
- Background / force-stopped: **Expo push** via `send-sticky-note-push` + webhook on `sticky_notes` INSERT (`us-exe-backend/supabase/sticky-notes-push-setup.sql`). Copy: **"{Partner} left a note for you"**.
- Local notification fallback if realtime fires while the app is backgrounded and the webhook is not deployed yet.

## Permissions

- `expo-notifications` + Android `POST_NOTIFICATIONS` are configured in `app.json`.
- `expo-image-picker` drives wall and diary uploads.

## Source sketch

| Location | Purpose |
|---------|---------|
| `src/api/network.ts` | Web `NetworkUtils` port (+ React Native uploads via `fetch(uri)`). |
| `src/context/` | Auth / couple hydration, moods & sync. |
| `src/components/` | Radial nav, vibe background, polaroids, jams, pulse triggers, flip letter. |
| `src/screens/` | Login and dashboard wrapper. |
