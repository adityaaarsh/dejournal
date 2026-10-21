import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { BarChart3, Table2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/text'

/**
 * Small, dependency-free SVG charts. Design rules: one series per chart
 * (accent colour, so no legend needed), thin marks, 4px rounded data ends,
 * hairline recessive grid, hover tooltips, and a table view for every chart.
 * Missing values are `null` and drawn as gaps, never as zero.
 */

export interface Datum {
  /** Category / x label (short). */
  label: string
  /** Full label used in tooltips and the table. */
  fullLabel?: string
  value: number | null
}

/** Card wrapper with a title and a Chart / Table toggle. */
export function ChartCard({
  title,
  subtitle,
  data,
  formatValue = String,
  valueHeader = 'Value',
  children,
  empty,
  className,
}: {
  title: string
  subtitle?: ReactNode
  data: Datum[]
  formatValue?: (v: number) => string
  valueHeader?: string
  children: ReactNode
  /** Shown instead of the chart when there's nothing to plot. */
  empty?: ReactNode
  className?: string
}) {
  const [table, setTable] = useState(false)
  const hasData = data.some((d) => d.value !== null && d.value !== 0)
  return (
    <Card className={cn('p-4', className)}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[15px] font-medium">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {hasData && (
          <button
            type="button"
            onClick={() => setTable((t) => !t)}
            aria-label={table ? 'Show chart' : 'Show as table'}
            title={table ? 'Show chart' : 'Show as table'}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
          >
            {table ? <BarChart3 size={17} /> : <Table2 size={17} />}
          </button>
        )}
      </div>
      {!hasData ? (
        empty ?? <p className="py-6 text-center text-[13px] text-muted">No data recorded for this period.</p>
      ) : table ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1.5 font-medium">Date</th>
                <th className="py-1.5 text-right font-medium">{valueHeader}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {data.map((d, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-1.5">{d.fullLabel ?? d.label}</td>
                  <td className="py-1.5 text-right">{d.value === null ? <span className="text-faint">—</span> : formatValue(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </Card>
  )
}

function niceMax(v: number): number {
  if (v <= 0) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / exp
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return nice * exp
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  // Keep inside the chart horizontally.
  const left = Math.min(Math.max(x, 60), width - 60)
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line-strong bg-surface-3 px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
      style={{ left, top: y - 8 }}
    >
      {children}
    </div>
  )
}

/** Measure container width (simple; charts re-render on resize). */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(320)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setW(Math.round(el.getBoundingClientRect().width) || 320)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width
      if (cw) setW(Math.round(cw))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

/** Vertical columns (e.g. study minutes per day). */
export function ColumnChart({
  data,
  height = 160,
  formatValue = String,
  formatTick,
  goal,
  goalLabel,
}: {
  data: Datum[]
  height?: number
  formatValue?: (v: number) => string
  formatTick?: (v: number) => string
  /** Optional reference line (e.g. daily goal). */
  goal?: number
  goalLabel?: string
}) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const padL = 34
  const padB = 20
  const padT = 8
  const plotW = Math.max(10, width - padL)
  const plotH = height - padB - padT
  const max = niceMax(Math.max(goal ?? 0, ...data.map((d) => d.value ?? 0)))
  const band = plotW / Math.max(1, data.length)
  const barW = Math.max(2, Math.min(24, band - 2))
  const ticks = [0, max / 2, max]
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(plotW / 28)))
  const y = (v: number) => padT + plotH - (v / max) * plotH

  return (
    <div ref={ref} className="relative w-full select-none" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label="Column chart" className="block overflow-visible">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width} y1={y(t)} y2={y(t)} stroke="var(--c-line)" strokeWidth={1} />
            <text x={padL - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--c-faint)" className="tabular-nums">
              {(formatTick ?? formatValue)(t)}
            </text>
          </g>
        ))}
        {goal !== undefined && goal > 0 && (
          <g>
            <line x1={padL} x2={width} y1={y(goal)} y2={y(goal)} stroke="var(--c-muted)" strokeWidth={1} strokeOpacity={0.6} />
            {goalLabel && (
              <text x={width} y={y(goal) - 4} textAnchor="end" fontSize={10} fill="var(--c-muted)">
                {goalLabel}
              </text>
            )}
          </g>
        )}
        {data.map((d, i) => {
          const cx = padL + band * i + band / 2
          const v = d.value ?? 0
          const h = Math.max(0, (v / max) * plotH)
          const r = Math.min(4, barW / 2, h)
          const x0 = cx - barW / 2
          const yTop = padT + plotH - h
          return (
            <g key={i}>
              {h > 0 && (
                <path
                  d={`M${x0},${padT + plotH} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x0 + barW - r} Q${x0 + barW},${yTop} ${x0 + barW},${yTop + r} V${padT + plotH} Z`}
                  fill="var(--c-accent)"
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              {i % labelEvery === 0 && (
                <text x={cx} y={height - 4} textAnchor="middle" fontSize={10} fill="var(--c-faint)">
                  {d.label}
                </text>
              )}
              {/* Hit target: whole band, taller than the mark */}
              <rect
                x={padL + band * i}
                y={padT}
                width={band}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onTouchStart={() => setHover(i)}
              />
            </g>
          )
        })}
        <line x1={padL} x2={width} y1={padT + plotH} y2={padT + plotH} stroke="var(--c-line-strong)" strokeWidth={1} />
      </svg>
      {hover !== null && data[hover] && (
        <Tooltip x={padL + band * hover + band / 2} y={y(data[hover].value ?? 0)} width={width}>
          <span className="text-muted">{data[hover].fullLabel ?? data[hover].label}</span>
          <span className="ml-2 font-medium tabular-nums">{data[hover].value === null ? 'No data' : formatValue(data[hover].value!)}</span>
        </Tooltip>
      )}
    </div>
  )
}

