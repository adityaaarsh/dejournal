import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  Images,
  ListChecks,
  MapPin,
  NotebookPen,
  Plus,
  Smartphone,
  Sparkles,
  Star,
  Wallet,
} from 'lucide-react'
import { db } from '@/db/db'
import type { CalendarEvent, ISODate, Photo } from '@/db/types'
import { useObjectUrl } from '@/db/photos'
import { occurrenceState, remindersOn } from '@/db/reminders'
import { sortTasks, toggleTask } from '@/db/tasks'
import { hasReflection } from '@/db/days'
import { Button, LoadingState, MOOD_FACES, RECORD_TONE, TimelineRow } from '@/components/ui'
import { formatDate, formatTime, isoToLocalTime, today } from '@/lib/dates'
import { formatDuration } from '@/lib/duration'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/text'
import { openDialog } from '@/stores/ui'
import { useSettings } from '@/stores/settings'
import { useRangeRecords } from './useCalendarData'
import { eventCovers, sortEvents, sourceLabel } from './events'

export function SourceBadge({ event }: { event: CalendarEvent }) {
  const label = sourceLabel(event)
  if (!label) return null
  return (
    <span className="inline-flex h-5 max-w-28 shrink-0 items-center truncate rounded-md border border-line bg-surface-2 px-1.5 text-[10px] font-medium text-muted" title={`Imported from ${label}`}>
      {event.source === 'google' ? 'Google' : label}
    </span>
  )
}

function eventTime(e: CalendarEvent): string {
  if (e.allDay) return 'All day'
  if (e.startTime && e.endTime) return `${formatTime(e.startTime)} – ${formatTime(e.endTime)}`
  return formatTime(e.startTime) || 'All day'
}

/** 24h "HH:mm" label for the time column (compact, like the design). */
const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')

function Thumb({ photo }: { photo: Photo }) {
  const url = useObjectUrl(photo.thumb)
  return (
    <Link
      to={`/photos?open=${photo.id}`}
      className="relative block h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-2"
      aria-label={photo.caption ? `Photo: ${photo.caption}` : 'Open photo'}
    >
      {url && <img src={url} alt={photo.caption ?? ''} className="h-full w-full object-cover" loading="lazy" />}
      {photo.isSelfie && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] font-medium text-white">Selfie</span>}
    </Link>
  )
}

interface Item {
  key: string
  /** Sort key: '' = untimed; 'all-day' sorts first. */
  sort: string
  node: ReactNode
}

/**
 * Everything linked to one date as a timeline card: a header ("Thursday 22",
 * "+ Add") and one row per record — time | coloured icon tile | title +
 * subtitle. Every row opens its editor.
 */
