# Publishing DeJournal on Google Play

Everything Play asks for, in the order the Play Console asks for it. The files to upload are in `store/` and `app/build/outputs/`.

## 0. Before your first upload

1. **Choose the package name.** It's `io.dejournal.app` in `app/build.gradle.kts` (`applicationId`), and it **can never change** after the first upload. Make sure you're happy with it; something like `com.yourname.dejournal` also works. If you change it, also update `namespace` and the Kotlin package folders, or just `applicationId`, which is enough on its own.
2. **Back up your upload key.** The key file (`dejournal-upload.jks`) is kept outside the repository; `android/keystore.properties` (git-ignored) points at it and holds its password. Copy both somewhere safe, such as a password manager or encrypted drive. With Play App Signing (the default), Google holds the real app-signing key. If you lose the upload key, Play support can reset it, but that takes days.
3. **Host the privacy policy.** Play requires a public URL. The policy is `privacy.html` in the web project's `public/` folder, so if you deploy the website (Vercel, Netlify or GitHub Pages) it'll be at `https://<your-site>/privacy.html`. Edit the contact email in it first (it says `privacy@example.com`).

## 1. Create the app

Play Console → **Create app**

| Field | Value |
|---|---|
| App name | DeJournal |
| Default language | English (United States) or English (India) |
| App or game | App |
| Free or paid | Free |

> **New personal developer accounts:** Google requires a **closed test with at least 12 testers for 14 consecutive days** before you can apply for production access. Plan for this: upload to *Closed testing* first and invite friends by email or Google Group.

## 2. Upload the build

```bash
# in the repo root
npm run build
# in android/
gradlew.bat bundleRelease
```

Upload `app/build/outputs/bundle/release/app-release.aab` to **Testing → Closed testing** (or Internal testing for a quick check).

For every later release, bump `versionCode` (1 → 2 → 3…) and `versionName` in `app/build.gradle.kts`.

## 3. Store listing

**App name (max 30):**
```
DeJournal
```

**Short description (max 80):**
```
Private journal & day planner: to-dos, reminders, study, expenses, monthly recap.
```

**Full description (max 4000):**
```
DeJournal is a calm, private place to plan your day, record what happened and see how your month went — all in one app.

TODAY AT A GLANCE
• To-do list with priorities, due times and repeating tasks
• Rate your day from 1 to 5 and add a daily selfie
• Highlight of the day — the moment you want to remember
• How much you studied and spent today
• One gentle suggestion based on your own recent days

REMINDERS THAT ARRIVE ON TIME
• One-time and repeating reminders
• Snooze or mark done right from the notification
• Works even when the app is closed, and after your phone restarts

CALENDAR & JOURNAL
• Month, week and day views with everything you recorded on each date
• Optional reflection prompts: what went well, what was hard, what you learned
• Import events from any calendar using an .ics file

STUDY TRACKER
• Study timer that keeps running even if you close the app
• Subjects, daily and weekly goals, and charts of your progress

EXPENSES
• Log spending in seconds (₹ by default, other currencies supported)
• Categories, budgets and monthly breakdowns
• Manual logging only — DeJournal never connects to your bank

MONTHLY RECAP
• Your month in one screen: ratings, tasks, study time, spending, photos and highlights
• Compare with last month fairly, even mid-month
• Write a monthly reflection

AND MORE
• Notes with simple formatting, photo diary, places you visited
• Screen time from your phone's usage stats (with your permission)
• Focus mode timer
• Universal search across everything, as a list or on a calendar
• Dark and light themes

PRIVATE BY DESIGN
No account. No ads. No tracking. Your journal stays on your phone — DeJournal has no servers that receive your data. Export a backup file whenever you like.
```

**Graphics** (all in `store/`):

| Asset | File |
|---|---|
| App icon (512×512) | `store/icon-512.png` |
| Feature graphic (1024×500) | `store/feature-graphic-1024x500.png` |
| Phone screenshots (1080×2160) | `store/screenshots/01-today.png` … `06-journal.png` |

**Category:** Productivity · **Tags:** Journal, Planner, Productivity · **Contact email:** your email.

## 4. App content (Policy → App content)

| Section | Answer |
|---|---|
| Privacy policy | Your hosted `privacy.html` URL |
| Ads | No, the app has no ads |
| App access | All functionality is available without special access (no login) |
| Content rating | Fill in the questionnaire. Category: *Utility, productivity, communication or other*. Answer **No** to violence, sexual content, profanity, drugs and gambling. Users can't interact with or share content with other users. Expected rating: Everyone / 3+. |
| Target audience | 13+ (or 18+). Not designed for children. |
| News app | No |
| Government app | No |
| Financial features | It doesn't provide financial services. If asked, it's personal expense *logging* only, with no banking, loans or payments. |
| Health apps | No |
| Data safety | See below |

### Data safety form

Google defines "collected" as data sent off the device by the app. DeJournal keeps everything on the device, so:

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **No** |
| Is all user data encrypted in transit? | Not applicable, because no user data is transmitted (map images are fetched over HTTPS) |
| Do you provide a way for users to request that their data be deleted? | Yes. In-app: Settings → Data → Delete all data; uninstalling also removes everything. |

Notes for your own records, in case review asks:
- Map tiles on the Places page are downloaded from OpenStreetMap (HTTPS) only when the user opens the map. No user data is sent. The tile server sees the IP address, as with any image download, and users can turn tiles off.
- Android's own device backup may include the app's data in the user's Google backup. Google doesn't count this as collection by the app.

### Sensitive permissions

| Permission | Declaration needed? | Justification if asked |
|---|---|---|
| `POST_NOTIFICATIONS` | No | Reminder alerts |
| `SCHEDULE_EXACT_ALARM` | No. The app doesn't use `USE_EXACT_ALARM`, which is the one that needs a declaration. The user grants this in system settings, and the app falls back to inexact alarms without it. | On-time reminders |
| `RECEIVE_BOOT_COMPLETED` | No | Re-arm reminder alarms after restart |
| `CAMERA` | No | Daily selfie / photo diary |
| `ACCESS_COARSE/FINE_LOCATION` | No (foreground only, asked on tap) | "Use my current location" for places |
| `PACKAGE_USAGE_STATS` | No form, but be ready to explain in review | Screen-time page shows the user's own daily phone usage. Granted by the user in system settings and fully optional. |

Photos are picked with Android's photo picker, so the app doesn't request `READ_MEDIA_IMAGES`.

## 5. Release

1. Closed testing → create release → upload the `.aab` → release notes ("First release").
2. Add testers, then share the opt-in link.
3. After 14 days with 12+ testers, apply for production in the Dashboard.
4. Production → create release → reuse the same build or upload a newer one → roll out.

## Checklist

- [ ] Package name decided (permanent)
- [ ] Upload key and `keystore.properties` backed up
- [ ] Contact email updated in `privacy.html`, and the policy hosted
- [ ] `versionCode` bumped for every upload
- [ ] Store listing text and graphics uploaded
- [ ] Content rating, target audience and data safety completed
- [ ] Closed test running with 12+ testers
