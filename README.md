# DeJournal

A private journal, daily planner and life tracker in one calm, dark-first app. Plan your day, log what happened, rate it, keep photos and notes, track study time and spending, and look back with a monthly recap.

DeJournal is **local-first**. Everything is stored in your browser's IndexedDB on this device. There is no account, no server and no tracking. Optional extras (AI, Google Calendar, map tiles) are off until you turn them on.

## Quick start

Requires Node 20+.

```bash
npm install
npm run dev          # http://localhost:5173
```

Other scripts:

| Command | What it does |
|---|---|
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the unit tests (Vitest) |
| `npm run typecheck` | TypeScript only |
| `npm run ai-server` | Optional AI proxy on port 8787 (see below) |

Keyboard shortcuts: `n` opens quick add, `/` opens search.

## Features

### Fully working

| Area | What you can do |
|---|---|
| **Today** | Date navigation (prev/next, picker, back to today). One suggestion based on your data. Selfie and 1–5 rating. Highlight. To-do list with inline add, overdue carry-forward, show/hide completed. Agenda (events + reminders). Routines. Study and spending tiles. Notes & photos strip. Sections can be reordered and hidden. |
| **Tasks** | Create, edit, complete, reopen, delete (with undo). Priority, due time, category, tags, move to another date, reorder. Repeating tasks (daily, weekly, chosen weekdays, end date): each day is its own record, with "only this" vs "this and following" edits. Views: upcoming, overdue, done, all, plus filters and search. |
| **Calendar** | Month / week / day views with activity dots and full keyboard navigation. Selecting a date shows everything recorded on that day. Local events, plus read-only imported events with a source label. |
| **Reminders** | One-time and repeating reminders, linked to tasks. Done, dismiss and snooze. Notifications with Snooze/Done buttons, quiet hours and a global switch. |
| **Journal** | Daily rating with editable labels and optional reflection prompts. Rating history calendar, monthly average and trend chart. |
| **Highlights** | One per day, with an optional photo and tags. Archive with month and tag filters. |
| **Notes** | Autosaving editor with formatting toolbar and preview, pin, archive, tags, optional linked date, search, delete with undo. |
| **Photos** | Camera capture (front camera for selfies) or upload, with preview, caption, tags and date. Grid and timeline views, selfie filter, full-screen viewer, "go to day". Images are resized and kept privately on this device. |
| **Study** | Timer that survives refresh and excludes paused time. Manual logging with overlap checks, subjects, daily and weekly goals. Week/month charts, subject breakdown, consistency and comparison with the previous period. |
| **Expenses** | Quick add (amount, description/category, date). Custom categories, payment method and notes. Day/week/month totals, category breakdown, trend, daily average, comparison with the previous period, budgets with warnings. INR by default, configurable. |
| **Recap** | Monthly summary of daily life, tasks, study, expenses, photos and journaling, and consistency. Charts, a comparison with last month that is fair for months in progress, and a monthly reflection that is saved and searchable. |
| **Search** | One search across all record types, in List or Calendar mode with the same query. Filters for type, date range, tags and status. Recent searches can be turned off. |
| **Routines** | Small habits per weekday, ticked on Today, with 30-day completion. |
| **Focus mode** | Pomodoro and custom or open-ended timers, optionally linked to a task or subject. Distraction-free full-screen view and history. Can also be logged as study time. |
| **Places** | Manually saved places with an optional "use my location", a timeline and an OpenStreetMap map. "Delete all location history" is available. |
| **Screen time** | Manual daily log with a goal, charts and averages. |
| **Settings** | Theme (dark/light/system), accent colour, reduced motion, date format, week start, currency, goals, rating labels, notifications, privacy toggles, dashboard and quick-action layout. **Export / import JSON backup** (photos optional), storage usage, persistent-storage request, delete all data. |
| **Calendar import (.ics)** | Import any `.ics` file (Google, Outlook or Apple export). Handles repeats, all-day and multi-day events, de-duplicates on re-import, and removing a connection removes its events. |

### Needs your configuration

