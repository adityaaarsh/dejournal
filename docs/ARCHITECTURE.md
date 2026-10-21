# DeJournal architecture

## Stack

| Concern | Choice | Why |
|---|---|---|
| UI | React 19 + TypeScript, Vite | Fast dev loop, code-splitting per page |
| Styling | Tailwind CSS v4 with CSS-variable design tokens (`src/index.css`) | One token set drives dark + light themes and accent colours |
| Routing | react-router 7 (`src/app/App.tsx`) | Lazy-loaded pages, URL holds view state (`?d=`, `?m=`, `?q=`) |
| Storage | IndexedDB via Dexie 4 (`src/db/db.ts`) | Local-first, private, survives restarts, stores photo Blobs |
| Reactivity | `useLiveQuery` (dexie-react-hooks) | Every screen re-renders when the underlying rows change |
| UI state | zustand (`src/stores/ui.ts`) | Dialog stack + toasts |
| Dates | date-fns + local `YYYY-MM-DD` strings (`src/lib/dates.ts`) | Date-based records never shift across timezones |
| Icons | lucide-react | One consistent outline set |
| Charts | Small hand-written SVG components (`src/components/charts`) | No chart dependency; table view + tooltips built in |
| Maps | Leaflet + OpenStreetMap tiles (lazy-loaded) | No API key needed |
| AI (optional) | Provider abstraction (`src/ai`) + Node proxy (`server/ai-proxy.mjs`) | API key never reaches the browser |

## Folder layout

```
src/
  app/            App shell, router, navigation config
  components/
    ui/           Design-system components (Button, Card, Sheet, Field, …)
    charts/       SVG charts (ColumnChart, LineChart, BreakdownBars, MonthHeatmap)
  db/             Dexie schema, types and repositories (tasks, reminders, photos, timers, days…)
  domain/         Pure business logic with unit tests (recommendations, recap, search, study, expenses)
  features/       Feature components & editors, grouped by module
    quick/        Dialog host, quick-action sheet, confirm dialog
  lib/            Framework-free helpers (dates, money, recurrence, text, image, ics, backup)
  pages/          One file per route
  stores/         Settings (persisted) and transient UI state
  ai/             AI provider abstraction and prompt builders
server/           Optional AI proxy (keeps API keys server-side)
public/           Manifest, icon, service worker (notifications only — no caching)
scripts/shot.mjs  Headless-browser screenshot helper used for verification
```

### Where to add things

- **New record type**: add the interface to `src/db/types.ts`, add a table in a *new* `this.version(n)` block in `src/db/db.ts`, add it to `ALL_TABLES` (export/import/delete), then a repository function file in `src/db/`.
- **New editor dialog**: add a variant to `DialogRequest` in `src/stores/ui.ts` and register the component in `src/features/quick/DialogHost.tsx`. Any screen can then call `openDialog({ kind: … })`.
- **New page**: create `src/pages/XPage.tsx` (default export), add a route in `src/app/App.tsx`, and a nav entry in `src/app/nav.ts`.
- **New Today section**: add the id to `DashboardSectionId` + `DEFAULT_SETTINGS.dashboard` in `src/stores/settings.ts` and render it in `TodayPage`.
- **New recommendation rule**: add it to `src/domain/recommendations.ts` with a test.

## Data model

All records live in the IndexedDB database `dejournal`. Conventions:

- `id` — random UUID. `createdAt` / `updatedAt` — UTC ISO timestamps.
- `date` — the record's **local** calendar date, `YYYY-MM-DD`. Day-based records are keyed by this string, so an all-day item never moves to another day when the timezone changes. Times of day are local `HH:mm`.
- Money — integer minor units (paise), plus a `currency` code.
- Single profile: everything in this browser belongs to the one local user, so there is no `userId` column. A sync backend would add one, with row-level access control.

| Table | Purpose | Key / indexes |
|---|---|---|
| `tasks` | Dated to-dos; occurrences of recurring tasks are real rows | `date`, `seriesId`, `[seriesId+date]`, `tags*` |
| `taskSeries` | Recurrence rule for repeating tasks + deleted-occurrence exceptions | `startDate` |
| `reminders` | One-time or repeating reminders; per-occurrence done/dismissed/fired state | `date`, `taskId` |
| `events` | Calendar events — local, imported `.ics`, or Google (read-only) | `date`, `[connectionId+externalId]` |
| `days` | Per-date rating (1–5), reflection answers, selfie link | primary key `date` |
| `highlights` | One primary highlight per date | unique `date` |
| `notes` | Notes, optionally linked to a date; pin/archive | `date`, `tags*`, `updatedAt` |
| `photos` / `photoFiles` | Photo metadata + thumbnail / full-size Blob (split so galleries stay light) | `date`, `isSelfie` |
| `expenses` / `expenseCategories` | Manual expense log and categories (8 built-in, custom allowed) | `date`, `categoryId` |
| `studySubjects` / `studySessions` | Study subjects and recorded sessions (seconds, paused time excluded) | `date`, `subjectId` |
| `focusSessions` | Completed focus-mode sessions | `date` |
| `places` | Manually saved places (optional coordinates) | `date` |
| `screenTime` | Manually logged daily screen time | unique `date` |
| `routines` / `routineLogs` | Small tracked habits and their per-day completion | `routineId`, `date` |
| `recFeedback` | Recommendation shown/dismissed/helpful/unhelpful history | `ruleId`, `date` |
| `monthlyReflections` | Monthly reflection answers (+ optional AI summary) | primary key `month` |
| `integrations` | Calendar connections (no secrets stored) | `kind` |
| `kv` | Settings, active timers, recent searches | primary key `key` |

### Integrity rules

- Deleting a record never deletes other records. Deleting a photo *unlinks* it from the selfie/highlight/place that referenced it; Undo restores both.
- Recurring tasks: one row per occurrence, generated up to 14 days ahead (and further on demand). Completing one occurrence never completes another. Deleting one occurrence records an exception so it isn't regenerated. Editing "this and following" either updates future incomplete rows or, when the rule changes, ends the old series and starts a new one, so history is kept.
- Timers store timestamps, not ticks: elapsed = accumulated + (now − runningSince). The timer id becomes the saved session id, so a double-tap on "End" can't create two sessions.

### Migrations

Dexie versions the schema. To change it, add `this.version(2).stores({...}).upgrade(tx => …)` beneath the existing block in `src/db/db.ts`. Never edit a version that has shipped.

## Privacy model

- Nothing leaves the device by default. There is no backend, account, analytics or telemetry.
- Photos are Blobs in IndexedDB and shown via short-lived `blob:` URLs, so there are no public URLs.
- Location is only read when you press "Use my current location" with location features enabled in Settings.
- Map tiles (when enabled) are fetched from OpenStreetMap, which can see which map area is viewed.
- AI is off by default. When it's enabled and you've consented, only the minimal aggregated data needed for the request is sent to your own proxy, which forwards it to the AI provider. Photos, locations and full note bodies are never sent.
- Export (JSON) and Delete-all live in Settings → Data.
