import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bell,
  CalendarDays,
  Camera,
  Check,
  Eye,
  EyeOff,
  ListChecks,
  NotebookPen,
  Plus,
  Repeat,
  Sparkles,
  Star,
  UserRound,
} from 'lucide-react'
import { db } from '@/db/db'
import type { ISODate, Task } from '@/db/types'
import { createTask, moveTask, sortTasks } from '@/db/tasks'
import { occurrenceState, remindersOn, setOccurrenceState } from '@/db/reminders'
import { setRating, hasReflection } from '@/db/days'
import { usePhotoUrl, useObjectUrl } from '@/db/photos'
import { useTimer, elapsedMs } from '@/db/timers'
import { routineAppliesOn, toggleRoutineLog } from '@/db/routines'
import { Card, ProgressBar, SectionCard, StatTile } from '@/components/ui'
import { TaskItem } from '@/features/tasks/TaskItem'
import { taskStats } from '@/domain/taskStats'
import { formatTime, relativeDayLabel, today } from '@/lib/dates'
import { formatDuration } from '@/lib/duration'
import { formatMoney } from '@/lib/money'
import { cn, plural } from '@/lib/text'
import { updateSettings, type Settings } from '@/stores/settings'
import { openDialog, toast } from '@/stores/ui'

/* ------------------------------------------------------------------ */
/* Rating + selfie                                                     */
/* ------------------------------------------------------------------ */

