# Push notifications (Expo + Supabase)

Remote sparks and sticky notes when the app is **force-stopped** need:

1. A row in Supabase `user_push_tokens` (saved by the app on login)
2. FCM configured on your **Expo** project (Android)
3. Edge functions `send-spark-push` / `send-sticky-note-push` + webhooks on `sparks` and `sticky_notes` INSERT

## 1. Supabase

Run `us-exe-backend/supabase/sparks-push-setup.sql` in the SQL editor if you have not already. Sticky notes use the same `user_push_tokens` table; see `us-exe-backend/supabase/sticky-notes-push-setup.sql`.

Verify: both partners open the app → **Table Editor → `user_push_tokens`** should show **2 rows**.

## 2. Android FCM (required for preview APK)

Expo Push on Android uses Firebase Cloud Messaging. You need **both**:

| Piece | Where |
|-------|--------|
| **FCM V1 service account JSON** | [expo.dev](https://expo.dev) → us-exe-mobile → Credentials → FCM V1 (server-side send) |
| **`google-services.json`** | `us-exe-mobile/google-services.json` + `app.json` → `android.googleServicesFile` (native Firebase in the APK) |

`app.json` must have (sibling of `package`, **not** inside `adaptiveIcon`):

```json
"android": {
  "package": "com.anonymous.usexemobile",
  "googleServicesFile": "./google-services.json",
  ...
}
```

### Setup steps

1. [Firebase Console](https://console.firebase.google.com/) → Android app `com.anonymous.usexemobile` → download **google-services.json** into `us-exe-mobile/`.
2. **Project settings** → **Service accounts** → **Generate new private key** → upload to Expo **FCM V1** (do not commit this JSON).
3. Rebuild after any `app.json` or `google-services.json` change — uninstall the old APK first:
   ```bash
   npm run eas:preview:android:clean
   ```
4. On each phone: open app → allow notifications → red banner should clear; log: `[push] token saved to Supabase`.

### `Default FirebaseApp is not initialized`

Means the installed APK was built **without** `google-services.json` embedded. Fix `googleServicesFile` placement, run `eas:preview:android:clean`, uninstall old app, reinstall new APK. Uploading FCM V1 to Expo alone does not fix this error.

EAS project ID (production, in `app.json`): `ef0ca527-53b7-4e6a-bde9-afde99890794`

Dev builds use package `com.anonymous.usexemobile.dev` and a separate EAS project — see README **Dev vs production**. Add that package in Firebase and place `google-services.dev.json` in this folder for dev push.

## 3. Edge function + webhook

Deploy edge functions (Dashboard or CLI):

- `send-spark-push`
- `send-sticky-note-push`

Create **Database Webhooks** (Insert):

| Table | Function |
|-------|----------|
| `public.sparks` | `send-spark-push` |
| `public.sticky_notes` | `send-sticky-note-push` |

## 4. Debug on device

```bash
adb logcat | grep -iE '\[push\]|\[pushTokens\]'
```

| Log | Meaning |
|-----|--------|
| `token saved to Supabase` | OK — check `user_push_tokens` |
| `getExpoPushTokenAsync failed` + Firebase/FCM | Upload FCM to Expo and rebuild |
| `upsert failed` | RLS or table missing |
| `permission_denied` | Enable notifications in Android Settings |

## 5. Test sticky note (killed app)

1. Receiver: force-stop app.
2. Sender: **Notes** → pin a sticky.
3. Receiver should see **"{Name} left a note for you"** (title only).

## 6. Test killed-app buzz

1. Receiver: force-stop app.
2. Sender: send **Buzz**.
3. Edge function logs should show `ok: true` and `pushTokenPrefix`, not `receiver has no push token`.
