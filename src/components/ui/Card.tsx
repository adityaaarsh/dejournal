import type { HTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/text'

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-[var(--radius-card)] border border-line bg-surface', className)} {...rest}>
      {children}
    </div>
  )
}

interface SectionCardProps {
  title: string
  icon?: LucideIcon
  /** Route to the full module. */
  to?: string
  linkLabel?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}

/** Card with a small header row: title (+ link to the full module) and optional action. */
export function SectionCard({ title, icon: Icon, to, linkLabel, action, children, className, bodyClassName }: SectionCardProps) {
  return (
    <Card className={cn('p-4', className)}>
      <div className="mb-2.5 flex min-h-6 items-center justify-between gap-2">
        {to ? (
          <Link to={to} className="group -m-1 inline-flex items-center gap-1.5 rounded-md p-1 text-[13px] font-medium text-muted hover:text-text">
            {Icon && <Icon size={15} strokeWidth={1.9} aria-hidden />}
            {title}
            <ChevronRight size={14} className="opacity-50 transition-transform group-hover:translate-x-0.5" aria-hidden />
            {linkLabel && <span className="sr-only">{linkLabel}</span>}
          </Link>
        ) : (
          <h2 className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted">
            {Icon && <Icon size={15} strokeWidth={1.9} aria-hidden />}
            {title}
          </h2>
        )}
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </Card>
  )
}

/** Compact stat tile: label + big value + optional sub line. */
export function StatTile({
  label,
  value,
  sub,
  to,
  onClick,
  className,
  children,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  to?: string
  onClick?: () => void
  className?: string
  children?: ReactNode
}) {
  const inner = (
    <>
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-faint">{sub}</div>}
      {children}
    </>
  )
  const cls = cn(
    'block rounded-[var(--radius-card)] border border-line bg-surface p-4 text-left',
    (to || onClick) && 'transition-colors hover:bg-surface-2',
    className,
  )
  if (to)
    return (
      <Link to={to} className={cls}>
        {inner}
      </Link>
    )
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cn(cls, 'w-full')}>
        {inner}
      </button>
    )
  return <div className={cls}>{inner}</div>
}

export function ProgressBar({ value, max, label, tone = 'accent' }: { value: number; max: number; label?: string; tone?: 'accent' | 'success' | 'warn' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-300',
          tone === 'accent' && 'bg-accent',
          tone === 'success' && 'bg-success',
          tone === 'warn' && 'bg-warn',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
