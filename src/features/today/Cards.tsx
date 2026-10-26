import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Angry,
  BookOpen,
  Check,
  ChevronRight,
  Flag,
  Frown,
  Laugh,
  Meh,
  Plus,
  Repeat,
  Smile,
  Sparkles,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { db } from '@/db/db'
import type { ISODate, Task } from '@/db/types'
import { moveTask, setTaskCompleted, sortTasks } from '@/db/tasks'
import { hasReflection, setRating } from '@/db/days'
import { usePhotoUrl } from '@/db/photos'
import { elapsedMs, useTimer } from '@/db/timers'
import { spendLevel, type SpendLevel } from '@/domain/expenses'
import { relativeDayLabel, today } from '@/lib/dates'
import { formatDuration } from '@/lib/duration'
import { formatMoney } from '@/lib/money'
import { cn, plural } from '@/lib/text'
import type { Settings } from '@/stores/settings'
import { openDialog, toast } from '@/stores/ui'

const card = 'rounded-[var(--radius-card)] border border-line bg-surface'

/* ------------------------------------------------------------------ */
/* Mood (1–5 as faces)                                                 */
/* ------------------------------------------------------------------ */

const FACES: LucideIcon[] = [Angry, Frown, Meh, Smile, Laugh]

export function MoodCard({ date, settings }: { date: ISODate; settings: Settings }) {
  const day = useLiveQuery(async () => (await db.days.get(date)) ?? null, [date])
  const rating = day?.rating ?? null
  const reflected = hasReflection(day?.reflection)
  return (
    <section aria-label="Rate your day" className={cn(card, 'flex items-center justify-between gap-2 py-2 pr-2 pl-3')}>
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold">{date === today() ? "How's today?" : 'How was this day?'}</h2>
        <button
          type="button"
          onClick={() => openDialog({ kind: 'rating', date })}
          className="truncate text-xs text-muted hover:text-accent"
        >
          {rating ? settings.ratingLabels[rating - 1] : 'Tap a face'}
          {rating ? <span className="text-faint"> · {reflected ? 'Reflection' : 'Reflect'}</span> : null}
        </button>
      </div>
      <div role="radiogroup" aria-label="Rating" className="flex gap-1">
        {FACES.map((Face, i) => {
          const n = (i + 1) as 1 | 2 | 3 | 4 | 5
          const on = rating === n
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${n} of 5, ${settings.ratingLabels[i]}`}
              onClick={() => setRating(date, on ? null : n)}
              className={cn(
                'grid h-10 w-10 place-items-center rounded-xl transition-colors',
                on ? 'bg-accent text-on-accent' : 'text-faint hover:bg-surface-2 hover:text-text',
              )}
            >
              <Face size={21} strokeWidth={1.9} aria-hidden />
            </button>
          )
        })}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Study tile with a progress ring                                     */
/* ------------------------------------------------------------------ */

export function Ring({ value, max, size = 34, className }: { value: number; max: number; size?: number; className?: string }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0
  const circ = 2 * Math.PI * 17
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" className={className} aria-hidden>
      <circle cx="22" cy="22" r="17" fill="none" stroke="var(--c-surface-3)" strokeWidth="6" />
      {pct > 0 && (
        <circle
          cx="22"
          cy="22"
          r="17"
          fill="none"
          stroke="var(--c-accent)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${pct * circ} ${circ}`}
          transform="rotate(-90 22 22)"
        />
      )}
    </svg>
  )
}

