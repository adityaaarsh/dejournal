import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Smartphone, TrendingDown, TrendingUp } from 'lucide-react'
import { db } from '@/db/db'
import type { ISODate } from '@/db/types'
import { addDays, today } from '@/lib/dates'
import { formatDuration } from '@/lib/duration'
import { cn } from '@/lib/text'
import { isNativeApp, onNativeEvent, usageAccessGranted } from '@/platform/native'
import { syncPhoneScreenTime } from '@/features/screentime/PhoneUsageSync'
import { screenTimeSlices, type Slice } from '@/domain/screentime'

/** Donut with the day's total in the middle. Gaps separate the slices. */
function Donut({ slices, total }: { slices: Slice[]; total: number }) {
  const R = 40
  const C = 2 * Math.PI * R
  const gap = slices.length > 1 ? 3 : 0
  let offset = 0
  return (
    <svg width="92" height="92" viewBox="0 0 96 96" className="shrink-0" aria-hidden>
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

/** Keep today's phone screen time fresh in the Android app (at most once a minute). */
let lastSync = 0
function useAutoSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !isNativeApp()) return
    const run = () => {
      if (!usageAccessGranted() || Date.now() - lastSync < 60_000) return
      lastSync = Date.now()
      syncPhoneScreenTime().catch(console.error)
    }
    run()
    return onNativeEvent((e) => e.type === 'resume' && run())
  }, [enabled])
}

export function ScreenTimeCard({ date }: { date: ISODate }) {
  const isToday = date === today()
  useAutoSync(isToday)
  const rec = useLiveQuery(async () => (await db.screenTime.where('date').equals(date).first()) ?? null, [date])
  // Average of the previous 7 logged days, for the comparison chip.
  const avg = useLiveQuery(async () => {
    const rows = await db.screenTime.where('date').between(addDays(date, -7), date, true, false).toArray()
    return rows.length ? rows.reduce((s, r) => s + r.minutes, 0) / rows.length : null
  }, [date])

  const total = rec?.minutes ?? 0
  const slices = screenTimeSlices(rec ?? null)
  const delta = rec && avg != null ? Math.round(total - avg) : null
  const needsAccess = isNativeApp() && !usageAccessGranted()

  return (
    <Link
      to="/screen-time"
      className="col-span-2 flex items-center gap-3.5 rounded-[var(--radius-card)] border border-line bg-surface py-2.5 pr-3.5 pl-3 transition-colors hover:bg-surface-2"
    >
      <Donut slices={slices} total={total} />
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
          <Smartphone size={13} strokeWidth={2.1} aria-hidden /> Screen time
          {delta != null && delta !== 0 && (
            <span className={cn('ml-auto inline-flex items-center gap-1 text-[11px] font-semibold', delta < 0 ? 'text-success' : 'text-warn')}>
              {delta < 0 ? <TrendingDown size={12} aria-hidden /> : <TrendingUp size={12} aria-hidden />}
              {formatDuration(Math.abs(delta) * 60)} vs avg
            </span>
          )}
        </div>
        {rec ? (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
            {slices.map((s) => (
              <li key={s.key} className="flex min-w-0 items-center gap-1.5 text-text/80">
                <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: s.color }} aria-hidden />
                <span className="truncate">{s.label}</span>
                <span className="ml-auto font-semibold text-text tabular-nums">{formatDuration(s.minutes * 60)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] leading-snug text-faint">
            {needsAccess ? 'Allow usage access to track it automatically.' : isToday ? 'Tap to log today’s screen time.' : 'Nothing logged for this day.'}
          </p>
        )}
      </div>
    </Link>
  )
}