/** Line with dots (e.g. daily rating 1–5). Nulls break the line. */
export function LineChart({
  data,
  height = 150,
  min = 0,
  max: maxIn,
  formatValue = String,
  yTicks,
}: {
  data: Datum[]
  height?: number
  min?: number
  max?: number
  formatValue?: (v: number) => string
  yTicks?: number[]
}) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const gradId = useId()
  const padL = 26
  const padB = 20
  const padT = 10
  const plotW = Math.max(10, width - padL - 8)
  const plotH = height - padB - padT
  const max = maxIn ?? niceMax(Math.max(...data.map((d) => d.value ?? 0)))
  const step = data.length > 1 ? plotW / (data.length - 1) : 0
  const x = (i: number) => padL + (data.length > 1 ? step * i : plotW / 2)
  const y = (v: number) => padT + plotH - ((v - min) / (max - min || 1)) * plotH
  const ticks = yTicks ?? [min, (min + max) / 2, max]
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(plotW / 28)))

  // Split into contiguous segments so missing days are gaps.
  const segments: Array<Array<[number, number]>> = []
  let cur: Array<[number, number]> = []
  data.forEach((d, i) => {
    if (d.value === null) {
      if (cur.length) segments.push(cur)
      cur = []
    } else cur.push([x(i), y(d.value)])
  })
  if (cur.length) segments.push(cur)

  const onMove = (clientX: number, rect: DOMRect) => {
    const rel = clientX - rect.left - padL
    const i = Math.round(rel / (step || 1))
    setHover(Math.max(0, Math.min(data.length - 1, i)))
  }

  return (
    <div
      ref={ref}
      className="relative w-full select-none"
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
      onTouchMove={(e) => onMove(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
    >
      <svg width={width} height={height} role="img" aria-label="Line chart" className="block overflow-visible">
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--c-accent)" stopOpacity={0.12} />
            <stop offset="100%" stopColor="var(--c-accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width} y1={y(t)} y2={y(t)} stroke="var(--c-line)" strokeWidth={1} />
            <text x={padL - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--c-faint)">
              {formatValue(t)}
            </text>
          </g>
        ))}
        {segments.map((seg, i) =>
          seg.length > 1 ? (
            <g key={i}>
              <path
                d={`M${seg[0][0]},${padT + plotH} ${seg.map(([a, b]) => `L${a},${b}`).join(' ')} L${seg[seg.length - 1][0]},${padT + plotH} Z`}
                fill={`url(#${gradId})`}
              />
              <path
                d={seg.map(([a, b], j) => `${j ? 'L' : 'M'}${a},${b}`).join(' ')}
                fill="none"
                stroke="var(--c-accent)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          ) : null,
        )}
        {data.map((d, i) =>
          d.value === null ? null : (
            <circle key={i} cx={x(i)} cy={y(d.value)} r={hover === i ? 5 : 3.5} fill="var(--c-accent)" stroke="var(--c-surface)" strokeWidth={2} />
          ),
        )}
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={`l${i}`} x={x(i)} y={height - 4} textAnchor="middle" fontSize={10} fill="var(--c-faint)">
              {d.label}
            </text>
          ) : null,
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} stroke="var(--c-line-strong)" strokeWidth={1} />}
      </svg>
      {hover !== null && data[hover] && (
        <Tooltip x={x(hover)} y={data[hover].value === null ? padT + plotH / 2 : y(data[hover].value!)} width={width}>
          <span className="text-muted">{data[hover].fullLabel ?? data[hover].label}</span>
          <span className="ml-2 font-medium tabular-nums">{data[hover].value === null ? 'Not recorded' : formatValue(data[hover].value!)}</span>
        </Tooltip>
      )}
    </div>
  )
}

