import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Images,
  ListChecks,
  MapPin,
  NotebookPen,
  Plus,
  Smartphone,
  Sparkles,
  Star,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { db } from '@/db/db'
import type { CalendarEvent, ISODate, Photo, Reminder } from '@/db/types'
import { useObjectUrl } from '@/db/photos'
import { occurrenceState, remindersOn } from '@/db/reminders'
import { sortTasks, toggleTask } from '@/db/tasks'
import { hasReflection } from '@/db/days'
import { Button, Card, Chip, EmptyState, LoadingState } from '@/components/ui'
import { formatTime } from '@/lib/dates'
import { formatDuration } from '@/lib/duration'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/text'
import { openDialog } from '@/stores/ui'
import { useSettings } from '@/stores/settings'
import { useRangeRecords } from './useCalendarData'
import { eventCovers, sortEvents, sourceLabel } from './events'

function Group({ title, icon: Icon, aside, to, children }: { title: string; icon: LucideIcon; aside?: ReactNode; to?: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-3 first:border-t-0 first:pt-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-muted">
          <Icon size={15} strokeWidth={1.9} aria-hidden />
          {to ? (
            <Link to={to} className="inline-flex items-center gap-0.5 hover:text-text">
              {title}
              <ChevronRight size={13} className="opacity-60" aria-hidden />
            </Link>
          ) : (
            title
          )}
        </h3>
        {aside && <div className="text-[13px] text-muted tabular-nums">{aside}</div>}
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  )
}

/** One clickable row. */
function Row({ onClick, to, children, className }: { onClick?: () => void; to?: string; children: ReactNode; className?: string }) {
  const cls = cn('-mx-2 flex min-h-11 w-[calc(100%+16px)] items-center gap-3 rounded-lg px-2 py-1.5 text-left text-[15px] transition-colors hover:bg-surface-2', className)
  if (to)
    return (
      <Link to={to} className={cls}>
        {children}
      </Link>
    )
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  )
}

export function SourceBadge({ event }: { event: CalendarEvent }) {
  const label = sourceLabel(event)
  if (!label) return null
  return (
    <span className="inline-flex h-5 max-w-36 shrink-0 items-center truncate rounded-md border border-line bg-surface-2 px-1.5 text-[10px] font-medium text-muted" title={`Imported from ${label}`}>
      {event.source === 'google' ? 'Google' : label}
    </span>
  )
}

function eventTime(e: CalendarEvent): string {
  if (e.allDay) return 'All day'
  if (e.startTime && e.endTime) return `${formatTime(e.startTime)} – ${formatTime(e.endTime)}`
  return formatTime(e.startTime) || 'All day'
}

function Thumb({ photo }: { photo: Photo }) {
  const url = useObjectUrl(photo.thumb)
  return (
    <Link
      to={`/photos?open=${photo.id}`}
      className="relative block h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-2"
      aria-label={photo.caption ? `Photo: ${photo.caption}` : 'Open photo'}
    >
      {url && <img src={url} alt={photo.caption ?? ''} className="h-full w-full object-cover" loading="lazy" />}
      {photo.isSelfie && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] font-medium text-white">Selfie</span>}
    </Link>
  )
}

function ReminderStateDot({ r, date }: { r: Reminder; date: ISODate }) {
  const s = occurrenceState(r, date)
  return (
    <span
      className={cn(
        'grid h-5 w-5 shrink-0 place-items-center rounded-full border',
        s === 'done' && 'border-success bg-success-soft text-success',
        s === 'dismissed' && 'border-line text-faint',
        s === 'pending' && 'border-accent/60 text-accent',
      )}
      aria-label={s === 'done' ? 'Done' : s === 'dismissed' ? 'Dismissed' : 'Pending'}
    >
      {s === 'done' ? <Check size={12} strokeWidth={2.5} /> : <Bell size={11} />}
    </span>
  )
}

