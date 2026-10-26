import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bell, CalendarDays, Check, NotebookPen, Repeat } from 'lucide-react'
import { db } from '@/db/db'
import type { ISODate } from '@/db/types'
import { occurrenceState, remindersOn, setOccurrenceState } from '@/db/reminders'
import { useObjectUrl } from '@/db/photos'
import { routineAppliesOn, toggleRoutineLog } from '@/db/routines'
import { SectionCard } from '@/components/ui'
import { formatTime } from '@/lib/dates'
import { cn, plural } from '@/lib/text'
import { openDialog } from '@/stores/ui'

/* Optional Today sections (off by default): agenda, routines, recent activity. */

/* ------------------------------------------------------------------ */
/* Agenda: events + reminders                                          */
/* ------------------------------------------------------------------ */

export function AgendaSection({ date }: { date: ISODate }) {
  const events = useLiveQuery(
    () =>
      db.events
        .where('date')
        .belowOrEqual(date)
        .filter((e) => (e.endDate ?? e.date) >= date)
        .toArray(),
    [date],
  )
  const reminders = useLiveQuery(async () => remindersOn(await db.reminders.toArray(), date), [date])
  if (events === undefined || reminders === undefined) return null
  if (!events.length && !reminders.length) return null

  type Row = { key: string; time: string; node: React.ReactNode }
  const rows: Row[] = [
    ...events.map((e) => ({
      key: `e-${e.id}`,
      time: e.allDay ? '00:00' : (e.startTime ?? '00:00'),
      node: (
        <button
          type="button"
          onClick={() => openDialog({ kind: 'event', event: e, date })}
          className="flex min-h-11 w-full items-center gap-3 py-1.5 text-left"
        >
          <span className="w-16 shrink-0 text-xs text-muted tabular-nums">{e.allDay ? 'All day' : formatTime(e.startTime)}</span>
          <span className="h-6 w-0.5 shrink-0 rounded-full bg-accent" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px]">{e.title}</span>
            {(e.location || e.source !== 'local') && (
              <span className="block truncate text-xs text-faint">
                {[e.location, e.source !== 'local' ? (e.calendarName ?? 'Imported') : null].filter(Boolean).join(' · ')}
              </span>
            )}
          </span>
        </button>
      ),
    })),
    ...reminders.map((r) => {
      const state = occurrenceState(r, date)
      return {
        key: `r-${r.id}`,
        time: r.time,
        node: (
          <div className="flex min-h-11 items-center gap-3 py-1.5">
            <span className="w-16 shrink-0 text-xs text-muted tabular-nums">{formatTime(r.time)}</span>
            <button
              type="button"
              role="checkbox"
              aria-checked={state === 'done'}
              aria-label={state === 'done' ? `Mark reminder "${r.title}" not done` : `Mark reminder "${r.title}" done`}
              onClick={() => setOccurrenceState(r.id, date, state === 'done' ? 'pending' : 'done')}
              className={cn(
                'grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors',
                state === 'done' ? 'border-accent bg-accent text-on-accent' : 'border-line-strong text-faint',
              )}
            >
              {state === 'done' ? <Check size={13} strokeWidth={3} aria-hidden /> : <Bell size={11} aria-hidden />}
            </button>
            <button type="button" onClick={() => openDialog({ kind: 'reminder', reminder: r, date })} className="min-w-0 flex-1 text-left">
              <span className={cn('block truncate text-[15px]', state !== 'pending' && 'text-faint line-through')}>{r.title}</span>
              {r.recurrence && (
                <span className="inline-flex items-center gap-1 text-xs text-faint">
                  <Repeat size={11} aria-hidden /> Repeats
                </span>
              )}
            </button>
          </div>
        ),
      }
    }),
  ].sort((a, b) => a.time.localeCompare(b.time))

  return (
    <SectionCard title="Agenda" icon={CalendarDays} to={`/calendar?view=day&d=${date}`} linkLabel="Open in calendar">
      <ul>
        {rows.map((r) => (
          <li key={r.key}>{r.node}</li>
        ))}
      </ul>
    </SectionCard>
  )
}

/* ------------------------------------------------------------------ */
/* Routines                                                            */
/* ------------------------------------------------------------------ */

export function RoutinesSection({ date }: { date: ISODate }) {
  const routines = useLiveQuery(async () => (await db.routines.toArray()).filter((r) => routineAppliesOn(r, date)).sort((a, b) => a.order - b.order), [date])
  const logs = useLiveQuery(() => db.routineLogs.where('date').equals(date).toArray(), [date])
  if (!routines?.length) return null
  const done = new Set((logs ?? []).map((l) => l.routineId))
  return (
    <SectionCard
      title="Routines"
      icon={Repeat}
      to="/routines"
      linkLabel="Manage routines"
      action={
        <span className="text-xs text-faint tabular-nums">
          {routines.filter((r) => done.has(r.id)).length}/{routines.length}
        </span>
      }
    >
      <div className="flex flex-wrap gap-2">
        {routines.map((r) => {
          const on = done.has(r.id)
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggleRoutineLog(r.id, date)}
              className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors',
                on ? 'border-transparent bg-success-soft text-success' : 'border-line bg-surface-2 text-muted hover:text-text',
              )}
            >
              {on && <Check size={14} strokeWidth={2.6} aria-hidden />}
              {r.name}
            </button>
          )
        })}
      </div>
    </SectionCard>
  )
}

/* ------------------------------------------------------------------ */
/* Activity: notes + photos linked to the date                          */
/* ------------------------------------------------------------------ */

function Thumb({ blob, alt }: { blob: Blob; alt: string }) {
  const url = useObjectUrl(blob)
  return url ? <img src={url} alt={alt} className="h-16 w-16 shrink-0 rounded-xl object-cover" /> : <div className="h-16 w-16 shrink-0 rounded-xl bg-surface-2" />
}

export function ActivitySection({ date }: { date: ISODate }) {
  const notes = useLiveQuery(() => db.notes.where('date').equals(date).filter((n) => !n.archived).toArray(), [date])
  const photos = useLiveQuery(() => db.photos.where('date').equals(date).sortBy('createdAt'), [date])
  if (!notes?.length && !photos?.length) return null
  return (
    <SectionCard title="Notes & photos" icon={NotebookPen}>
      {!!photos?.length && (
        <Link to={`/photos?d=${date}`} className="-mx-1 mb-2 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none" aria-label={`${plural(photos.length, 'photo')} on this day`}>
          {photos.map((p) => (
            <Thumb key={p.id} blob={p.thumb} alt={p.caption ?? (p.isSelfie ? 'Selfie' : 'Photo')} />
          ))}
        </Link>
      )}
      {!!notes?.length && (
        <ul className="flex flex-col">
          {notes
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map((n) => (
              <li key={n.id}>
                <Link to={`/notes/${n.id}`} className="block rounded-lg py-2 hover:text-accent">
                  <span className="block truncate text-[15px]">{n.title || 'Untitled note'}</span>
                  {n.content && <span className="block truncate text-xs text-faint">{n.content.replace(/[#*_>-]/g, '').slice(0, 120)}</span>}
                </Link>
              </li>
            ))}
        </ul>
      )}
    </SectionCard>
  )
}
