import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { NavSquare } from '@/components/ui'

/** Centred period navigator: ‹ title / subtitle › (Study, Expenses, Screen time). */
export function PeriodRow({
  title,
  subtitle,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  nextDisabled,
}: {
  title: ReactNode
  subtitle?: ReactNode
  onPrev: () => void
  onNext: () => void
  prevLabel: string
  nextLabel: string
  nextDisabled?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <NavSquare icon={ChevronLeft} label={prevLabel} onClick={onPrev} />
      <div className="min-w-0 flex-1 text-center">
        <div className="truncate font-display text-[16px] leading-tight font-semibold tracking-tight">{title}</div>
        {subtitle && <div className="mt-0.5 truncate text-xs text-muted">{subtitle}</div>}
      </div>
      <NavSquare icon={ChevronRight} label={nextLabel} onClick={onNext} disabled={nextDisabled} />
    </div>
  )
}

/** Card header row: title on the left, "+ Add" (or any action) on the right. */
export function CardHead({ title, meta, onAdd, addLabel = 'Add' }: { title: ReactNode; meta?: ReactNode; onAdd?: () => void; addLabel?: string }) {
  return (
    <div className="flex items-center gap-2 px-0.5 pt-1 pb-0.5">
      <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold">{title}</h3>
      {meta && <span className="shrink-0 text-xs font-semibold text-muted tabular-nums">{meta}</span>}
      {onAdd && (
        <button type="button" onClick={onAdd} className="shrink-0 rounded-lg px-1.5 py-1 text-[13px] font-semibold text-accent hover:bg-accent-soft">
          + {addLabel}
        </button>
      )}
    </div>
  )
}

/** Three compact stats in one card (fits narrow phones better than three tiles). */
export function StatStrip({ items }: { items: Array<{ label: string; value: ReactNode; sub?: ReactNode }> }) {
  return (
    <div className="grid grid-cols-3 divide-x divide-line rounded-[var(--radius-card)] border border-line bg-surface py-3">
      {items.map((it) => (
        <div key={it.label} className="min-w-0 px-3 text-center">
          <div className="truncate text-[11px] font-semibold text-muted">{it.label}</div>
          <div className="mt-1 truncate font-display text-[16px] leading-tight font-semibold tracking-tight tabular-nums">{it.value}</div>
          {it.sub && <div className="mt-0.5 truncate text-[11px] text-faint">{it.sub}</div>}
        </div>
      ))}
    </div>
  )
}
