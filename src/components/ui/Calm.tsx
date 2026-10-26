import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Angry, ChevronLeft, ChevronRight, Frown, Laugh, Meh, Smile, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/text'
import { addDays, monthGrid, weekdayLabels, type WeekStart } from '@/lib/dates'

/*
 * Midnight Calm layout primitives. Pages are built from these so every screen
 * shares one visual language: square nav buttons, centred headers, coloured
 * icon tiles, timeline rows and the mood-coloured month grid.
 */

/* ------------------------------------------------------------------ */
/* Tones                                                               */
/* ------------------------------------------------------------------ */

/** Icon-tile colours. 1–5 are soft categorical fills; the rest carry meaning. */
export type Tone = 1 | 2 | 3 | 4 | 5 | 'accent' | 'success' | 'warn' | 'danger' | 'muted'

const TONE: Record<string, string> = {
  1: 'bg-tile-1 text-on-tile',
  2: 'bg-tile-2 text-on-tile',
  3: 'bg-tile-3 text-on-tile',
  4: 'bg-tile-4 text-on-tile',
  5: 'bg-tile-5 text-on-tile',
  accent: 'bg-accent text-on-accent',
  success: 'bg-success text-surface',
  warn: 'bg-warn text-surface',
  danger: 'bg-danger text-surface',
  muted: 'bg-surface-2 text-muted',
}

/** Rating 1–5 → mood cell classes (background + readable text). */
export const MOOD_CELL: Record<number, string> = {
  1: 'bg-mood-1 text-on-mood',
  2: 'bg-mood-2 text-on-mood',
  3: 'bg-mood-3 text-on-mood',
  4: 'bg-mood-4 text-on-mood',
  5: 'bg-mood-5 text-on-mood',
}
export const MOOD_DOT: Record<number, string> = { 1: 'bg-mood-1', 2: 'bg-mood-2', 3: 'bg-mood-3', 4: 'bg-mood-4', 5: 'bg-mood-5' }
export const MOOD_FACES: LucideIcon[] = [Angry, Frown, Meh, Smile, Laugh]

/* ------------------------------------------------------------------ */
/* Icon tile                                                           */
/* ------------------------------------------------------------------ */

