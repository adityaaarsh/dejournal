import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { IconButton } from './Button'
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
    <header className={cn('sticky top-0 z-20 -mx-4 bg-bg/90 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 backdrop-blur-md sm:-mx-6 sm:px-6', className)}>
      <div className="flex min-h-11 items-center gap-2">
        {back && (
          <IconButton
            icon={ArrowLeft}
            label="Back"
            className="-ml-2.5"
            onClick={() => {
              if (typeof back === 'string') navigate(back)
              else if (window.history.length > 1) navigate(-1)
              else navigate('/')
            }}
          />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="truncate text-[13px] text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {children}
    </header>
  )
}
