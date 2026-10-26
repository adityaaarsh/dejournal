/**
 * DeJournal data model.
 *
 * Conventions
 * - `id`: random UUID string.
 * - `date`: the record's *local* calendar date as 'YYYY-MM-DD'. All-day and
 *   date-based records are keyed by this string so timezone changes never shift
 *   them to another day.
 * - `createdAt` / `updatedAt` / other `*At` fields: ISO-8601 UTC timestamps.
 * - `time` fields: local wall-clock 'HH:mm'.
 * - Money: integer minor units (e.g. paise) to avoid floating point errors.
 *
 * The app is local-first and single-profile: all data lives in this browser's
 * IndexedDB, so there is no userId column. A cloud sync layer would add one.
 */

export type ISODate = string // 'YYYY-MM-DD' (local)
export type ISODateTime = string // UTC ISO timestamp
export type HHmm = string // 'HH:mm' local

export interface BaseRecord {
  id: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export type Priority = 'low' | 'normal' | 'high'

/** Recurrence rule shared by task series and reminders. */
export interface Recurrence {
  /** daily: every day. weekly: same weekday as start. days: selected weekdays. */
  type: 'daily' | 'weekly' | 'days'
  /** Weekdays 0 (Sun) – 6 (Sat); used when type === 'days'. */
  days?: number[]
  /** Every N days/weeks. Defaults to 1. */
  interval?: number
}

export interface Task extends BaseRecord {
  title: string
  description?: string
  date: ISODate
  dueTime?: HHmm | null
  completed: boolean
  completedAt?: ISODateTime | null
  priority: Priority
  category?: string
  tags: string[]
  /** Set when this task is an occurrence of a recurring series. */
  seriesId?: string | null
  /** True when this occurrence was edited separately from its series. */
  detached?: boolean
  /** Manual ordering within a date (ascending). */
  order: number
  /** Original date if the task was carried forward / moved. */
  movedFrom?: ISODate | null
}

export interface TaskSeries extends BaseRecord {
  title: string
  description?: string
  priority: Priority
  category?: string
  tags: string[]
  dueTime?: HHmm | null
  recurrence: Recurrence
  startDate: ISODate
  endDate?: ISODate | null
  /** Dates whose occurrence was deleted individually (do not regenerate). */
  exceptions: ISODate[]
  /** Occurrences have been generated up to and including this date. */
  materializedThrough?: ISODate | null
}

export type ReminderStatus = 'pending' | 'done' | 'dismissed'

export interface Reminder extends BaseRecord {
  title: string
  description?: string
  /** First (or only) occurrence date. */
  date: ISODate
  time: HHmm
  taskId?: string | null
  recurrence?: Recurrence | null
  endDate?: ISODate | null
  /** Per-reminder notification switch. */
  notify: boolean
  /** Status for one-time reminders. */
  status: ReminderStatus
  /** For recurring reminders: occurrence dates marked done / dismissed. */
  doneDates: ISODate[]
  dismissedDates: ISODate[]
  /** If snoozed, the next fire time (UTC ISO) and occurrence it belongs to. */
  snoozedUntil?: ISODateTime | null
  snoozedFor?: ISODate | null
  /** Occurrence keys ('YYYY-MM-DD') already notified, to avoid repeats. */
  firedFor: ISODate[]
}

export type EventSource = 'local' | 'ics' | 'google'

export interface CalendarEvent extends BaseRecord {
  title: string
  description?: string
  location?: string
  date: ISODate
  /** Last day for multi-day events (inclusive). */
  endDate?: ISODate | null
  allDay: boolean
  startTime?: HHmm | null
  endTime?: HHmm | null
  source: EventSource
  /** Provider event id (for de-duplication of imported events). */
  externalId?: string | null
  /** IntegrationConnection id that imported it. */
  connectionId?: string | null
  calendarName?: string | null
}

export interface ReflectionAnswers {
  wentWell?: string
  difficult?: string
  learned?: string
  differently?: string
}

/** One row per local date that has day-level data (rating, reflection, selfie). */
export interface DayEntry {
  date: ISODate // primary key
  rating?: 1 | 2 | 3 | 4 | 5 | null
  reflection?: ReflectionAnswers
  selfiePhotoId?: string | null
  updatedAt: ISODateTime
}

export interface Highlight extends BaseRecord {
  date: ISODate // unique: one primary highlight per date
  title: string
  description?: string
  photoId?: string | null
  tags: string[]
}

export interface Note extends BaseRecord {
  title: string
  /** Plain text with lightweight markdown (**bold**, _italic_, - lists, # headings). */
  content: string
  date?: ISODate | null
  tags: string[]
  pinned: boolean
  archived: boolean
}

export interface PhotoLocation {
  lat: number
  lng: number
  label?: string
}

/** Photo metadata + small thumbnail. The full image lives in `photoFiles`. */
export interface Photo extends BaseRecord {
  date: ISODate
  caption?: string
  tags: string[]
  isSelfie: boolean
  takenAt?: ISODateTime | null
  location?: PhotoLocation | null
  width: number
  height: number
  mime: string
  /** ~320px JPEG thumbnail. */
  thumb: Blob
}

export interface PhotoFile {
  id: string // same id as Photo
  blob: Blob
}

export interface ExpenseCategory {
  id: string
  name: string
  /** lucide icon name hint (see lib/categoryIcons). */
  icon: string
  builtin: boolean
  archived?: boolean
  order: number
}

export interface Expense extends BaseRecord {
  /** Integer minor units (paise for INR). Always > 0. */
  amount: number
  currency: string
  description: string
  date: ISODate
  time?: HHmm | null
  categoryId: string
  paymentMethod?: string | null
  note?: string
}

export interface StudySubject {
  id: string
  name: string
  color: string
  archived: boolean
  createdAt: ISODateTime
}

export interface StudySession extends BaseRecord {
  subjectId?: string | null
  topic?: string
  date: ISODate
  startedAt?: ISODateTime | null
  endedAt?: ISODateTime | null
  /** Recorded duration in seconds (excludes paused time). */
  durationSec: number
  goal?: string
  notes?: string
  tags: string[]
  completed?: boolean
  source: 'timer' | 'manual'
}

/** Persisted running timer (study or focus). Stored in kv under 'activeStudyTimer'. */
export interface ActiveTimer {
  /** Stable id: reused as the session id when saved (prevents duplicates). */
  id: string
  kind: 'study' | 'focus'
  subjectId?: string | null
  topic?: string
  taskId?: string | null
  label?: string
  startedAt: ISODateTime
  /** Milliseconds accumulated in completed running segments. */
  accumulatedMs: number
  /** When the current running segment began; null while paused. */
  runningSince: ISODateTime | null
  /** Planned length for focus sessions (seconds); null = open-ended. */
  plannedSec?: number | null
  date: ISODate
}

export interface FocusSession extends BaseRecord {
  date: ISODate
  startedAt: ISODateTime
  endedAt: ISODateTime
  plannedSec?: number | null
  durationSec: number
  label?: string
  taskId?: string | null
  subjectId?: string | null
  completed: boolean
}

export interface SavedPlace extends BaseRecord {
  date: ISODate
  time?: HHmm | null
  name: string
  address?: string
  lat?: number | null
  lng?: number | null
  note?: string
  photoId?: string | null
  source: 'manual' | 'device'
}

export interface ScreenTimeRecord extends BaseRecord {
  date: ISODate // unique
  minutes: number
  /** Minutes per app category (Social, Video, …) when imported from the phone. */
  breakdown?: Record<string, number> | null
  note?: string
  source: 'manual' | 'import'
}

export interface Routine extends BaseRecord {
  name: string
  /** Weekdays it applies to (0–6). Empty = every day. */
  days: number[]
  active: boolean
  order: number
}

export interface RoutineLog {
  id: string // `${routineId}:${date}`
  routineId: string
  date: ISODate
  createdAt: ISODateTime
}

export type RecFeedbackAction = 'shown' | 'dismissed' | 'helpful' | 'unhelpful' | 'acted'

export interface RecommendationFeedback {
  id: string
  ruleId: string
  date: ISODate
  action: RecFeedbackAction
  createdAt: ISODateTime
}

export interface MonthlyReflection {
  month: string // 'YYYY-MM' primary key
  wentWell?: string
  proudOf?: string
  improve?: string
  prioritize?: string
  aiSummary?: string | null
  /** Date the reflection is filed under in the timeline (usually last day of month or day saved). */
  date: ISODate
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export type IntegrationKind = 'ics' | 'google' | 'ics-url'

export interface IntegrationConnection extends BaseRecord {
  kind: IntegrationKind
  name: string
  status: 'connected' | 'error' | 'revoked'
  lastSyncAt?: ISODateTime | null
  lastError?: string | null
  /** Non-secret metadata (calendar id, url, event count...). */
  meta?: Record<string, unknown>
}

export interface KV {
  key: string
  value: unknown
}
