import { useEffect, useRef, type KeyboardEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bell, Check, ChevronLeft, ChevronRight, Plus, Sun } from 'lucide-react'
import { Button, Card, IconButton, LoadingState, Page, PageHeader, Segmented } from '@/components/ui'
import type { ISODate } from '@/db/types'
import {
  addDays,
  addMonthsKey,
  daysInMonth,
  formatDate,
  formatMonth,
  formatTime,
  isISODate,
  monthGrid,
  monthKey,
  today,
  weekRange,
  weekdayLabels,
  dateRange,
} from '@/lib/dates'
import { cn } from '@/lib/text'
import { formatDuration } from '@/lib/duration'
import { formatMoney } from '@/lib/money'
import { openDialog } from '@/stores/ui'
import { useSettings } from '@/stores/settings'
import { remindersOn, occurrenceState } from '@/db/reminders'
import { sortTasks } from '@/db/tasks'
import { DayAgenda, SourceBadge } from '@/features/calendar/DayAgenda'
import {
  DOT_GROUPS,
  buildIndicators,
  describeIndicators,
  dotGroups,
  useRangeRecords,
  type RangeRecords,
} from '@/features/calendar/useCalendarData'
import { eventCovers, sortEvents } from '@/features/calendar/events'

type View = 'month' | 'week' | 'day'

function shiftMonth(date: ISODate, n: number): ISODate {
  const m = addMonthsKey(monthKey(date), n)
  const day = Math.min(Number(date.slice(8, 10)), daysInMonth(m))
  return `${m}-${String(day).padStart(2, '0')}`
}

export default function CalendarPage() {
  const settings = useSettings()
  const [params, setParams] = useSearchParams()
  const rawView = params.get('view')
  const view: View = rawView === 'week' || rawView === 'day' ? rawView : 'month'
  const rawDate = params.get('d')
  const date = isISODate(rawDate) ? rawDate : today()

  const set = (next: { view?: View; d?: ISODate }) => {
    const p = new URLSearchParams(params)
    if (next.view) p.set('view', next.view)
    if (next.d) p.set('d', next.d)
    setParams(p, { replace: true })
  }

  const step = (dir: 1 | -1) => {
    if (view === 'month') set({ d: shiftMonth(date, dir) })
    else if (view === 'week') set({ d: addDays(date, 7 * dir) })
    else set({ d: addDays(date, dir) })
  }

  const isToday = date === today()
  const [wStart, wEnd] = weekRange(date, settings.weekStartsOn)
  const title =
    view === 'month'
      ? formatMonth(monthKey(date))
      : view === 'week'
        ? `${formatDate(wStart, 'd MMM')} – ${formatDate(wEnd, 'd MMM yyyy')}`
        : formatDate(date, 'EEEE, d MMMM')

  return (
    <Page width="wide">
      <PageHeader
        title="Calendar"
        actions={
          <>
            {!isToday && (
              <Button size="sm" variant="ghost" icon={Sun} onClick={() => set({ d: today() })}>
                Today
              </Button>
            )}
            <IconButton icon={Plus} label="Add to this date" variant="secondary" size="sm" onClick={() => openDialog({ kind: 'quick', date })} />
          </>
        }
      >
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <IconButton icon={ChevronLeft} label={`Previous ${view}`} size="sm" onClick={() => step(-1)} />
            <h2 className="min-w-0 truncate px-1 text-[15px] font-semibold" aria-live="polite">
              {title}
            </h2>
            <IconButton icon={ChevronRight} label={`Next ${view}`} size="sm" onClick={() => step(1)} />
          </div>
          <Segmented<View>
            label="Calendar view"
            size="sm"
            value={view}
            onChange={(v) => set({ view: v })}
            options={[
              { value: 'month', label: 'Month' },
              { value: 'week', label: 'Week' },
              { value: 'day', label: 'Day' },
            ]}
          />
        </div>
      </PageHeader>

      {view === 'month' && <MonthView date={date} onSelect={(d) => set({ d })} onOpen={(d) => set({ d, view: 'day' })} />}
      {view === 'week' && <WeekView start={wStart} end={wEnd} selected={date} onOpen={(d) => set({ d, view: 'day' })} />}
      {view === 'day' && (
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          <DayHeader date={date} showDate={false} />
          <DayAgenda date={date} />
        </div>
      )}
    </Page>
  )
}

