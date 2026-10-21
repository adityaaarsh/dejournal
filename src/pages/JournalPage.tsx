import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookHeart, ChevronLeft, ChevronRight, Pencil, Sparkles, Star } from 'lucide-react'
import { Card, EmptyState, IconButton, Page, PageHeader } from '@/components/ui'
import { ChartCard, LineChart } from '@/components/charts/Charts'
import { db } from '@/db/db'
import { hasReflection } from '@/db/days'
import { REFLECTION_PROMPTS } from '@/features/journal/RatingDialog'
import {
  addMonthsKey,
  currentMonth,
  dateRange,
  formatDate,
  formatMonth,
  monthEnd,
  monthGrid,
  monthStart,
  today,
  weekdayLabels,
} from '@/lib/dates'
import { cn, plural } from '@/lib/text'
import { useSettings } from '@/stores/settings'
import { openDialog } from '@/stores/ui'

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** Ratings history and daily reflections, one month at a time. */
export default function JournalPage() {
  const settings = useSettings()
  const [params, setParams] = useSearchParams()
  const m = params.get('m')
  const month = m && MONTH_RE.test(m) ? m : currentMonth()
  const setMonth = (next: string) => setParams(next === currentMonth() ? {} : { m: next }, { replace: true })

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

  const grid = monthGrid(month, settings.weekStartsOn)
  const isFuture = month > currentMonth()

  return (
    <Page>
      <PageHeader
        title="Journal"
        back="/more"
        subtitle="Daily ratings and reflections"
        actions={
          <Link to="/highlights" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-accent hover:bg-accent-soft">
            <Sparkles size={15} aria-hidden /> Highlights
          </Link>
        }
      />

      <div className="mb-4 flex items-center justify-between">
        <IconButton icon={ChevronLeft} label="Previous month" onClick={() => setMonth(addMonthsKey(month, -1))} />
        <h2 className="text-[17px] font-semibold">{formatMonth(month)}</h2>
        <IconButton icon={ChevronRight} label="Next month" onClick={() => setMonth(addMonthsKey(month, 1))} disabled={isFuture} />
      </div>

      <div className="mb-3 grid grid-cols-3 gap-3">
        <Card className="p-3.5">
          <div className="text-xs text-muted">Days rated</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{days === undefined ? '…' : rated.length}</div>
        </Card>
        <Card className="p-3.5">
          <div className="text-xs text-muted">Average</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{avg === null ? '—' : avg.toFixed(1)}</div>
        </Card>
        <Card className="p-3.5">
          <div className="text-xs text-muted">Best day</div>
          <div className="mt-1 truncate text-[15px] font-semibold">{best ? formatDate(best.date, 'd MMM') : '—'}</div>
          {best && <div className="text-xs text-faint">{best.rating}/5</div>}
        </Card>
      </div>

      <Card className="mb-3 p-4">
        <h3 className="mb-3 text-[15px] font-medium">Ratings calendar</h3>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-faint">
          {weekdayLabels(settings.weekStartsOn, 'narrow').map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {grid.map((d) => {
            const inMonth = d.startsWith(month)
            const r = byDate[d]?.rating ?? null
            const future = d > t
            return (
              <button
                key={d}
                type="button"
                disabled={!inMonth || future}
                onClick={() => openDialog({ kind: 'rating', date: d })}
                aria-label={`${formatDate(d, 'EEEE d MMMM')}: ${r ? `rated ${r} of 5` : 'not rated'}`}
                className={cn(
                  'flex aspect-square flex-col items-center justify-center rounded-lg text-[11px] tabular-nums transition-colors',
                  !inMonth && 'invisible',
                  future && 'opacity-40',
                  r ? 'text-text' : 'bg-surface-2 text-faint hover:bg-surface-3',
                  d === t && 'ring-1 ring-accent',
                )}
                style={r ? { background: `color-mix(in srgb, var(--c-accent) ${12 + r * 15}%, var(--c-surface-2))` } : undefined}
              >
                <span className={r ? 'text-[10px] opacity-70' : ''}>{Number(d.slice(8))}</span>
                {r && <span className="text-[13px] leading-none font-semibold">{r}</span>}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-faint">Tap a day to rate it or edit its reflection. Unrated days are left blank, not counted as low.</p>
      </Card>

      <ChartCard title="Daily rating" valueHeader="Rating" formatValue={(v) => `${v}/5`} subtitle={rated.length ? `${plural(rated.length, 'rated day')} · gaps are days without a rating` : undefined} data={chartData}>
        <LineChart data={chartData} min={1} max={5} yTicks={[1, 3, 5]} formatValue={(v) => String(Math.round(v * 10) / 10)} />
      </ChartCard>

      <section aria-labelledby="refl" className="mt-6">
        <h2 id="refl" className="mb-2 px-1 text-[13px] font-semibold text-muted">
          Reflections
        </h2>
        {days !== undefined && reflections.length === 0 ? (
          <EmptyState
            icon={BookHeart}
            title="No reflections this month"
            description="Use “Reflect” on the Today screen to jot down how a day went. It's always optional."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {reflections.map((d) => (
              <li key={d.date}>
                <Card className="p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Link to={`/?d=${d.date}`} className="text-[15px] font-medium hover:text-accent">
                      {formatDate(d.date, 'EEEE, d MMM')}
                    </Link>
                    <div className="flex items-center gap-1">
                      {d.rating && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                          <Star size={11} className="fill-warn text-warn" aria-hidden /> {d.rating}/5
                        </span>
                      )}
                      <IconButton icon={Pencil} label="Edit reflection" size="sm" onClick={() => openDialog({ kind: 'rating', date: d.date })} />
                    </div>
                  </div>
                  <dl className="flex flex-col gap-2.5">
                    {REFLECTION_PROMPTS.filter((p) => d.reflection?.[p.key]?.trim()).map((p) => (
                      <div key={p.key}>
                        <dt className="text-xs text-faint">{p.label}</dt>
                        <dd className="mt-0.5 text-[14px] leading-relaxed whitespace-pre-wrap">{d.reflection?.[p.key]}</dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  )
}
