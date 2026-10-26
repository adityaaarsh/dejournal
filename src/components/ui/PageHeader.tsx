import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { NavSquare } from './Calm'
import { cn } from '@/lib/text'

/**
 * Page title row. `back` shows a back arrow (navigates to the given route, or
 * history back when `true`). Sticky so actions stay reachable while scrolling.
 */
export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  className,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  back?: string | boolean
  actions?: ReactNode
  className?: string
  children?: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <header className={cn('sticky top-0 z-20 -mx-4 bg-bg px-4 pt-[max(env(safe-area-inset-top),10px)] pb-3 sm:-mx-6 sm:px-6', className)}>
      <div className="flex min-h-11 items-center gap-3">
        {back && (
          <NavSquare
            icon={ChevronLeft}
            label="Back"
            onClick={() => {
              if (typeof back === 'string') navigate(back)
              else if (window.history.length > 1) navigate(-1)
              else navigate('/')
            }}
          />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[19px] leading-tight font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {children}
    </header>
  )
}