export function DayAgenda({
  date,
  className,
  compact,
  showOpenToday = true,
}: {
  date: ISODate
  className?: string
  /** Week view: tighter empty state, no extra actions. */
  compact?: boolean
  showOpenToday?: boolean
}) {
  const settings = useSettings()
  const r = useRangeRecords(date, date)
  const categories = useLiveQuery(() => db.expenseCategories.toArray(), [])
  const subjects = useLiveQuery(() => db.studySubjects.toArray(), [])
  const isToday = date === today()
  const sameYear = date.slice(0, 4) === today().slice(0, 4)

  const header = (
    <div className="flex items-center gap-2 pb-1">
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[14px] font-semibold">{formatDate(date, compact ? 'EEE d' : sameYear ? 'EEEE d' : 'EEE d MMM yyyy')}</h3>
        {isToday && !compact && <p className="text-[11px] font-semibold text-accent">Today</p>}
      </div>
      {showOpenToday && !compact && (
        <Link to={`/?d=${date}`} className="rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-surface-2 hover:text-text">
          Open in Today
        </Link>
      )}
      <button
        type="button"
        onClick={() => openDialog({ kind: 'quick', date })}
        className="inline-flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-[13px] font-semibold text-accent hover:bg-accent-soft"
        aria-label={`Add to ${formatDate(date, 'EEEE d MMMM')}`}
      >
        <Plus size={14} strokeWidth={2.6} aria-hidden /> Add
      </button>
    </div>
  )

  const shell = (children: ReactNode) => (
    <section aria-label={formatDate(date, 'EEEE d MMMM')} className={cn('rounded-[var(--radius-card)] border border-line bg-surface px-3 pt-2.5 pb-1.5', className)}>
      {header}
      {children}
    </section>
  )

  if (!r) return shell(<LoadingState />)

  const day = r.days.find((d) => d.date === date)
  const highlight = r.highlights.find((h) => h.date === date)
  const events = sortEvents(r.events.filter((e) => eventCovers(e, date)))
  const reminders = remindersOn(r.reminders, date)
  const tasks = sortTasks(r.tasks.filter((t) => t.date === date))
  const study = r.study.filter((s) => s.date === date)
  const expenses = r.expenses.filter((e) => e.date === date)
  const notes = r.notes.filter((n) => n.date === date)
  const photos = r.photos.filter((p) => p.date === date).sort((a, b) => Number(b.isSelfie) - Number(a.isSelfie) || a.createdAt.localeCompare(b.createdAt))
  const places = r.places.filter((p) => p.date === date)
  const screen = r.screenTime.find((s) => s.date === date)

  const rating = day?.rating ?? null
  const reflection = day?.reflection
  const reflectionText = hasReflection(reflection) ? [reflection?.wentWell, reflection?.learned, reflection?.difficult, reflection?.differently].find((v) => v?.trim()) : null

  const catName = (id: string) => categories?.find((c) => c.id === id)?.name ?? 'Other'
  const subjName = (id?: string | null) => (id ? subjects?.find((s) => s.id === id)?.name : undefined)

  const items: Item[] = []

  // Day-level entries first: mood + reflection, highlight.
  if (rating || reflectionText) {
    const Face = rating ? MOOD_FACES[rating - 1] : Star
    items.push({
      key: 'mood',
      sort: '!0',
      node: (
        <TimelineRow
          time=""
          icon={Face}
          tone={RECORD_TONE.reflection}
          title={rating ? `${settings.ratingLabels[rating - 1]} · ${rating}/5` : 'Reflection'}
          subtitle={reflectionText ?? 'Mood'}
          onClick={() => openDialog({ kind: 'rating', date })}
        />
      ),
    })
  }
  if (highlight) {
    items.push({
      key: 'highlight',
      sort: '!1',
      node: (
        <TimelineRow
          time=""
          icon={Sparkles}
          tone={RECORD_TONE.highlight}
          title={highlight.title}
          subtitle={highlight.description || 'Highlight'}
          onClick={() => openDialog({ kind: 'highlight', date, highlight })}
        />
      ),
    })
  }

  for (const e of events) {
    items.push({
      key: `e-${e.id}`,
      sort: e.allDay ? '!2' : (e.startTime ?? ''),
      node: (
        <TimelineRow
          time={e.allDay ? 'All day' : hhmm(e.startTime)}
          icon={CalendarDays}
          tone={RECORD_TONE.event}
          title={e.title}
          subtitle={[eventTime(e), e.location].filter(Boolean).join(' · ')}
          trailing={<SourceBadge event={e} />}
          onClick={() => openDialog({ kind: 'event', date, event: e })}
        />
      ),
    })
  }

  for (const rem of reminders) {
    const state = occurrenceState(rem, date)
    items.push({
      key: `r-${rem.id}`,
      sort: rem.time,
      node: (
        <TimelineRow
          time={hhmm(rem.time)}
          icon={Bell}
          tone={RECORD_TONE.reminder}
          title={rem.title}
          subtitle={state === 'done' ? 'Reminder · done' : state === 'dismissed' ? 'Reminder · dismissed' : rem.recurrence ? 'Reminder · repeats' : 'Reminder'}
          done={state !== 'pending'}
          onClick={() => openDialog({ kind: 'reminder', date, reminder: rem })}
        />
      ),
    })
  }

  for (const t of tasks) {
    items.push({
      key: `t-${t.id}`,
      sort: t.dueTime ?? '~1',
      node: (
        <div className="flex items-center gap-1">
          <TimelineRow
            className="min-w-0 flex-1"
            time={hhmm(t.dueTime)}
            icon={ListChecks}
            tone={RECORD_TONE.task}
            title={t.title}
            subtitle={['Task', t.completed ? 'done' : t.priority === 'high' ? 'high priority' : null].filter(Boolean).join(' · ')}
            done={t.completed}
            onClick={() => openDialog({ kind: 'task', task: t, date })}
          />
          <button
            type="button"
            role="checkbox"
            aria-checked={t.completed}
            aria-label={`Mark "${t.title}" ${t.completed ? 'incomplete' : 'complete'}`}
            onClick={() => toggleTask(t.id)}
            className="grid h-11 w-9 shrink-0 place-items-center"
          >
            <span
              className={cn(
                'grid h-[19px] w-[19px] place-items-center rounded-full border-[1.5px] transition-colors',
                t.completed ? 'border-accent bg-accent text-on-accent' : 'border-faint hover:border-accent',
              )}
            >
              {t.completed && <Check size={12} strokeWidth={3.4} />}
            </span>
          </button>
        </div>
      ),
    })
  }

  for (const s of study) {
    const start = s.startedAt ? isoToLocalTime(s.startedAt) : ''
    items.push({
      key: `s-${s.id}`,
      sort: start || '~2',
      node: (
        <TimelineRow
          time={start}
          icon={BookOpen}
          tone={RECORD_TONE.study}
          title={[subjName(s.subjectId), s.topic].filter(Boolean).join(' · ') || 'Study session'}
          subtitle={`Study · ${formatDuration(s.durationSec)}`}
          onClick={() => openDialog({ kind: 'study', date, session: s })}
        />
      ),
    })
  }

  for (const e of expenses) {
    items.push({
      key: `x-${e.id}`,
      sort: e.time ?? '~3',
      node: (
        <TimelineRow
          time={hhmm(e.time)}
          icon={Wallet}
          tone={RECORD_TONE.expense}
          title={e.description || catName(e.categoryId)}
          subtitle={`${formatMoney(e.amount, e.currency)} · ${catName(e.categoryId)}`}
          onClick={() => openDialog({ kind: 'expense', date, expense: e })}
        />
      ),
    })
  }

  for (const p of places) {
    items.push({
      key: `p-${p.id}`,
      sort: p.time ?? '~4',
      node: <TimelineRow time={hhmm(p.time)} icon={MapPin} tone={RECORD_TONE.place} title={p.name} subtitle={p.address || 'Place'} to={`/places?open=${p.id}`} />,
    })
  }

  for (const n of notes) {
    items.push({
      key: `n-${n.id}`,
      sort: '~5',
      node: (
        <TimelineRow
          time=""
          icon={NotebookPen}
          tone={RECORD_TONE.note}
          title={n.title || 'Untitled note'}
          subtitle={n.content ? n.content.replace(/[#*_>`-]/g, '').slice(0, 100) : 'Note'}
          to={`/notes/${n.id}`}
        />
      ),
    })
  }

  if (screen) {
    items.push({
      key: 'screen',
      sort: '~6',
      node: (
        <TimelineRow
          time=""
          icon={Smartphone}
          tone={RECORD_TONE.screentime}
          title={formatDuration(screen.minutes * 60)}
          subtitle={screen.source === 'manual' ? 'Screen time · logged' : 'Screen time · from phone'}
          to="/screen-time"
        />
      ),
    })
  }

  if (photos.length) {
    items.push({
      key: 'photos',
      sort: '~7',
      node: (
        <div>
          <TimelineRow time="" icon={Images} tone={RECORD_TONE.photo} title={`${photos.length} photo${photos.length > 1 ? 's' : ''}`} subtitle="Photo diary" to={`/photos?d=${date}`} />
          <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1.5 pl-[107px]">
            {photos.map((p) => (
              <Thumb key={p.id} photo={p} />
            ))}
          </div>
        </div>
      ),
    })
  }

  if (!items.length) {
    return shell(
      compact ? (
        <p className="pb-2 text-xs text-faint">Nothing planned</p>
      ) : (
        <div className="flex flex-col items-center gap-2 px-2 pt-3 pb-4 text-center">
          <p className="text-[13px] text-muted">Nothing recorded on this day.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="subtle" icon={Plus} onClick={() => openDialog({ kind: 'quick', date })}>
              Add
            </Button>
            <Button size="sm" variant="ghost" icon={Star} onClick={() => openDialog({ kind: 'rating', date })}>
              Rate day
            </Button>
          </div>
        </div>
      ),
    )
  }

  // '!' (day-level, all-day) < times '00:00'… < '~' (untimed, by type)
  // Plain code-point order: localeCompare would sort punctuation before digits.
  items.sort((a, b) => {
    const x = a.sort || '~'
    const y = b.sort || '~'
    return x < y ? -1 : x > y ? 1 : 0
  })

  return shell(
    <ul className="dj-tl-group flex flex-col">
      {items.map((it) => (
        <li key={it.key}>{it.node}</li>
      ))}
    </ul>,
  )
}