| Feature | Status | What's needed |
|---|---|---|
| **AI summaries** (monthly summary in Recap) | Built and tested without a key; a real AI call is untested | Put `ANTHROPIC_API_KEY` in `.env`, run `npm run ai-server`, then turn on AI and consent in Settings → Privacy & AI |
| **Google Calendar** (read-only sync) | Built; untested without credentials | Create an OAuth Web client in Google Cloud Console, add your origin (e.g. `http://localhost:5173`), and set `VITE_GOOGLE_CLIENT_ID` in `.env.local`. Sign-in lasts for the session only; already-synced events stay saved. |

### Platform limits

- **Notifications** fire while DeJournal is open in any tab, including in the background. A closed web app can't be woken without a push server, and the Reminders page says so. Snooze/Done buttons on notifications are Chromium-only.
- **Screen time**: browsers can't read OS screen time, so it's manual logging. Automatic tracking needs a native wrapper using Android `UsageStatsManager` or Apple's `FamilyControls` / `DeviceActivity`.
- **Focus mode** doesn't block other apps or websites, because browsers don't allow it. The app says so.
- **Data lives in this browser only.** Clearing site data deletes it. Use Settings → Data → Export for backups, and "Keep data persistent" to stop the browser evicting it. There's no multi-device sync yet; see the architecture doc for how a backend would slot in.
- `.ics` timezones: times tagged with a timezone are treated as local wall-clock time.

## Android app

A native Kotlin Android app lives in **[`android/`](android/)**. It bundles this UI so it works offline, and adds:

- reminders that fire when the app is closed
- automatic screen time from Android usage stats
- the camera
- Android's "Save as" dialog for backups
- the hardware back button

Build it after `npm run build`. Its `README.md` covers building, and its `PLAY_STORE.md` covers publishing.

The web side of the bridge is `src/platform/native.ts`. In a normal browser it does nothing, so the website behaves exactly as before. The privacy policy needed for the Play Store is `public/privacy.html`, which is served at `/privacy.html` wherever the site is hosted.

## Configuration

Copy `.env.example` to `.env` (all values are optional):

| Variable | Used by | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `server/ai-proxy.mjs` only | AI provider key. It stays on the server and is never bundled into the browser. |
| `AI_MODEL` | AI proxy | Model id (default `claude-opus-5-5`) |
| `AI_EFFORT` | AI proxy | `low` / `medium` / `high` |
| `AI_PORT` | AI proxy | Default `8787`; the Vite dev server proxies `/api` to it |
| `VITE_GOOGLE_CLIENT_ID` | Browser | Google OAuth client ID (a public identifier, not a secret) |

## Deployment

DeJournal builds to a static site:

```bash
npm run build      # outputs dist/
```

Host `dist/` on any static host. All routes must fall back to `index.html`; `vercel.json` and `public/_redirects` (Netlify) are included. Serve over HTTPS, which the camera, notifications and service worker need.

For AI in production, run `server/ai-proxy.mjs` (Node 20+) next to the site and route `/api/*` to it. Set `ANTHROPIC_API_KEY` on that server. Add authentication in front of it before exposing it publicly, because anyone who can reach it can spend your API credit.

## Project structure

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for:

- the stack
- the folder layout and where to add new features
- the full data model and integrity rules
- migrations
- the privacy model

```
src/app         shell, router, navigation
src/components  design system (ui/) and charts
src/db          IndexedDB schema, types, repositories
src/domain      pure logic with tests (recommendations, recap, search, study, expenses)
src/features    feature components and editors
src/lib         helpers (dates, money, recurrence, ics, backup, image)
src/pages       one file per route
src/stores      settings and UI state
src/ai          optional AI provider abstraction
server/         optional AI proxy
```

## Tests

`npm test` runs 103 unit tests across 12 files. They cover:

- date and timezone helpers
- money parsing
- recurrence rules
- task series generation, exceptions and splits (against an in-memory IndexedDB)
- the recommendation rules
- task, study and expense statistics
- the monthly recap
- search
- the `.ics` parser
- the markdown renderer
- backup round-trips
