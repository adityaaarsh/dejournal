import type { ReactNode } from 'react'
import { AlertTriangle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/text'
import { Button, Spinner } from './Button'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  compact?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-1.5 py-5' : 'gap-2 rounded-[var(--radius-card)] border border-dashed border-line px-6 py-12',
        className,
      )}
    >
      {Icon && (
        <div className={cn('mb-1 grid place-items-center rounded-2xl bg-surface-2 text-muted', compact ? 'h-9 w-9' : 'h-12 w-12')}>
          <Icon size={compact ? 18 : 22} strokeWidth={1.7} aria-hidden />
        </div>
      )}
      <p className={cn('font-medium', compact ? 'text-sm' : 'text-[15px]')}>{title}</p>
      {description && <p className="max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
      <Spinner />
      {label}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-line bg-danger-soft px-6 py-8 text-center">
      <AlertTriangle className="text-danger" size={22} aria-hidden />
      <p className="text-sm">{message}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

/** Inline notice banner (info / warning / setup required). */
export function Notice({
  icon: Icon,
  tone = 'default',
  title,
  children,
  action,
  className,
}: {
  icon?: LucideIcon
  tone?: 'default' | 'warn' | 'accent' | 'danger'
  title?: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-[var(--radius-card)] border p-4 text-[13px] leading-relaxed',
        tone === 'default' && 'border-line bg-surface-2 text-muted',
        tone === 'warn' && 'border-warn-line bg-warn-soft text-warn',
        tone === 'accent' && 'border-transparent bg-accent-soft text-accent',
        tone === 'danger' && 'border-transparent bg-danger-soft text-danger',
        className,
      )}
    >
      {Icon && <Icon size={18} strokeWidth={1.8} className="mt-0.5 shrink-0" aria-hidden />}
      <div className="min-w-0 flex-1">
        {title && <p className="mb-0.5 font-medium text-text">{title}</p>}
        <div>{children}</div>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  )
}