/** Everything linked to one date, each item opening its editor. */
export function DayAgenda({ date, className }: { date: ISODate; className?: string }) {
  const settings = useSettings()
  const r = useRangeRecords(date, date)
  const categories = useLiveQuery(() => db.expenseCategories.toArray(), [])
  const subjects = useLiveQuery(() => db.studySubjects.toArray(), [])

  if (!r) return <LoadingState />

  const day = r.days.find((d) => d.date === date)
  const highlight = r.highlights.find((h) => h.date === date)
  const events = sortEvents(r.events.filter((e) => eventCovers(e, date)))
  const reminders = remindersOn(r.reminders, date)
  const tasks = sortTasks(r.tasks.filter((t) => t.date === date))
  const study = r.study.filter((s) => s.date === date).sort((a, b) => (a.startedAt ?? a.createdAt).localeCompare(b.startedAt ?? b.createdAt))
  const expenses = r.expenses.filter((e) => e.date === date).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '') || a.createdAt.localeCompare(b.createdAt))
  const notes = r.notes.filter((n) => n.date === date)
  const photos = r.photos.filter((p) => p.date === date).sort((a, b) => Number(b.isSelfie) - Number(a.isSelfie) || a.createdAt.localeCompare(b.createdAt))
  const places = r.places.filter((p) => p.date === date).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
  const screen = r.screenTime.find((s) => s.date === date)

  const rating = day?.rating ?? null
  const reflection = day?.reflection
  const reflectionText = hasReflection(reflection) ? [reflection?.wentWell, reflection?.learned, reflection?.difficult, reflection?.differently].find((v) => v?.trim()) : null

  const studyTotal = study.reduce((s, x) => s + x.durationSec, 0)
  // Sum per currency so mixed currencies are never added together.
  const byCurrency = new Map<string, number>()
  for (const e of expenses) byCurrency.set(e.currency, (byCurrency.get(e.currency) ?? 0) + e.amount)
  const expenseTotal = [...byCurrency.entries()].map(([c, v]) => formatMoney(v, c)).join(' + ')

  const catName = (id: string) => categories?.find((c) => c.id === id)?.name ?? 'Other'
  const subjName = (id?: string | null) => (id ? subjects?.find((s) => s.id === id)?.name : undefined)

  const isEmpty =
    !rating && !reflectionText && !highlight && !events.length && !reminders.length && !tasks.length && !study.length && !expenses.length && !notes.length && !photos.length && !places.length && !screen

  if (isEmpty) {
    return (
      <Card className={cn('p-4', className)}>
        <EmptyState
          compact
          icon={CalendarDays}
          title="Nothing recorded on this day"
          description="Add a task, event, note or memory to this date."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" variant="subtle" icon={Plus} onClick={() => openDialog({ kind: 'quick', date })}>
                Add
              </Button>
              <Button size="sm" variant="ghost" icon={Star} onClick={() => openDialog({ kind: 'rating', date })}>
                Rate day
              </Button>
            </div>
          }
        />
      </Card>
    )
  }

  const doneCount = tasks.filter((t) => t.completed).length

  return (
    <Card className={cn('flex flex-col gap-3 p-4', className)}>
      {(rating || reflectionText) && (
        <Group title="Reflection" icon={Star} to="/journal">
          <Row onClick={() => openDialog({ kind: 'rating', date })}>
            {rating ? (
              <span className="flex shrink-0 items-center gap-0.5" aria-label={`Rated ${rating} of 5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} size={15} className={n <= rating ? 'fill-warn text-warn' : 'text-faint'} aria-hidden />
                ))}
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              {rating && <span className="text-[13px] text-muted">{settings.ratingLabels[rating - 1]}</span>}
              {reflectionText && <span className="block truncate text-sm">{reflectionText}</span>}
            </span>
          </Row>
        </Group>
      )}

      {highlight && (
        <Group title="Highlight" icon={Sparkles} to="/highlights">
          <Row onClick={() => openDialog({ kind: 'highlight', date, highlight })}>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{highlight.title}</span>
              {highlight.description && <span className="block truncate text-[13px] text-muted">{highlight.description}</span>}
            </span>
          </Row>
        </Group>
      )}

      {(events.length > 0 || reminders.length > 0) && (
        <Group title="Schedule" icon={CalendarDays}>
          {events.map((e) => (
            <Row key={e.id} onClick={() => openDialog({ kind: 'event', date, event: e })}>
              <span className="w-[72px] shrink-0 text-xs text-muted tabular-nums">{e.allDay ? 'All day' : formatTime(e.startTime)}</span>
              <span className="h-8 w-0.5 shrink-0 rounded-full bg-accent" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{e.title}</span>
                <span className="block truncate text-xs text-muted">
                  {eventTime(e)}
                  {e.location ? ` · ${e.location}` : ''}
                </span>
              </span>
              <SourceBadge event={e} />
            </Row>
          ))}
          {reminders.map((rem) => (
            <Row key={rem.id} onClick={() => openDialog({ kind: 'reminder', date, reminder: rem })}>
              <span className="w-[72px] shrink-0 text-xs text-muted tabular-nums">{formatTime(rem.time)}</span>
              <ReminderStateDot r={rem} date={date} />
              <span className={cn('min-w-0 flex-1 truncate', occurrenceState(rem, date) !== 'pending' && 'text-muted line-through')}>{rem.title}</span>
            </Row>
          ))}
        </Group>
      )}

      {tasks.length > 0 && (
        <Group title="Tasks" icon={ListChecks} to="/tasks" aside={`${doneCount}/${tasks.length} done`}>
          {tasks.map((t) => (
            <div key={t.id} className="-mx-2 flex min-h-11 items-center gap-1 rounded-lg px-2 hover:bg-surface-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={t.completed}
                aria-label={`Mark "${t.title}" ${t.completed ? 'incomplete' : 'complete'}`}
                onClick={() => toggleTask(t.id)}
                className="-ml-2 grid h-11 w-11 shrink-0 place-items-center"
              >
                <span
                  className={cn(
                    'grid h-5 w-5 place-items-center rounded-md border transition-colors',
                    t.completed ? 'border-accent bg-accent text-on-accent' : 'border-line-strong',
                  )}
                >
                  {t.completed && <Check size={13} strokeWidth={3} />}
                </span>
              </button>
              <button type="button" onClick={() => openDialog({ kind: 'task', task: t, date })} className="min-w-0 flex-1 py-2 text-left">
                <span className={cn('block truncate text-[15px]', t.completed && 'text-muted line-through')}>{t.title}</span>
              </button>
              {t.dueTime && <span className="shrink-0 text-xs text-muted tabular-nums">{formatTime(t.dueTime)}</span>}
              {t.priority === 'high' && !t.completed && (
                <Chip tone="warn" className="h-5 px-1.5 text-[10px]">
                  High
                </Chip>
              )}
            </div>
          ))}
        </Group>
      )}

      {study.length > 0 && (
        <Group title="Study" icon={BookOpen} to="/study" aside={formatDuration(studyTotal)}>
          {study.map((s) => (
            <Row key={s.id} onClick={() => openDialog({ kind: 'study', date, session: s })}>
              <span className="min-w-0 flex-1 truncate">{[subjName(s.subjectId), s.topic].filter(Boolean).join(' · ') || 'Study session'}</span>
              <span className="shrink-0 text-[13px] text-muted tabular-nums">{formatDuration(s.durationSec)}</span>
            </Row>
          ))}
        </Group>
      )}

      {expenses.length > 0 && (
        <Group title="Expenses" icon={Wallet} to="/expenses" aside={expenseTotal}>
          {expenses.map((e) => (
            <Row key={e.id} onClick={() => openDialog({ kind: 'expense', date, expense: e })}>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{e.description || catName(e.categoryId)}</span>
                <span className="block text-xs text-muted">{catName(e.categoryId)}</span>
              </span>
              <span className="shrink-0 text-[15px] tabular-nums">{formatMoney(e.amount, e.currency)}</span>
            </Row>
          ))}
        </Group>
      )}

      {notes.length > 0 && (
        <Group title="Notes" icon={NotebookPen} to="/notes">
          {notes.map((n) => (
            <Row key={n.id} to={`/notes/${n.id}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{n.title || 'Untitled note'}</span>
                {n.content && <span className="block truncate text-xs text-muted">{n.content.slice(0, 120)}</span>}
              </span>
            </Row>
          ))}
        </Group>
      )}

      {photos.length > 0 && (
        <Group title="Photos" icon={Images} to={`/photos?d=${date}`} aside={photos.length}>
          <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
            {photos.map((p) => (
              <Thumb key={p.id} photo={p} />
            ))}
          </div>
        </Group>
      )}

      {places.length > 0 && (
        <Group title="Places" icon={MapPin} to="/places">
          {places.map((p) => (
            <Row key={p.id} to={`/places?open=${p.id}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{p.name}</span>
                {p.address && <span className="block truncate text-xs text-muted">{p.address}</span>}
              </span>
              {p.time && <span className="shrink-0 text-xs text-muted">{formatTime(p.time)}</span>}
            </Row>
          ))}
        </Group>
      )}

      {screen && (
        <Group title="Screen time" icon={Smartphone} to="/screen-time">
          <Row to="/screen-time">
            <span className="flex-1">{formatDuration(screen.minutes * 60)}</span>
            <span className="text-xs text-muted">{screen.source === 'manual' ? 'Logged manually' : 'Imported'}</span>
          </Row>
        </Group>
      )}
    </Card>
  )
}