export function StudyCard({ date, settings }: { date: ISODate; settings: Settings }) {
  const sessions = useLiveQuery(() => db.studySessions.where('date').equals(date).toArray(), [date])
  const { timer } = useTimer('study', 15000)
  const timerToday = timer && timer.date === date
  const running = timerToday ? elapsedMs(timer) / 1000 : 0
  const saved = (sessions ?? []).reduce((s, x) => s + x.durationSec, 0)
  const total = saved + running
  const goal = settings.studyGoalDailyMin * 60
  const sub = timerToday
    ? timer.runningSince
      ? 'Timer running'
      : 'Timer paused'
    : goal > 0
      ? saved >= goal
        ? `goal ${formatDuration(goal)} · done`
        : `of ${formatDuration(goal)} goal`
      : sessions?.length
        ? plural(sessions.length, 'session')
        : 'Nothing logged'
  return (
    <Link to={`/study?d=${date}`} className={cn(card, 'relative block min-h-[92px] p-3 transition-colors hover:bg-surface-2')}>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
        <BookOpen size={13} strokeWidth={2.1} aria-hidden /> Study
      </div>
      <div className="mt-2 font-display text-[20px] font-semibold tracking-tight tabular-nums">{sessions === undefined ? '…' : formatDuration(total)}</div>
      <div className="mt-0.5 text-[11px] text-muted">{sub}</div>
      {goal > 0 && <Ring value={saved} max={goal} className="absolute top-3 right-3" />}
    </Link>
  )
}

/* ------------------------------------------------------------------ */
/* Spending tile: colour changes with the day's total                  */
/* ------------------------------------------------------------------ */

const LEVEL_STYLE: Record<SpendLevel, { tile: string; text: string; add: string }> = {
  low: { tile: 'border-success/35 bg-success-soft', text: 'text-success', add: 'bg-success' },
  mid: { tile: 'border-warn/40 bg-warn-soft', text: 'text-warn', add: 'bg-warn' },
  high: { tile: 'border-danger/40 bg-danger-soft', text: 'text-danger', add: 'bg-danger' },
}

