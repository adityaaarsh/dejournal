# DeJournal for Android (Kotlin)

The Android app for DeJournal. It's a native Kotlin app that bundles the DeJournal web UI from the repo root and adds the phone features a website can't have:

| Feature | How it works |
|---|---|
| Works offline | The UI is packaged inside the app and served from a private, secure local address (`https://appassets.androidplatform.net`), so nothing is downloaded. |
| Reminders when the app is closed | `AlarmManager` alarms (exact when allowed), notification **Snooze / Done** buttons, re-armed after reboot, app update or time-zone change |
| Automatic screen time | Daily app-usage totals from `UsageStatsManager` (needs "Usage access") |
| Camera & photos | WebView camera permission, plus Android's photo picker for uploads (no storage permission) |
| Location | Asked only when you tap "Use my current location" |
| Save backups | Android's "Save as" dialog for exported backup files |
| Native feel | Edge-to-edge layout, status-bar colours that follow the app theme, hardware back button closes sheets first |

Your data is stored in the app's private WebView storage (IndexedDB) and survives app updates. It's included in Android's device backup if the user has that turned on.

## Requirements

- Android Studio, which includes the JDK used for builds
- Android SDK with platforms 36 and 37 (from Android Studio's SDK Manager). Android Studio writes its location to `android/local.properties` as `sdk.dir=…`.
- The web UI built at least once (`npm run build` in the repo root)

## Build

```bash
# 1. Build the web UI (any time you change it), from the repo root
npm run build

# 2. Build the app
cd android
gradlew.bat assembleDebug      # debug APK  → app/build/outputs/apk/debug/
gradlew.bat bundleRelease      # Play Store → app/build/outputs/bundle/release/app-release.aab
gradlew.bat assembleRelease    # signed APK to install directly
```

`gradle.properties` → `dejournal.webDist` points at the repo's `dist/` folder. The build copies it into the app automatically, and fails with a clear message if it's missing.

Or open the `android/` folder in Android Studio and press **Run**.

**Build output on another drive:** add `dejournal.buildRoot=D:/DeJournal-build` (any path) to `~/.gradle/gradle.properties`. All build output then goes there instead of `android/app/build`.

### Run on a phone

1. On the phone, turn on **Developer options → USB debugging**.
2. Connect it, then run `gradlew.bat installDebug` (or press Run in Android Studio).

The debug app installs as "DeJournal" with package `io.dejournal.app.debug`, so it can sit next to the Play Store version.

### Emulator

Create one in Android Studio's Device Manager. Any Android 8.0+ image works; the app was tested on Android 16.

## Signing

Release builds are signed using `android/keystore.properties`, which is git-ignored:

```properties
storeFile=D:/path/to/dejournal-upload.jks
storePassword=…
keyAlias=upload
keyPassword=…
```

Keep the `.jks` key **outside the repository, and backed up**. Without `keystore.properties`, release builds are unsigned. See [PLAY_STORE.md](PLAY_STORE.md).

## Project layout

```
app/src/main/java/io/dejournal/app/
  MainActivity.kt            WebView host: permissions, camera, file picker, saving, back button, insets
  NativeBridge.kt            window.DeJournalNative — the API the web UI calls
  WebAssets.kt               Serves bundled UI files; unknown paths fall back to index.html
  reminders/
    ReminderAlarms.kt        Schedules / cancels AlarmManager alarms
    ReminderReceiver.kt      Alarm fired → notification; Snooze / Done buttons
    RescheduleReceiver.kt    Re-arms alarms after reboot, update, time change
    ReminderStore.kt         Saved schedule, fired keys, pending Snooze/Done actions
    Notifications.kt         Channels and notification building
  screentime/ScreenTime.kt   Daily foreground time from usage events
app/src/main/res/            Icon (adaptive + themed), notification icon, theme, backup rules
store/                       Play Store icon, feature graphic, screenshots
```

The web side of the bridge is `src/platform/native.ts` in the web project, and every native feature degrades gracefully in a normal browser.

## How reminders flow

1. The UI computes the next 7 days of reminder occurrences (`src/features/reminders/nativeSchedule.ts`) and calls `scheduleReminders` whenever reminders or settings change. Quiet hours and the global switch are applied there.
2. Kotlin replaces its alarm set and stores it, so alarms survive reboots.
3. When an alarm fires, `ReminderReceiver` posts the notification, even if the app is closed.
4. Snooze/Done presses are queued. The UI applies them the next time it runs, or immediately if it's open.

## Known limitations

- **AI summaries** aren't available in the app. They need the separate AI server, so Settings shows "not available in the Android app yet".
- **Google Calendar sign-in** is blocked inside apps by Google, so the app offers `.ics` import instead.
- **Screen time** covers about the last 7 days, because Android keeps detailed usage events for roughly a week. Older days you logged stay as you saved them.
- **Focus timer completion alert** is shown if the app is in the background but still alive. A fully closed app won't alert for focus sessions (reminders are unaffected).
