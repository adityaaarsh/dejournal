import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookHeart, CalendarCheck, ChevronLeft, ChevronRight, Pencil, Sparkles, Star, Trophy } from 'lucide-react'
import {
  EmptyState,
  IconTile,
  MetricTile,
  MonthGrid,
  MoodLegend,
  MOOD_FACES,
  NavSquare,
  Page,
  PageHeader,
  RECORD_TONE,
  SectionLabel,
  type DayCell,
} from '@/components/ui'
import { ChartCard, LineChart } from '@/components/charts/Charts'
import { db } from '@/db/db'
import { hasReflection } from '@/db/days'
import { REFLECTION_PROMPTS } from '@/features/journal/RatingDialog'
import { addMonthsKey, currentMonth, dateRange, formatDate, formatMonth, monthEnd, monthKey, monthStart, today } from '@/lib/dates'
import { plural } from '@/lib/text'
import { useSettings } from '@/stores/settings'
import { openDialog } from '@/stores/ui'

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** Ratings history and daily reflections, one month at a time. */
export default function JournalPage() {
  const settings = useSettings()
  const [params, setParams] = useSearchParams()
  const m = params.get('m')
  const month = m && MONTH_RE.test(m) ? m : currentMonth()
  const setMonth = (next: string) => {
    setParams(next === currentMonth() ? {} : { m: next }, { replace: true })
    setSelected(null)
  }
  const [selected, setSelected] = useState<string | null>(null)

  const start = monthStart(month)
  const end = monthEnd(month)
  const days = useLiveQuery(() => db.days.where('date').between(start, end, true, true).toArray(), [start, end])
  const t = today()

  const byDate = useMemo(() => Object.fromEntries((days ?? []).map((d) => [d.date, d])), [days])
  const rated = (days ?? []).filter((d) => d.rating)
  const avg = rated.length ? rated.reduce((s, d) => s + (d.rating ?? 0), 0) / rated.length : null
  const best = rated.length ? rated.reduce((b, d) => ((d.rating ?? 0) > (b.rating ?? 0) ? d : b)) : null
  const reflections = (days ?? []).filter((d) => hasReflection(d.reflection)).sort((a, b) => b.date.localeCompare(a.date))

  const chartData = dateRange(start, end).map((d) => ({
    label: String(Number(d.slice(8))),
    fullLabel: formatDate(d, 'EEE, d MMM'),
    value: byDate[d]?.rating ?? null,
  }))

  const cells: Record<string, DayCell> = {}
  for (const d of dateRange(start, end)) {
    const day = byDate[d]
    cells[d] = { rating: day?.rating ?? null, dots: !day?.rating && hasReflection(day?.reflection) ? ['bg-accent'] : undefined }
  }
  const isFuture = month >= currentMonth()
  // Selection follows the visible month; default to today when it's in view.
  const sel = selected && monthKey(selected) === month ? selected : monthKey(t) === month ? t : null
  const selDay = sel ? byDate[sel] : undefined

  return (
    <Page>
      <PageHeader title="Journal" back="/more" subtitle="Daily ratings and reflections" actions={<NavSquare icon={Sparkles} label="Highlights" to="/highlights" />} />

      <div className="mb-3 flex items-center gap-3">
        <NavSquare icon={ChevronLeft} label="Previous month" onClick={() => setMonth(addMonthsKey(month, -1))} />
        <div className="min-w-0 flex-1 text-center">
          <h2 className="truncate font-display text-[17px] font-semibold tracking-tight" aria-live="polite">
            {formatMonth(month)}
          </h2>
          <p className="text-xs text-muted">{days === undefined ? ' ' : avg != null ? `avg mood ${avg.toFixed(1)} · ${plural(rated.length, 'day')} rated` : 'no ratings yet'}</p>
        </div>
        <NavSquare icon={ChevronRight} label="Next month" onClick={() => setMonth(addMonthsKey(month, 1))} disabled={isFuture} />
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <MetricTile icon={CalendarCheck} label="Rated" value={days === undefined ? '…' : rated.length} sub="days" />
        <MetricTile icon={Star} label="Average" value={avg === null ? '—' : avg.toFixed(1)} sub="recorded only" />
        <MetricTile icon={Trophy} label="Best" value={best ? formatDate(best.date, 'd MMM') : '—'} sub={best ? `${best.rating}/5` : undefined} />
      </div>

      <MonthGrid
        month={month}
        weekStartsOn={settings.weekStartsOn}
        selected={sel}
        today={t}
        cells={cells}
        onSelect={(d) => {
          if (monthKey(d) !== month) setMonth(monthKey(d))
          setSelected(d)
        }}
        onOpen={(d) => d <= t && openDialog({ kind: 'rating', date: d })}
      />
      <MoodLegend className="mt-3" />

      {sel && (
        <div className="mt-3 rounded-[var(--radius-card)] border border-line bg-surface px-3 py-2.5">
          <div className="flex items-center gap-3">
            <IconTile icon={selDay?.rating ? MOOD_FACES[selDay.rating - 1] : Star} tone={selDay?.rating ? RECORD_TONE.reflection : 'muted'} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold">{formatDate(sel, 'EEEE d MMMM')}</p>
              <p className="truncate text-xs text-muted">
                {selDay?.rating ? `${settings.ratingLabels[selDay.rating - 1]} · ${selDay.rating}/5` : 'Not rated'}
                {hasReflection(selDay?.reflection) ? ' · has a reflection' : ''}
              </p>
            </div>
            {sel <= t ? (
              <button
                type="button"
                onClick={() => openDialog({ kind: 'rating', date: sel })}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-accent hover:bg-accent-soft"
              >
                <Pencil size={13} aria-hidden /> {selDay?.rating ? 'Edit' : 'Rate'}
              </button>
            ) : (
              <span className="text-xs text-faint">Upcoming</span>
            )}
          </div>
        </div>
      )}
      <p className="mt-2 mb-3 text-center text-[11px] text-faint">Tap a day, then rate it or edit its reflection. Unrated days stay blank, not counted as low.</p>

      <ChartCard title="Daily rating" valueHeader="Rating" formatValue={(v) => `${v}/5`} subtitle={rated.length ? `${plural(rated.length, 'rated day')} · gaps are days without a rating` : undefined} data={chartData}>
        <LineChart data={chartData} min={1} max={5} yTicks={[1, 3, 5]} formatValue={(v) => String(Math.round(v * 10) / 10)} />
      </ChartCard>

      <SectionLabel className="mt-4">Reflections</SectionLabel>
      {days !== undefined && reflections.length === 0 ? (
        <EmptyState icon={BookHeart} title="No reflections this month" description="Use “Reflect” on the Today screen to jot down how a day went. It's always optional." />
      ) : (
        <ul className="flex flex-col gap-2">
          {reflections.map((d) => (
            <li key={d.date} className="rounded-[var(--radius-card)] border border-line bg-surface px-3 py-2.5">
              <div className="mb-2 flex items-center gap-3">
                <IconTile icon={d.rating ? MOOD_FACES[d.rating - 1] : BookHeart} tone={RECORD_TONE.reflection} />
                <div className="min-w-0 flex-1">
                  <Link to={`/?d=${d.date}`} className="block truncate text-[14px] font-semibold hover:text-accent">
                    {formatDate(d.date, 'EEEE, d MMM')}
                  </Link>
                  <p className="text-xs text-muted">{d.rating ? `${settings.ratingLabels[d.rating - 1]} · ${d.rating}/5` : 'Not rated'}</p>
                </div>
                <NavSquare icon={Pencil} label="Edit reflection" onClick={() => openDialog({ kind: 'rating', date: d.date })} />
              </div>
              <dl className="flex flex-col gap-2 pl-[46px]">
                {REFLECTION_PROMPTS.filter((p) => d.reflection?.[p.key]?.trim()).map((p) => (
                  <div key={p.key}>
                    <dt className="text-xs text-faint">{p.label}</dt>
                    <dd className="mt-0.5 text-[14px] leading-relaxed whitespace-pre-wrap">{d.reflection?.[p.key]}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}
