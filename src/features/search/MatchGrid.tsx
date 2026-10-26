import { useRef, type KeyboardEvent } from 'react'
import { addDays, formatDate, monthGrid, weekdayLabels, type WeekStart } from '@/lib/dates'
import { cn, plural } from '@/lib/text'

/**
 * Month grid for search results, in the Midnight Calm cell style. Days with
 * matches are filled (accent tile) and show their count; other days stay quiet
 * and can't be selected. Arrow keys move between days.
 */
export function MatchGrid({
  month,
  weekStartsOn,
  today,
  selected,
  counts,
  onSelect,
}: {
  month: string
  weekStartsOn: WeekStart
  today: string
  selected: string | null
  counts: Map<string, number>
  onSelect: (date: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const dates = monthGrid(month, weekStartsOn)

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, d: string) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (!(e.key in step)) return
    e.preventDefault()
    const next = addDays(d, step[e.key])
    ref.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus()
  }

  return (
    <div ref={ref}>
      <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold text-muted" aria-hidden>
        {weekdayLabels(weekStartsOn, 'narrow').map((h, i) => (
          <div key={i}>{h}</div>
        ))}
      </div>
      <div role="grid" aria-label={`Matches in ${month}`} className="grid grid-cols-7 gap-1.5">
        {dates.map((d) => {
          if (!d.startsWith(month)) return <div key={d} aria-hidden />
          const n = counts.get(d) ?? 0
          const isSel = selected === d
          return (
            <button
              key={d}
              type="button"
              data-date={d}
              disabled={!n}
              aria-selected={isSel}
              aria-current={d === today ? 'date' : undefined}
              aria-label={`${formatDate(d, 'EEEE d MMMM')}: ${n ? plural(n, 'match', 'matches') : 'no matches'}`}
              onClick={() => onSelect(d)}
              onKeyDown={(e) => onKey(e, d)}
              className={cn(
                'relative flex aspect-square flex-col items-center justify-center rounded-xl text-[13px] font-bold tabular-nums transition-colors',
                n ? 'bg-tile-1 text-on-tile hover:brightness-105' : 'bg-surface text-faint',
                isSel && 'ring-2 ring-text ring-offset-2 ring-offset-bg',
                !isSel && d === today && 'ring-1 ring-accent',
              )}
            >
              {Number(d.slice(8))}
              {n > 0 && <span className="absolute bottom-1 text-[9px] leading-none font-semibold opacity-70">{n > 9 ? '9+' : n}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
