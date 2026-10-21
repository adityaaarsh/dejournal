import { Suspense, useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { MORE_GROUPS, PRIMARY_NAV } from './nav'
import { applyAppearance, useSettings } from '@/stores/settings'
import { openDialog } from '@/stores/ui'
import { ToastViewport } from '@/components/ui/Toasts'
import { LoadingState } from '@/components/ui/States'
import { DialogHost } from '@/features/quick/DialogHost'
import { ReminderScheduler } from '@/features/reminders/ReminderScheduler'
import { materializeSeries } from '@/db/tasks'
import { cn } from '@/lib/text'

function isActive(pathname: string, to: string) {
  if (to === '/') return pathname === '/'
  if (to === '/more') return pathname === '/more' || MORE_GROUPS.some((g) => g.items.some((i) => pathname.startsWith(i.to)))
  return pathname.startsWith(to)
}

function BottomNav() {
  const { pathname } = useLocation()
  return (
    <nav
      aria-label="Primary"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto flex max-w-2xl items-stretch justify-around px-2">
        {PRIMARY_NAV.map(({ to, label, icon: Icon }) => {
          const active = isActive(pathname, to)
          return (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                  active ? 'text-accent' : 'text-muted hover:text-text',
                )}
              >
                <Icon size={22} strokeWidth={active ? 2.1 : 1.7} aria-hidden />
                {label}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function Sidebar() {
  const { pathname } = useLocation()
  const link = (_to: string, active: boolean) =>
    cn(
      'flex h-10 shrink-0 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
      active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-text',
    )
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line px-3 py-5 lg:flex">
      <div className="mb-6 px-3 text-xl font-bold tracking-tight">DeJournal</div>
      <button
        type="button"
        onClick={() => openDialog({ kind: 'quick' })}
        className="mb-5 flex h-10 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-on-accent hover:bg-accent-strong"
      >
        <Plus size={18} aria-hidden /> New entry
      </button>
      <nav aria-label="Primary" className="flex flex-1 flex-col gap-0.5 overflow-y-auto scrollbar-none">
        {PRIMARY_NAV.filter((n) => n.to !== '/more').map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={link(to, isActive(pathname, to))} aria-current={isActive(pathname, to) ? 'page' : undefined}>
            <Icon size={18} strokeWidth={1.8} aria-hidden />
            {label}
          </NavLink>
        ))}
        {MORE_GROUPS.map((g) => (
          <div key={g.title} className="mt-5">
            <p className="mb-1 px-3 text-[11px] font-semibold tracking-wider text-faint uppercase">{g.title}</p>
            {g.items.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={link(to, pathname.startsWith(to))}>
                <Icon size={18} strokeWidth={1.8} aria-hidden />
                {label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  )
}

/** Floating quick-add button on mobile Today. */
function QuickFab() {
  const { pathname, search } = useLocation()
  if (pathname !== '/') return null // Calendar has its own add buttons
  const date = new URLSearchParams(search).get('d') ?? undefined
  return (
    <button
      type="button"
      aria-label="Quick add"
      onClick={() => openDialog({ kind: 'quick', date })}
      className="fixed right-4 bottom-[calc(80px+env(safe-area-inset-bottom))] z-30 grid h-14 w-14 place-items-center rounded-2xl bg-accent text-on-accent shadow-lg shadow-black/30 transition-transform hover:bg-accent-strong active:scale-95 lg:hidden"
    >
      <Plus size={26} strokeWidth={2} aria-hidden />
    </button>
  )
}

/** Global keyboard shortcuts: "/" search, "n" quick add. */
function useShortcuts() {
  const navigate = useNavigate()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (t.closest('input, textarea, select, [contenteditable="true"], dialog')) return
      if (e.key === '/') {
        e.preventDefault()
        navigate('/search')
      } else if (e.key === 'n') {
        e.preventDefault()
        openDialog({ kind: 'quick' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])
}

export function AppShell() {
  const settings = useSettings()
  const { pathname } = useLocation()

  useEffect(() => {
    applyAppearance(settings)
    if (settings.theme !== 'system') return
    const mq = matchMedia('(prefers-color-scheme: light)')
    const onChange = () => applyAppearance(settings)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [settings.theme, settings.accent, settings.motion]) // eslint-disable-line react-hooks/exhaustive-deps

  // Generate recurring task occurrences on start and when the app regains focus.
  useEffect(() => {
    materializeSeries().catch(console.error)
    const onVis = () => document.visibilityState === 'visible' && materializeSeries().catch(console.error)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  useShortcuts()

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:p-2">
        Skip to content
      </a>
      <Sidebar />
      <main id="main" className="min-w-0 flex-1">
        <Suspense fallback={<LoadingState />}>
          <Outlet />
        </Suspense>
      </main>
      <QuickFab />
      <BottomNav />
      <DialogHost />
      <ReminderScheduler />
      <ToastViewport />
    </div>
  )
}