export function RatingSection({ date, settings }: { date: ISODate; settings: Settings }) {
  const day = useLiveQuery(async () => (await db.days.get(date)) ?? null, [date])
  const selfieUrl = usePhotoUrl(day?.selfiePhotoId ?? null)
  const rating = day?.rating ?? null
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? rating ?? 0
  const reflected = hasReflection(day?.reflection)

  return (
    <Card className="flex items-center gap-4 p-4">
      <button
        type="button"
        onClick={() => openDialog({ kind: 'photo', date, selfie: true })}
        aria-label={selfieUrl ? 'Change daily selfie' : 'Add daily selfie'}
        className="relative h-16 w-16 shrink-0 rounded-full"
      >
        <span className="grid h-full w-full place-items-center overflow-hidden rounded-full border border-line bg-surface-2 text-muted">
          {selfieUrl ? <img src={selfieUrl} alt="Daily selfie" className="h-full w-full object-cover" /> : <UserRound size={26} strokeWidth={1.6} aria-hidden />}
        </span>
        <span className="absolute -right-0.5 -bottom-0.5 grid h-6 w-6 place-items-center rounded-full border-2 border-surface bg-accent text-on-accent">
          <Camera size={12} strokeWidth={2.2} aria-hidden />
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-medium">{date === today() ? 'Rate your day' : 'Rate this day'}</h2>
          <button type="button" onClick={() => openDialog({ kind: 'rating', date })} className="text-[13px] font-medium text-accent hover:underline">
            {reflected ? 'Edit reflection' : 'Reflect'}
          </button>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <div role="radiogroup" aria-label="Rate your day" className="-ml-1.5 flex" onMouseLeave={() => setHover(null)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} of 5, ${settings.ratingLabels[n - 1]}`}
                onMouseEnter={() => setHover(n)}
                onFocus={() => setHover(n)}
                onBlur={() => setHover(null)}
                onClick={() => setRating(date, rating === n ? null : (n as 1 | 2 | 3 | 4 | 5))}
                className="grid h-10 w-9 place-items-center rounded-lg"
              >
                <Star
                  size={22}
                  strokeWidth={1.7}
                  className={cn('transition-colors', n <= shown ? 'fill-warn text-warn' : 'text-faint')}
                  aria-hidden
                />
              </button>
            ))}
          </div>
          <span className="truncate text-[13px] text-muted" aria-live="polite">
            {shown ? settings.ratingLabels[shown - 1] : ''}
          </span>
        </div>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Highlight                                                           */
/* ------------------------------------------------------------------ */

export function HighlightSection({ date }: { date: ISODate }) {
  const h = useLiveQuery(async () => (await db.highlights.where('date').equals(date).first()) ?? null, [date])
  const thumb = usePhotoUrl(h?.photoId ?? null)
  if (h === undefined) return <Card className="h-[74px]" />
  const isToday = date === today()
  return (
    <button
      type="button"
      onClick={() => openDialog({ kind: 'highlight', date, highlight: h ?? undefined })}
      className="flex w-full items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 text-left transition-colors hover:bg-surface-2"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-muted">Highlight of the day</div>
        {h ? (
          <>
            <div className="mt-0.5 text-[15px] leading-snug font-semibold">{h.title}</div>
            {h.description && <div className="mt-0.5 line-clamp-2 text-[13px] text-muted">{h.description}</div>}
          </>
        ) : (
          <div className="mt-0.5 flex items-center gap-1.5 text-[15px] text-faint">
            <Sparkles size={15} aria-hidden />
            {isToday ? 'What was the best part of today?' : 'What was the best part of this day?'}
          </div>
        )}
      </div>
      {thumb && <img src={thumb} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* To-do                                                               */
/* ------------------------------------------------------------------ */

function QuickAddTask({ date }: { date: ISODate }) {
  const [title, setTitle] = useState('')
  const add = async () => {
    const t = title.trim()
    if (!t) return
    setTitle('')
    try {
      await createTask({ title: t, date })
    } catch {
      toast('Could not add the task.', { tone: 'error' })
      setTitle(t)
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        add()
      }}
      className="mt-1 flex items-center gap-3 border-t border-line pt-2"
    >
      <Plus size={18} className="shrink-0 text-faint" aria-hidden />
      <label htmlFor={`qa-${date}`} className="sr-only">
        Add a task
      </label>
      <input
        id={`qa-${date}`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a task"
        maxLength={200}
        enterKeyHint="done"
        className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
      />
      {title.trim() && (
        <button type="submit" className="h-8 rounded-lg bg-accent-soft px-3 text-[13px] font-medium text-accent">
          Add
        </button>
      )}
    </form>
  )
}

export function TasksSection({ date, settings }: { date: ISODate; settings: Settings }) {
  const tasks = useLiveQuery(() => db.tasks.where('date').equals(date).toArray(), [date])
  const isToday = date === today()
  const overdue = useLiveQuery(
    () => (isToday ? db.tasks.where('date').below(date).filter((t) => !t.completed).toArray() : Promise.resolve([] as Task[])),
    [date, isToday],
  )
  const list = sortTasks(tasks ?? [])
  const stats = taskStats(list)
  const hide = settings.hideCompletedTasks
  const visible = hide ? list.filter((t) => !t.completed) : list
  const hiddenCount = list.length - visible.length

  const moveAll = async () => {
    const items = overdue ?? []
    for (const t of items) await moveTask(t.id, date)
    toast(`${plural(items.length, 'task')} moved to today`)
  }

  return (
    <SectionCard
      title="To-do"
      icon={ListChecks}
      to="/tasks"
      linkLabel="Open all tasks"
      action={
        <div className="flex items-center gap-1">
          {stats.total > 0 && (
            <span className="text-xs text-faint tabular-nums">
              {stats.done}/{stats.total} done
            </span>
          )}
          {stats.done > 0 && (
            <button
              type="button"
              onClick={() => updateSettings({ hideCompletedTasks: !hide })}
              aria-label={hide ? 'Show completed tasks' : 'Hide completed tasks'}
              title={hide ? 'Show completed tasks' : 'Hide completed tasks'}
              className="grid h-8 w-8 place-items-center rounded-lg text-faint hover:bg-surface-2 hover:text-text"
            >
              {hide ? <Eye size={15} aria-hidden /> : <EyeOff size={15} aria-hidden />}
            </button>
          )}
        </div>
      }
    >
      {!!overdue?.length && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-warn-soft px-3 py-2 text-[13px]">
          <Link to="/tasks?filter=overdue" className="text-warn hover:underline">
            {plural(overdue.length, 'overdue task')}
          </Link>
          <button type="button" onClick={moveAll} className="font-medium text-warn hover:underline">
            Move to today
          </button>
        </div>
      )}
      {tasks === undefined ? (
        <div className="h-10" />
      ) : (
        <ul>
          {visible.map((t) => (
            <li key={t.id}>
              <TaskItem task={t} onOpen={() => openDialog({ kind: 'task', task: t, date })} />
            </li>
          ))}
        </ul>
      )}
      {tasks !== undefined && list.length === 0 && (
        <p className="pb-1 text-[13px] text-faint">{isToday ? 'Nothing planned yet.' : 'No tasks on this day.'}</p>
      )}
      {hiddenCount > 0 && <p className="py-1 text-xs text-faint">{plural(hiddenCount, 'completed task')} hidden</p>}
      <QuickAddTask date={date} />
    </SectionCard>
  )
}

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
/* Summary tiles                                                       */
/* ------------------------------------------------------------------ */

export function ExpensesTile({ date, settings }: { date: ISODate; settings: Settings }) {
  const expenses = useLiveQuery(() => db.expenses.where('date').equals(date).toArray(), [date])
  const own = (expenses ?? []).filter((e) => e.currency === settings.currency)
  const total = own.reduce((s, e) => s + e.amount, 0)
  const other = (expenses ?? []).length - own.length
  const label = date === today() ? 'Spent today' : `Spent · ${relativeDayLabel(date, 'd MMM')}`
  return (
    <StatTile
      label={label}
      to={`/expenses?d=${date}`}
      value={expenses === undefined ? '…' : formatMoney(total, settings.currency)}
      sub={
        expenses === undefined
          ? undefined
          : expenses.length === 0
            ? 'Nothing logged'
            : `${plural(expenses.length, 'expense')}${other ? ` · ${other} in other currencies` : ''}`
      }
    />
  )
}

export function StudyTile({ date, settings }: { date: ISODate; settings: Settings }) {
  const sessions = useLiveQuery(() => db.studySessions.where('date').equals(date).toArray(), [date])
  const { timer } = useTimer('study', 15000)
  const running = timer && timer.date === date ? elapsedMs(timer) / 1000 : 0
  const total = (sessions ?? []).reduce((s, x) => s + x.durationSec, 0) + running
  const goal = settings.studyGoalDailyMin * 60
  return (
    <StatTile
      label="Study time"
      to={`/study?d=${date}`}
      value={sessions === undefined ? '…' : formatDuration(total)}
      sub={
        timer && timer.date === date
          ? timer.runningSince
            ? 'Timer running'
            : 'Timer paused'
          : goal > 0
            ? `Goal ${formatDuration(goal)}`
            : sessions?.length
              ? plural(sessions.length, 'session')
              : 'Nothing logged'
      }
    >
      {goal > 0 && (
        <div className="mt-2.5">
          <ProgressBar value={total} max={goal} label="Progress toward daily study goal" tone={total >= goal ? 'success' : 'accent'} />
        </div>
      )}
    </StatTile>
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