function DayHeader({ date, showDate = true }: { date: ISODate; showDate?: boolean }) {
  const sameYear = date.slice(0, 4) === today().slice(0, 4)
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        {showDate && <p className="truncate text-[15px] font-semibold">{formatDate(date, sameYear ? 'EEEE, d MMMM' : 'EEE, d MMM yyyy')}</p>}
        {date === today() && <p className="text-xs text-accent">Today</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Link to={`/?d=${date}`} className="inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-medium text-accent hover:bg-accent-soft">
          Open in Today
        </Link>
        <IconButton icon={Plus} label="Add to this day" size="sm" variant="secondary" onClick={() => openDialog({ kind: 'quick', date })} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Month                                                               */
/* ------------------------------------------------------------------ */

function MonthView({ date, onSelect, onOpen }: { date: ISODate; onSelect: (d: ISODate) => void; onOpen: (d: ISODate) => void }) {
  const settings = useSettings()
  const month = monthKey(date)
  const grid = monthGrid(month, settings.weekStartsOn)
  const records = useRangeRecords(grid[0], grid[grid.length - 1])
  const indicators = records ? buildIndicators(records, grid) : undefined
  const gridRef = useRef<HTMLDivElement>(null)
  const focusPending = useRef(false)
  const t = today()

  // After keyboard navigation, move focus to the newly selected cell.
  useEffect(() => {
    if (!focusPending.current) return
    focusPending.current = false
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)?.focus()
  }, [date, grid.length])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, () => ISODate> = {
      ArrowLeft: () => addDays(date, -1),
      ArrowRight: () => addDays(date, 1),
      ArrowUp: () => addDays(date, -7),
      ArrowDown: () => addDays(date, 7),
      PageUp: () => shiftMonth(date, -1),
      PageDown: () => shiftMonth(date, 1),
      Home: () => weekRange(date, settings.weekStartsOn)[0],
      End: () => weekRange(date, settings.weekStartsOn)[1],
    }
    if (moves[e.key]) {
      e.preventDefault()
      focusPending.current = true
      onSelect(moves[e.key]())
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen(date)
    }
  }

  const labels = weekdayLabels(settings.weekStartsOn, 'short')

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <Card className="p-2 sm:p-3">
        <div className="grid grid-cols-7 pb-1 text-center text-[11px] font-medium text-faint" aria-hidden>
          {labels.map((l) => (
            <div key={l} className="py-1.5">
              <span className="sm:hidden">{l.slice(0, 1)}</span>
              <span className="hidden sm:inline">{l}</span>
            </div>
          ))}
        </div>
        <div
          ref={gridRef}
          role="grid"
          aria-label={`${formatMonth(month)}. Use arrow keys to move between days, Page Up and Page Down to change month, Enter to open a day.`}
          onKeyDown={onKeyDown}
          className="grid grid-cols-7 gap-0.5 sm:gap-1"
        >
          {grid.map((d) => {
            const inMonth = d.startsWith(month)
            const selected = d === date
            const isT = d === t
            const ind = indicators?.[d]
            const groups = dotGroups(ind)
            return (
              <button
                key={d}
                type="button"
                role="gridcell"
                data-date={d}
                tabIndex={selected ? 0 : -1}
                aria-selected={selected}
                aria-current={isT ? 'date' : undefined}
                aria-label={`${formatDate(d, 'EEEE, d MMMM')}${isT ? ', today' : ''}. ${describeIndicators(ind)}`}
                onClick={() => onSelect(d)}
                onDoubleClick={() => onOpen(d)}
                className={cn(
                  'flex aspect-square min-h-11 flex-col items-center justify-start gap-1 rounded-xl pt-1.5 transition-colors sm:aspect-[1.15] sm:pt-2',
                  selected ? 'bg-accent-soft' : 'hover:bg-surface-2',
                  !inMonth && 'opacity-40',
                )}
              >
                <span
                  className={cn(
                    'grid h-7 w-7 place-items-center rounded-full text-[13px] tabular-nums sm:text-sm',
                    isT && 'ring-1 ring-accent',
                    selected && 'bg-accent font-semibold text-on-accent',
                    !selected && isT && 'font-semibold text-accent',
                  )}
                >
                  {Number(d.slice(8))}
                </span>
                <span className="flex h-1.5 items-center gap-[3px]" aria-hidden>
                  {groups.map((g) => (
                    <span key={g} className={cn('h-1.5 w-1.5 rounded-full', DOT_GROUPS.find((x) => x.id === g)!.className)} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
        <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-line px-2 pt-2.5 pb-1 text-[11px] text-muted" aria-label="Legend">
          {DOT_GROUPS.map((g) => (
            <li key={g.id} className="flex items-center gap-1.5" title={g.description}>
              <span className={cn('h-1.5 w-1.5 rounded-full', g.className)} aria-hidden />
              {g.label}
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex flex-col gap-3 lg:sticky lg:top-28">
        <DayHeader date={date} />
        <DayAgenda date={date} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Week                                                                */
/* ------------------------------------------------------------------ */

function WeekView({ start, end, selected, onOpen }: { start: ISODate; end: ISODate; selected: ISODate; onOpen: (d: ISODate) => void }) {
  const records = useRangeRecords(start, end)
  const dates = dateRange(start, end)
  if (!records) return <LoadingState />
  return (
    <div className="grid gap-2 lg:grid-cols-7">
      {dates.map((d) => (
        <WeekDay key={d} date={d} records={records} selected={d === selected} onOpen={() => onOpen(d)} />
      ))}
    </div>
  )
}

function WeekDay({ date, records, selected, onOpen }: { date: ISODate; records: RangeRecords; selected: boolean; onOpen: () => void }) {
  const isT = date === today()
  const events = sortEvents(records.events.filter((e) => eventCovers(e, date)))
  const reminders = remindersOn(records.reminders, date)
  const tasks = sortTasks(records.tasks.filter((t) => t.date === date))
  const study = records.study.filter((s) => s.date === date).reduce((s, x) => s + x.durationSec, 0)
  const spent = new Map<string, number>()
  for (const e of records.expenses.filter((x) => x.date === date)) spent.set(e.currency, (spent.get(e.currency) ?? 0) + e.amount)
  const photos = records.photos.filter((p) => p.date === date).length
  const rating = records.days.find((x) => x.date === date)?.rating
  const highlight = records.highlights.find((h) => h.date === date)
  const empty = !events.length && !reminders.length && !tasks.length && !study && !spent.size && !photos && !rating && !highlight

  return (
    <Card className={cn('flex min-w-0 flex-col p-3 lg:min-h-64', selected && 'border-accent/50')}>
      <button type="button" onClick={onOpen} className="-m-1 mb-1 flex items-baseline gap-2 rounded-lg p-1 text-left hover:bg-surface-2" aria-label={`Open ${formatDate(date, 'EEEE, d MMMM')}`}>
        <span className={cn('text-[13px] font-medium', isT ? 'text-accent' : 'text-muted')}>{formatDate(date, 'EEE')}</span>
        <span className={cn('text-lg font-semibold tabular-nums', isT && 'text-accent')}>{Number(date.slice(8))}</span>
        {rating ? <span className="ml-auto text-xs text-warn">★ {rating}</span> : null}
      </button>
      {empty ? (
        <p className="text-xs text-faint">Nothing planned</p>
      ) : (
        <ul className="flex flex-col gap-1 text-[13px]">
          {events.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => openDialog({ kind: 'event', date, event: e })} className="block w-full min-w-0 rounded-md border-l-2 border-accent bg-accent-soft/60 px-2 py-1 text-left hover:bg-accent-soft">
                <span className="block truncate">{e.title}</span>
                {(!e.allDay || e.source !== 'local') && (
                  <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
                    {!e.allDay && e.startTime && <span className="shrink-0 tabular-nums">{formatTime(e.startTime)}</span>}
                    <SourceBadge event={e} />
                  </span>
                )}
              </button>
            </li>
          ))}
          {reminders.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => openDialog({ kind: 'reminder', date, reminder: r })} className="flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-surface-2">
                <Bell size={12} className="shrink-0 self-start mt-1 text-accent" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate', occurrenceState(r, date) !== 'pending' && 'text-muted line-through')}>{r.title}</span>
                  <span className="block text-[11px] text-muted tabular-nums">{formatTime(r.time)}</span>
                </span>
              </button>
            </li>
          ))}
          {tasks.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => openDialog({ kind: 'task', task: t, date })} className="flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-surface-2">
                <span className={cn('grid h-3.5 w-3.5 shrink-0 place-items-center rounded border', t.completed ? 'border-accent bg-accent text-on-accent' : 'border-line-strong')} aria-hidden>
                  {t.completed && <Check size={10} strokeWidth={3} />}
                </span>
                <span className={cn('min-w-0 flex-1 truncate', t.completed && 'text-muted line-through')}>{t.title}</span>
              </button>
            </li>
          ))}
          {highlight && <li className="truncate px-2 pt-1 text-xs text-warn">✦ {highlight.title}</li>}
          {(study > 0 || spent.size > 0 || photos > 0) && (
            <li className="flex flex-wrap gap-x-2.5 gap-y-0.5 px-2 pt-1 text-xs text-muted">
              {study > 0 && <span>Study {formatDuration(study)}</span>}
              {[...spent.entries()].map(([c, v]) => (
                <span key={c}>{formatMoney(v, c)}</span>
              ))}
              {photos > 0 && <span>{photos} photo{photos > 1 ? 's' : ''}</span>}
            </li>
          )}
        </ul>
      )}
    </Card>
  )
}
