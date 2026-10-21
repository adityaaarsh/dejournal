import { cn } from '@/lib/text'
import { weekdayLabels, type WeekStart } from '@/lib/dates'

const FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Toggle buttons for weekdays (values 0=Sun … 6=Sat), ordered by week start. */
export function WeekdayPicker({
  value,
  onChange,
  weekStartsOn,
  label = 'Days of the week',
}: {
  value: number[]
  onChange: (days: number[]) => void
  weekStartsOn: WeekStart
  label?: string
}) {
  const labels = weekdayLabels(weekStartsOn, 'narrow')
  const order = weekStartsOn === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6]
  return (
    <div role="group" aria-label={label} className="flex gap-1.5">
      {order.map((d, i) => {
        const on = value.includes(d)
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            aria-label={FULL[d]}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort())}
            className={cn(
              'grid h-10 w-10 place-items-center rounded-full border text-[13px] font-medium transition-colors',
              on ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface-2 text-muted hover:text-text',
            )}
          >
            {labels[i]}
          </button>
        )
      })}
    </div>
  )
}