export function IconTile({
  icon: Icon,
  tone = 1,
  size = 'md',
  className,
}: {
  icon: LucideIcon
  tone?: Tone
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const box = size === 'sm' ? 'h-7 w-7 rounded-[9px]' : size === 'lg' ? 'h-11 w-11 rounded-[14px]' : 'h-[34px] w-[34px] rounded-xl'
  const ic = size === 'sm' ? 14 : size === 'lg' ? 21 : 17
  return (
    <span className={cn('grid shrink-0 place-items-center', box, TONE[String(tone)], className)} aria-hidden>
      <Icon size={ic} strokeWidth={2.1} />
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Square nav button (chevrons, back, header actions)                  */
/* ------------------------------------------------------------------ */

export function NavSquare({
  icon: Icon,
  label,
  onClick,
  to,
  className,
  disabled,
  active,
}: {
  icon: LucideIcon
  label: string
  onClick?: () => void
  to?: string
  className?: string
  disabled?: boolean
  active?: boolean
}) {
  const cls = cn(
    'grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:pointer-events-none disabled:opacity-40',
    active && 'border-accent/50 bg-accent-soft text-accent',
    className,
  )
  if (to)
    return (
      <Link to={to} aria-label={label} title={label} className={cls}>
        <Icon size={18} strokeWidth={2} aria-hidden />
      </Link>
    )
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={cls}>
      <Icon size={18} strokeWidth={2} aria-hidden />
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Centred header: ‹  Title / subtitle  ›                              */
/* ------------------------------------------------------------------ */

export function CenteredHeader({
  title,
  subtitle,
  onPrev,
  onNext,
  prevLabel = 'Previous',
  nextLabel = 'Next',
  nextDisabled,
  left,
  right,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  onPrev?: () => void
  onNext?: () => void
  prevLabel?: string
  nextLabel?: string
  nextDisabled?: boolean
  /** Replaces the previous button (e.g. a back button). */
  left?: ReactNode
  /** Replaces the next button (e.g. an add button). */
  right?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex items-center gap-3 pt-[max(env(safe-area-inset-top),10px)] pb-3', className)}>
      {left ?? (onPrev ? <NavSquare icon={ChevronLeft} label={prevLabel} onClick={onPrev} /> : <span className="w-10 shrink-0" />)}
      <div className="min-w-0 flex-1 text-center">
        <h1 className="truncate font-display text-[19px] leading-tight font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>}
      </div>
      {right ?? (onNext ? <NavSquare icon={ChevronRight} label={nextLabel} onClick={onNext} disabled={nextDisabled} /> : <span className="w-10 shrink-0" />)}
    </header>
  )
}

/* ------------------------------------------------------------------ */
/* Section label (small heading above a group)                         */
/* ------------------------------------------------------------------ */

export function SectionLabel({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('mt-2 mb-1.5 flex items-center justify-between gap-2 px-1', className)}>
      <h2 className="text-[13px] font-semibold text-muted">{children}</h2>
      {action}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Timeline row: time | icon tile | title + subtitle | trailing        */
/* ------------------------------------------------------------------ */

export function TimelineRow({
  time,
  icon,
  tone = 1,
  title,
  subtitle,
  trailing,
  onClick,
  to,
  done,
  className,
}: {
  time?: ReactNode
  icon: LucideIcon
  tone?: Tone
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  to?: string
  done?: boolean
  className?: string
}) {
  const inner = (
    <>
      {time !== undefined && (
        <span className="dj-time w-12 shrink-0 text-xs font-semibold text-muted tabular-nums" data-empty={time === '' || time === null ? '' : undefined}>
          {time}
        </span>
      )}
      <IconTile icon={icon} tone={done ? 'muted' : tone} />
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[14px] font-semibold', done && 'text-faint line-through')}>{title}</span>
        {subtitle && <span className="block truncate text-xs text-muted">{subtitle}</span>}
      </span>
      {trailing}
    </>
  )
  const cls = cn('flex min-h-[52px] w-full items-center gap-3 rounded-xl py-1.5 text-left', (onClick || to) && 'transition-colors hover:bg-surface-2/60', className)
  if (to)
    return (
      <Link to={to} className={cls}>
        {inner}
      </Link>
    )
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    )
  return <div className={cls}>{inner}</div>
}

/* ------------------------------------------------------------------ */
/* Month grid with mood-coloured (or custom) cells                     */
/* ------------------------------------------------------------------ */

export interface DayCell {
  /** Mood rating 1–5 colours the whole cell. */
  rating?: number | null
  /** Small dots under the number (e.g. record types), as Tailwind bg classes. */
  dots?: string[]
  /** Extra accessible text for the day. */
  label?: string
}

/**
 * Month grid in the Midnight Calm style. Cells are rounded squares; rated days
 * are filled with their mood colour, others stay quiet surfaces. Arrow keys
 * move the selection; PageUp/PageDown change month (via onSelect).
 */
export function MonthGrid({
  month,
  weekStartsOn,
  selected,
  today,
  cells,
  onSelect,
  onOpen,
  className,
}: {
  month: string
  weekStartsOn: WeekStart
  selected?: string | null
  today: string
  cells: Record<string, DayCell | undefined>
  onSelect: (date: string) => void
  /** Enter / double-click on a day. */
  onOpen?: (date: string) => void
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const dates = monthGrid(month, weekStartsOn)
  const heads = weekdayLabels(weekStartsOn, 'narrow')

  const focusDate = (d: string) => {
    onSelect(d)
    requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>(`[data-date="${d}"]`)?.focus())
  }

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, d: string) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, PageUp: -30, PageDown: 30 }
    if (e.key in step) {
      e.preventDefault()
      focusDate(addDays(d, step[e.key]))
    } else if (e.key === 'Enter' && onOpen) {
      e.preventDefault()
      onOpen(d)
    }
  }

  return (
    <div ref={ref} className={className}>
      <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold text-muted" aria-hidden>
        {heads.map((h, i) => (
          <div key={i}>{h}</div>
        ))}
      </div>
      <div role="grid" aria-label="Month" className="grid grid-cols-7 gap-1.5">
        {dates.map((d) => {
          const inMonth = d.startsWith(month)
          if (!inMonth) return <div key={d} aria-hidden />
          const c = cells[d]
          const rated = c?.rating ? MOOD_CELL[c.rating] : null
          const isSel = selected === d
          const isToday = d === today
          return (
            <button
              key={d}
              type="button"
              data-date={d}
              tabIndex={isSel || (!selected && isToday) ? 0 : -1}
              aria-selected={isSel}
              aria-current={isToday ? 'date' : undefined}
              aria-label={[d, c?.rating ? `mood ${c.rating} of 5` : null, c?.label].filter(Boolean).join(', ')}
              onClick={() => onSelect(d)}
              onDoubleClick={() => onOpen?.(d)}
              onKeyDown={(e) => onKey(e, d)}
              className={cn(
                'relative flex aspect-square flex-col items-center justify-center rounded-xl text-[13px] font-bold tabular-nums transition-[transform,background-color]',
                rated ?? 'bg-surface-2 text-muted hover:bg-surface-3',
                isSel && 'ring-2 ring-text ring-offset-2 ring-offset-bg',
                !isSel && isToday && (rated ? 'ring-2 ring-on-mood/55 ring-inset' : 'ring-2 ring-accent ring-inset text-accent'),
              )}
            >
              {Number(d.slice(8))}
              {!!c?.dots?.length && (
                <span className="absolute bottom-1 flex gap-0.5" aria-hidden>
                  {c.dots.slice(0, 3).map((dot, i) => (
                    <span key={i} className={cn('h-1 w-1 rounded-full', rated ? 'bg-on-mood/60' : dot)} />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Legend for the mood scale: coloured square + face + number. */
export function MoodLegend({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-between px-0.5 text-[11px] text-muted', className)}>
      {[5, 4, 3, 2, 1].map((r) => {
        const Face = MOOD_FACES[r - 1]
        return (
          <span key={r} className="inline-flex items-center gap-1">
            <span className={cn('h-2.5 w-2.5 rounded-[3px]', MOOD_DOT[r])} aria-hidden />
            <Face size={13} strokeWidth={2} aria-hidden />
            {r}
          </span>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Big stat tile (label with icon, display number, sub)                */
/* ------------------------------------------------------------------ */

export function MetricTile({
  icon: Icon,
  label,
  value,
  sub,
  to,
  onClick,
  className,
  children,
}: {
  icon?: LucideIcon
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  to?: string
  onClick?: () => void
  className?: string
  children?: ReactNode
}) {
  const inner = (
    <>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
        {Icon && <Icon size={13} strokeWidth={2.1} aria-hidden />}
        {label}
      </div>
      <div className="mt-2 font-display text-[20px] leading-tight font-semibold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[11.5px] text-muted">{sub}</div>}
      {children}
    </>
  )
  const cls = cn(
    'block rounded-[var(--radius-card)] border border-line bg-surface p-3 text-left',
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

/**
 * One tone per record type, used everywhere so a task, expense or reminder is
 * always the same colour across Calendar, Search, Recap and module pages.
 */
export const RECORD_TONE = {
  task: 1,
  expense: 2,
  study: 3,
  reminder: 4,
  event: 'accent',
  note: 5,
  photo: 4,
  highlight: 'warn',
  place: 3,
  screentime: 5,
  focus: 3,
  routine: 'success',
  reflection: 'accent',
} as const satisfies Record<string, Tone>
