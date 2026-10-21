import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/text'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: LucideIcon
  iconRight?: LucideIcon
  loading?: boolean
  block?: boolean
}

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-strong',
  secondary: 'bg-surface-2 text-text border border-line hover:bg-surface-3',
  subtle: 'bg-accent-soft text-accent hover:brightness-110',
  ghost: 'text-muted hover:text-text hover:bg-surface-2',
  danger: 'bg-danger-soft text-danger hover:brightness-110',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, loading, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors duration-150 select-none',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : Icon ? <Icon size={size === 'sm' ? 15 : 17} strokeWidth={1.9} aria-hidden /> : null}
      {children}
      {IconRight && <IconRight size={size === 'sm' ? 15 : 17} strokeWidth={1.9} aria-hidden />}
    </button>
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  /** Accessible name (required for icon-only buttons). */
  label: string
  size?: 'sm' | 'md'
  variant?: 'ghost' | 'secondary' | 'primary' | 'danger'
  active?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, size = 'md', variant = 'ghost', active, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl transition-colors duration-150',
        'disabled:pointer-events-none disabled:opacity-40',
        size === 'md' ? 'h-11 w-11' : 'h-9 w-9',
        variant === 'ghost' && (active ? 'bg-accent-soft text-accent' : 'text-muted hover:text-text hover:bg-surface-2'),
        variant === 'secondary' && 'border border-line bg-surface-2 text-text hover:bg-surface-3',
        variant === 'primary' && 'bg-accent text-on-accent hover:bg-accent-strong',
        variant === 'danger' && 'text-danger hover:bg-danger-soft',
        className,
      )}
      {...rest}
    >
      <Icon size={size === 'md' ? 20 : 18} strokeWidth={1.8} aria-hidden />
    </button>
  )
})

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)}
    />
  )
}

export function LinkButton({ children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button type="button" className={cn('text-[13px] font-medium text-accent hover:underline', className)} {...rest}>
      {children}
    </button>
  )
}