export function SpendingCard({ date, settings }: { date: ISODate; settings: Settings }) {
  const navigate = useNavigate()
  const expenses = useLiveQuery(() => db.expenses.where('date').equals(date).toArray(), [date])
  const own = (expenses ?? []).filter((e) => e.currency === settings.currency)
  const total = own.reduce((s, e) => s + e.amount, 0)
  const level = spendLevel(total, settings.currency)
  const style = LEVEL_STYLE[level]
  const label = date === today() ? 'Spent today' : `Spent · ${relativeDayLabel(date, 'd MMM')}`
  return (
    <div className={cn('relative min-h-[92px] rounded-[var(--radius-card)] border transition-colors', style.tile)}>
      <button
        type="button"
        onClick={() => navigate(`/expenses?d=${date}`)}
        className="block h-full w-full p-3 text-left"
        aria-label={`${label}: ${formatMoney(total, settings.currency)}. Open expenses`}
      >
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          <Wallet size={13} strokeWidth={2.1} aria-hidden /> {label}
        </div>
        <div className={cn('mt-2 font-display text-[20px] font-semibold tracking-tight tabular-nums', style.text)}>
          {expenses === undefined ? '…' : formatMoney(total, settings.currency)}
        </div>
        <div className="mt-0.5 text-[11px] text-muted">
          {expenses === undefined ? '' : expenses.length ? plural(expenses.length, 'expense') : 'Nothing logged'}
        </div>
      </button>
      <button
        type="button"
        onClick={() => openDialog({ kind: 'expense', date })}
        aria-label="Add expense"
        title="Add expense"
        className={cn('absolute top-2.5 right-2.5 grid h-8 w-8 place-items-center rounded-[10px] text-surface transition-transform active:scale-95', style.add)}
      >
        <Plus size={17} strokeWidth={2.6} aria-hidden />
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Highlight (one line)                                                */
/* ------------------------------------------------------------------ */

export function HighlightRow({ date }: { date: ISODate }) {
  const h = useLiveQuery(async () => (await db.highlights.where('date').equals(date).first()) ?? null, [date])
  const thumb = usePhotoUrl(h?.photoId ?? null)
  if (h === undefined) return <div className={cn(card, 'h-[50px]')} />
  return (
    <button
      type="button"
      onClick={() => openDialog({ kind: 'highlight', date, highlight: h ?? undefined })}
      className={cn(card, 'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-2')}
    >
      {thumb ? (
        <img src={thumb} alt="" className="h-7 w-7 shrink-0 rounded-[9px] object-cover" />
      ) : (
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-surface-2 text-accent">
          <Sparkles size={15} strokeWidth={2} aria-hidden />
        </span>
      )}
      <span className={cn('min-w-0 flex-1 truncate text-[13px]', !h && 'text-faint')}>
        {h ? h.title : date === today() ? 'What was the best part of today?' : 'What was the best part of this day?'}
      </span>
      <ChevronRight size={16} className="shrink-0 text-faint" aria-hidden />
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* To-do (compact: up to 3 rows)                                       */
/* ------------------------------------------------------------------ */

const MAX_ROWS = 3

function TaskRow({ task, date }: { task: Task; date: ISODate }) {
  return (
    <li className="flex h-[34px] items-center gap-2.5 border-t border-line first:border-t-0">
      <button
        type="button"
        role="checkbox"
        aria-checked={task.completed}
        aria-label={task.completed ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
        onClick={() => setTaskCompleted(task.id, !task.completed)}
        className={cn(
          'grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors',
          task.completed ? 'border-accent bg-accent text-on-accent' : 'border-faint hover:border-accent',
        )}
      >
        {task.completed && <Check size={12} strokeWidth={3.4} aria-hidden />}
      </button>
      <button
        type="button"
        onClick={() => openDialog({ kind: 'task', task, date })}
        className={cn('min-w-0 flex-1 truncate text-left text-[13px]', task.completed && 'text-faint line-through')}
      >
        {task.title}
      </button>
      {task.seriesId && <Repeat size={12} className="shrink-0 text-faint" aria-label="Repeats" />}
      {task.priority === 'high' && !task.completed && (
        <span className="inline-flex shrink-0 items-center gap-1 text-[10.5px] font-bold text-danger">
          <Flag size={11} strokeWidth={2.6} aria-hidden /> High
        </span>
      )}
    </li>
  )
}

export function TodoCard({ date }: { date: ISODate }) {
  const tasks = useLiveQuery(() => db.tasks.where('date').equals(date).toArray(), [date])
  const isToday = date === today()
  const overdue = useLiveQuery(
    () => (isToday ? db.tasks.where('date').below(date).filter((t) => !t.completed).toArray() : Promise.resolve([] as Task[])),
    [date, isToday],
  )
  const list = sortTasks(tasks ?? [])
  const done = list.filter((t) => t.completed).length
  const shown = list.slice(0, MAX_ROWS)
  const more = list.length - shown.length

  const moveAll = async () => {
    const items = overdue ?? []
    for (const t of items) await moveTask(t.id, date)
    toast(`${plural(items.length, 'task')} moved to today`)
  }

  return (
    <section aria-label="To-do" className={cn(card, 'px-3 pt-1.5 pb-1')}>
      <div className="flex h-8 items-center gap-2 text-xs font-semibold text-muted">
        <Link to="/tasks" className="hover:text-text">
          To-do
        </Link>
        {!!overdue?.length && (
          <button type="button" onClick={moveAll} className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] text-warn hover:brightness-110">
            {overdue.length} overdue · move here
          </button>
        )}
        <span className="ml-auto tabular-nums">{list.length ? `${done} of ${list.length}` : ''}</span>
        <button
          type="button"
          onClick={() => openDialog({ kind: 'task', date })}
          aria-label="Add a task"
          className="-mr-1 grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
        >
          <Plus size={16} strokeWidth={2.2} aria-hidden />
        </button>
      </div>
      {tasks === undefined ? (
        <div className="h-[34px]" />
      ) : list.length === 0 ? (
        <button type="button" onClick={() => openDialog({ kind: 'task', date })} className="flex h-[34px] w-full items-center text-[13px] text-faint">
          {isToday ? 'Nothing planned yet. Tap to add a task' : 'No tasks on this day'}
        </button>
      ) : (
        <ul>
          {shown.map((t) => (
            <TaskRow key={t.id} task={t} date={date} />
          ))}
        </ul>
      )}
      {more > 0 && (
        <Link to="/tasks" className="flex h-8 items-center border-t border-line text-xs font-medium text-accent">
          +{more} more
        </Link>
      )}
    </section>
  )
}
