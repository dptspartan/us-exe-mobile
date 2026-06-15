# Us.exe mobile (React Native · Expo)

Native companion for the **`us-exe-web`** dashboard: same Supabase project, couples data, realtime tables, jam links, sticky notes, photo wall (polaroids), flip letters, moods, triggers, and date diary.

## Setup

1. Copy `env.example.txt` to `.env` in **this folder** (Expo loads `EXPO_PUBLIC_*` automatically):

```bash
cp env.example.txt .env
```

2. Paste the **same values** as `us-exe-web/.env.local`, but rename keys:

   - `EXPO_PUBLIC_SUPABASE_URL` ← web `VITE_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` ← web `VITE_SUPABASE_PUBLISHABLE_KEY`

3. Install and run:

```bash
npm install
npx expo start
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
