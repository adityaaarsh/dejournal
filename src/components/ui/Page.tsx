import type { ReactNode } from 'react'
import { cn } from '@/lib/text'

/**
 * Page content container. `narrow` (default) suits list/detail screens;
 * `wide` suits Calendar and Recap on desktop.
 */
export function Page({ children, width = 'narrow', className }: { children: ReactNode; width?: 'narrow' | 'wide'; className?: string }) {
  return (
    <div className={cn('mx-auto w-full px-4 pb-28 sm:px-6 lg:pb-12', width === 'narrow' ? 'max-w-2xl' : 'max-w-5xl', className)}>
      {children}
    </div>
  )
}
