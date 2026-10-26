import { useSearchParams } from 'react-router-dom'
import { Undo2 } from 'lucide-react'
import { CenteredHeader, LoadingState, MonthGrid, MoodLegend, Page, Segmented, type DayCell } from '@/components/ui'
import type { ISODate } from '@/db/types'
import { addDays, addMonthsKey, dateRange, daysInMonth, formatDate, formatMonth, isISODate, monthEnd, monthGrid, monthKey, monthStart, today, weekRange } from '@/lib/dates'
import { useSettings } from '@/stores/settings'
import { DayAgenda } from '@/features/calendar/DayAgenda'
import { buildIndicators, describeIndicators, dotGroups, useRangeRecords } from '@/features/calendar/useCalendarData'

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

  const month = monthKey(date)
  const [wStart, wEnd] = weekRange(date, settings.weekStartsOn)

  // Header subtitle: mood average and logged days for the visible month.
  const monthRecords = useRangeRecords(monthStart(month), monthEnd(month))
  const monthDates = dateRange(monthStart(month), monthEnd(month))
  const monthInd = monthRecords ? buildIndicators(monthRecords, monthDates) : undefined
  const rated = monthRecords?.days.filter((d) => d.rating) ?? []
  const avg = rated.length ? rated.reduce((s, d) => s + (d.rating ?? 0), 0) / rated.length : null
  const logged = monthInd ? monthDates.filter((d) => dotGroups(monthInd[d]).length > 0).length : 0
  const monthSubtitle = monthRecords
    ? [avg != null ? `avg mood ${avg.toFixed(1)}` : 'no ratings yet', `${logged} day${logged === 1 ? '' : 's'} logged`].join(' · ')
    : ' '

  const title =
    view === 'month'
      ? formatMonth(month)
      : view === 'week'
        ? `${formatDate(wStart, 'd MMM')} – ${formatDate(wEnd, 'd MMM')}`
        : formatDate(date, 'EEEE, d MMM')
  const subtitle = view === 'day' ? formatMonth(month) : view === 'week' ? formatDate(wEnd, 'yyyy') : monthSubtitle

  return (
    <Page width="wide">
      <CenteredHeader
        title={<span aria-live="polite">{title}</span>}
        subtitle={subtitle}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        prevLabel={`Previous ${view}`}
        nextLabel={`Next ${view}`}
      />
      <div className="mb-3 flex items-center gap-2">
        <Segmented<View>
          label="Calendar view"
          className="flex-1"
          value={view}
          onChange={(v) => set({ view: v })}
          options={[
            { value: 'month', label: 'Month' },
            { value: 'week', label: 'Week' },
            { value: 'day', label: 'Day' },
          ]}
        />
        {date !== today() && (
          <button
            type="button"
            onClick={() => set({ d: today() })}
            className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-3.5 text-[13px] font-semibold text-accent hover:bg-surface-2"
          >
            <Undo2 size={14} aria-hidden /> Today
          </button>
        )}
      </div>

      {view === 'month' && <MonthView date={date} onSelect={(d) => set({ d })} onOpen={(d) => set({ d, view: 'day' })} />}
      {view === 'week' && <WeekView start={wStart} end={wEnd} />}
      {view === 'day' && (
        <div className="mx-auto max-w-2xl">
          <DayAgenda date={date} />
        </div>
      )}
    </Page>
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

  const cells: Record<string, DayCell> = {}
  for (const d of grid) {
    const ind = indicators?.[d]
    cells[d] = {
      rating: ind?.rating ?? null,
      // Unrated days with entries get one quiet dot.
      dots: ind && !ind.rating && dotGroups(ind).length ? ['bg-accent'] : undefined,
      label: describeIndicators(ind),
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:items-start">
      <div>
        <MonthGrid month={month} weekStartsOn={settings.weekStartsOn} selected={date} today={today()} cells={cells} onSelect={onSelect} onOpen={onOpen} />
        <MoodLegend className="mt-3" />
        <p className="mt-2 text-center text-[11px] text-faint">Colour shows the day’s mood · a dot marks unrated days with entries</p>
      </div>
      <div className="lg:sticky lg:top-6">
        <DayAgenda date={date} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Week                                                                */
/* ------------------------------------------------------------------ */

function WeekView({ start, end }: { start: ISODate; end: ISODate }) {
  const records = useRangeRecords(start, end)
  if (!records) return <LoadingState />
  return (
    <div className="grid gap-2 lg:grid-cols-2">
      {dateRange(start, end).map((d) => (
        <DayAgenda key={d} date={d} compact />
      ))}
    </div>
  )
}
