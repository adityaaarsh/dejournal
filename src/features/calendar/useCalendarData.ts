import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type {
  CalendarEvent,
  DayEntry,
  Expense,
  Highlight,
  ISODate,
  Note,
  Photo,
  Reminder,
  SavedPlace,
  ScreenTimeRecord,
  StudySession,
  Task,
} from '@/db/types'
import { dateRange } from '@/lib/dates'
import { remindersOn } from '@/db/reminders'
import { eventCovers } from './events'

/** Every date-linked record in [start, end]. */
export interface RangeRecords {
  tasks: Task[]
  events: CalendarEvent[]
  reminders: Reminder[] // all reminders (occurrences resolved per date)
  days: DayEntry[]
  highlights: Highlight[]
  notes: Note[]
  photos: Photo[]
  expenses: Expense[]
  study: StudySession[]
  places: SavedPlace[]
  screenTime: ScreenTimeRecord[]
}

const between = (start: ISODate, end: ISODate) => [start, end, true, true] as const

export function useRangeRecords(start: ISODate, end: ISODate): RangeRecords | undefined {
  return useLiveQuery(async () => {
    const [tasks, events, reminders, days, highlights, notes, photos, expenses, study, places, screenTime] = await Promise.all([
      db.tasks.where('date').between(...between(start, end)).toArray(),
      // Multi-day events can start before the range.
      db.events
        .where('date')
        .belowOrEqual(end)
        .filter((e) => (e.endDate ?? e.date) >= start)
        .toArray(),
      db.reminders.toArray(),
      db.days.where('date').between(...between(start, end)).toArray(),
      db.highlights.where('date').between(...between(start, end)).toArray(),
      db.notes
        .where('date')
        .between(...between(start, end))
        .filter((n) => !n.archived)
        .toArray(),
      db.photos.where('date').between(...between(start, end)).toArray(),
      db.expenses.where('date').between(...between(start, end)).toArray(),
      db.studySessions.where('date').between(...between(start, end)).toArray(),
      db.places.where('date').between(...between(start, end)).toArray(),
      db.screenTime.where('date').between(...between(start, end)).toArray(),
    ])
    return { tasks, events, reminders, days, highlights, notes, photos, expenses, study, places, screenTime }
  }, [start, end])
}

export interface DayIndicators {
  events: number
  reminders: number
  tasks: number
  tasksDone: number
  notes: number
  photos: number
  expenses: number
  study: number
  places: number
  highlight: boolean
  rating: number | null
}

/** Dot groups shown in calendar cells (max 4, one per group). */
export type DotGroup = 'plans' | 'tasks' | 'journal' | 'tracking'

export const DOT_GROUPS: Array<{ id: DotGroup; label: string; className: string; description: string }> = [
  { id: 'plans', label: 'Plans', className: 'bg-accent', description: 'Events and reminders' },
  { id: 'tasks', label: 'Tasks', className: 'bg-text', description: 'Tasks scheduled' },
  { id: 'journal', label: 'Journal', className: 'bg-warn', description: 'Rating, highlight, notes, photos' },
  { id: 'tracking', label: 'Tracking', className: 'bg-success', description: 'Expenses and study' },
]

export function emptyIndicators(): DayIndicators {
  return { events: 0, reminders: 0, tasks: 0, tasksDone: 0, notes: 0, photos: 0, expenses: 0, study: 0, places: 0, highlight: false, rating: null }
}

/** Pure: per-date indicator counts for the given dates. */
export function buildIndicators(r: RangeRecords, dates: ISODate[]): Record<ISODate, DayIndicators> {
  const out: Record<ISODate, DayIndicators> = {}
  for (const d of dates) out[d] = emptyIndicators()
  const bump = (d: ISODate, f: (x: DayIndicators) => void) => out[d] && f(out[d])
  for (const t of r.tasks)
    bump(t.date, (x) => {
      x.tasks++
      if (t.completed) x.tasksDone++
    })
  for (const e of r.events) for (const d of dates) if (eventCovers(e, d)) out[d].events++
  for (const d of dates) out[d].reminders = remindersOn(r.reminders, d).length
  for (const n of r.notes) if (n.date) bump(n.date, (x) => x.notes++)
  for (const p of r.photos) bump(p.date, (x) => x.photos++)
  for (const e of r.expenses) bump(e.date, (x) => x.expenses++)
  for (const s of r.study) bump(s.date, (x) => x.study++)
  for (const p of r.places) bump(p.date, (x) => x.places++)
  for (const h of r.highlights) bump(h.date, (x) => (x.highlight = true))
  for (const day of r.days) bump(day.date, (x) => (x.rating = day.rating ?? null))
  return out
}

export function dotGroups(x: DayIndicators | undefined): DotGroup[] {
  if (!x) return []
  const g: DotGroup[] = []
  if (x.events || x.reminders) g.push('plans')
  if (x.tasks) g.push('tasks')
  if (x.rating || x.highlight || x.notes || x.photos || x.places) g.push('journal')
  if (x.expenses || x.study) g.push('tracking')
  return g
}

/** Short screen-reader description of a day's activity. */
export function describeIndicators(x: DayIndicators | undefined): string {
  if (!x) return 'No activity'
  const parts: string[] = []
  if (x.events) parts.push(`${x.events} event${x.events > 1 ? 's' : ''}`)
  if (x.reminders) parts.push(`${x.reminders} reminder${x.reminders > 1 ? 's' : ''}`)
  if (x.tasks) parts.push(`${x.tasksDone} of ${x.tasks} tasks done`)
  if (x.rating) parts.push(`rated ${x.rating} of 5`)
  if (x.highlight) parts.push('highlight')
  if (x.notes) parts.push(`${x.notes} note${x.notes > 1 ? 's' : ''}`)
  if (x.photos) parts.push(`${x.photos} photo${x.photos > 1 ? 's' : ''}`)
  if (x.expenses) parts.push(`${x.expenses} expense${x.expenses > 1 ? 's' : ''}`)
  if (x.study) parts.push(`${x.study} study session${x.study > 1 ? 's' : ''}`)
  if (x.places) parts.push(`${x.places} place${x.places > 1 ? 's' : ''}`)
  return parts.length ? parts.join(', ') : 'No activity'
}

export function useRangeIndicators(start: ISODate, end: ISODate) {
  const records = useRangeRecords(start, end)
  return { records, indicators: records ? buildIndicators(records, dateRange(start, end)) : undefined }
}
