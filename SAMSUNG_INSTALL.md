# Samsung A05 — APK won't install

If you see **App not installed** after the usual checks, try these **Samsung-specific** fixes.

## 1. Ghost install (app hidden but still on phone)

Samsung sometimes keeps the package after a failed install or **Secure Folder** copy.

**On phone (no PC):**
- Settings → Apps → search **Us.exe** → Uninstall
- Settings → Apps → **⋮** → **Uninstall for all users** (if shown)
- Check **Secure Folder** → Apps → uninstall **Us.exe Mobile** there too

**With USB debugging + PC:**
```bash
adb devices
adb shell pm list packages | grep usexemobile
adb uninstall com.anonymous.usexemobile
# If that fails:
adb shell pm uninstall --user 0 com.anonymous.usexemobile
adb install -r ~/Downloads/your-preview.apk
```
The last line prints the **real** error (signature, parse, storage, etc.).

## 2. Use the correct build

- Profile: **preview** (APK), not **production** (AAB).
- Build after config changes:
  ```bash
  npm run eas:preview:android:clean
  ```
- Download APK from expo.dev again; install via **My Files**, not a partial Chrome download.

## 3. Install settings (One UI)

- Settings → Security → **Install unknown apps** → enable for **My Files**
- Play Protect → **Install anyway** when prompted
- Free **500 MB+** storage before install

## 4. This project's build targets A05

- CPUs: `armeabi-v7a` + `arm64-v8a` (Helio G85)
- minSdk: 24 (A05 ships Android 13+)

After a new build, **uninstall** any old version first, then install the new APK.
