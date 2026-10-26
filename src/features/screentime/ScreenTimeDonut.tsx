import type { ScreenTimeRecord } from '@/db/types'
import { formatDuration } from '@/lib/duration'
import { screenTimeSlices, type Slice } from '@/domain/screentime'

/** Donut of a day's screen time by category, with the total in the middle. */
export function ScreenTimeDonut({ slices, total, size = 104 }: { slices: Slice[]; total: number; size?: number }) {
  const R = 40
  const C = 2 * Math.PI * R
  const gap = slices.length > 1 ? 3 : 0
  let offset = 0
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" className="shrink-0" aria-hidden>
      <circle cx="48" cy="48" r={R} fill="none" stroke="var(--c-surface-2)" strokeWidth="8" />
      {total > 0 &&
        slices.map((s) => {
          const len = (s.minutes / total) * C
          const el = (
            <circle
              key={s.key}
              cx="48"
              cy="48"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="8"
              strokeDasharray={`${Math.max(0, len - gap)} ${C}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 48 48)"
            />
          )
          offset += len
          return el
        })}
      <text x="48" y="49" textAnchor="middle" fontFamily="Unbounded Variable, sans-serif" fontWeight="600" fontSize="13" fill="var(--c-text)">
        {total > 0 ? formatDuration(total * 60) : '—'}
      </text>
      <text x="48" y="62" textAnchor="middle" fontSize="9.5" fill="var(--c-muted)">
        {total > 0 ? 'today' : 'not logged'}
      </text>
    </svg>
  )
}

/** Legend rows for the donut. */
export function ScreenTimeLegend({ slices }: { slices: Slice[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
      {slices.map((s) => (
        <li key={s.key} className="flex min-w-0 items-center gap-1.5 text-text/80">
          <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: s.color }} aria-hidden />
          <span className="truncate">{s.label}</span>
          <span className="ml-auto font-semibold text-text tabular-nums">{formatDuration(s.minutes * 60)}</span>
        </li>
      ))}
    </ul>
  )
}

export function slicesFor(rec: ScreenTimeRecord | undefined | null): Slice[] {
  return screenTimeSlices(rec ?? null)
}
