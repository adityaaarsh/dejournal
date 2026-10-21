/** "1h 20m", "45m", "0m". */
export function formatDuration(totalSec: number, opts: { seconds?: boolean } = {}): string {
  const sec = Math.max(0, Math.round(totalSec))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (opts.seconds && h === 0 && m === 0) return `${s}s`
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** Clock display "1:05:09" or "05:09". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** "1.5h", "12h". */
export function formatHours(totalSec: number): string {
  const h = totalSec / 3600
  return h >= 10 ? `${Math.round(h)}h` : `${Math.round(h * 10) / 10}h`
}