/** Horizontal magnitude bars for breakdowns (category spending, subject time). */
export function BreakdownBars({
  items,
  formatValue = String,
  max: maxIn,
}: {
  items: Array<{ key: string; label: string; value: number; icon?: ReactNode; sub?: string }>
  formatValue?: (v: number) => string
  max?: number
}) {
  const max = maxIn ?? Math.max(1, ...items.map((i) => i.value))
  const total = items.reduce((s, i) => s + i.value, 0)
  return (
    <ul className="flex flex-col gap-3">
      {items.map((it) => (
        <li key={it.key}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              {it.icon}
              <span className="truncate">{it.label}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              {formatValue(it.value)}
              {total > 0 && <span className="ml-1.5 text-faint">{Math.round((it.value / total) * 100)}%</span>}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (it.value / max) * 100)}%` }} />
          </div>
          {it.sub && <p className="mt-1 text-xs text-faint">{it.sub}</p>}
        </li>
      ))}
    </ul>
  )
}

/**
 * Calendar heatmap for one month. `values` maps date → intensity (0..1) or
 * null (no record). Sequential single hue: accent at increasing opacity.
 */
export function MonthHeatmap({
  dates,
  month,
  values,
  weekdayLabels,
  describe,
  onSelect,
}: {
  /** Grid dates (full weeks). */
  dates: string[]
  month: string
  values: Record<string, number | null>
  weekdayLabels: string[]
  describe: (date: string) => string
  onSelect?: (date: string) => void
}) {
  const [hover, setHover] = useState<string | null>(null)
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-faint">
        {weekdayLabels.map((w, i) => (
          <div key={i}>{w}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {dates.map((d) => {
          const inMonth = d.startsWith(month)
          const v = values[d]
          const level = v === null || v === undefined ? -1 : v <= 0 ? 0 : v < 0.34 ? 1 : v < 0.67 ? 2 : 3
          return (
            <button
              type="button"
              key={d}
              disabled={!inMonth}
              onClick={() => onSelect?.(d)}
              onMouseEnter={() => setHover(d)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(d)}
              aria-label={describe(d)}
              title={describe(d)}
              className={cn(
                'aspect-square rounded-md text-[10px] tabular-nums transition-transform',
                !inMonth && 'invisible',
                level === -1 && 'bg-surface-2 text-faint',
                level === 0 && 'bg-surface-3 text-muted',
                level >= 1 && 'text-text',
                hover === d && 'ring-1 ring-line-strong',
              )}
              style={level >= 1 ? { background: `color-mix(in srgb, var(--c-accent) ${level === 1 ? 30 : level === 2 ? 58 : 88}%, var(--c-surface-2))` } : undefined}
            >
              {Number(d.slice(8))}
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[10px] text-faint">
        <span>No record</span>
        <span className="h-2.5 w-2.5 rounded-sm bg-surface-2" />
        <span className="ml-1">Less</span>
        {[30, 58, 88].map((p) => (
          <span key={p} className="h-2.5 w-2.5 rounded-sm" style={{ background: `color-mix(in srgb, var(--c-accent) ${p}%, var(--c-surface-2))` }} />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}
