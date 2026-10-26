import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bell, Camera, ChevronLeft, ChevronRight, Plus, UserRound } from 'lucide-react'
import { db } from '@/db/db'
import type { ISODate } from '@/db/types'
import { occurrenceState, remindersOn } from '@/db/reminders'
import { usePhotoUrl } from '@/db/photos'
import { addDays, dateRange, formatDate, isISODate, relativeDayLabel, today, weekRange, weekdayLabels, type WeekStart } from '@/lib/dates'
import { openDialog } from '@/stores/ui'
import { cn } from '@/lib/text'

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

/** Colour of a day's rating dot: good (4–5), okay (3), hard (1–2). */
const ratingDot = (r: number | null | undefined) =>
  !r ? 'bg-transparent' : r >= 4 ? 'bg-success' : r === 3 ? 'bg-warn' : 'bg-danger'

/**
 * Today header: selfie avatar, greeting + date (tap for a date picker),
 * quick add, reminders, and a week strip for nearby days.
 */
export function TodayHeader({
  date,
  onDate,
  weekStartsOn,
}: {
  date: ISODate
  onDate: (d: ISODate) => void
  weekStartsOn: WeekStart
}) {
  const pickerRef = useRef<HTMLInputElement>(null)
  const todayDate = today()
  const isToday = date === todayDate
  const day = useLiveQuery(async () => (await db.days.get(date)) ?? null, [date])
  const selfieUrl = usePhotoUrl(day?.selfiePhotoId ?? null)
  const [weekStart, weekEnd] = weekRange(date, weekStartsOn)
  const week = dateRange(weekStart, weekEnd)
  const ratings = useLiveQuery(async () => {
    const rows = await db.days.where('date').between(weekStart, weekEnd, true, true).toArray()
    return Object.fromEntries(rows.map((r) => [r.date, r.rating ?? null])) as Record<string, number | null>
  }, [weekStart, weekEnd])
  const pendingReminders = useLiveQuery(
    async () => remindersOn(await db.reminders.toArray(), todayDate).filter((r) => occurrenceState(r, todayDate) === 'pending').length,
    [todayDate],
  )
  const letters = weekdayLabels(weekStartsOn, 'narrow')

  const openPicker = () => {
    const el = pickerRef.current
    if (!el) return
    try {
      el.showPicker()
    } catch {
      el.focus()
      el.click()
    }
  }

  return (
    <header className="pt-[max(env(safe-area-inset-top),10px)] pb-2">
      <div className="flex h-12 items-center gap-2.5">
        <button
          type="button"
          onClick={() => openDialog({ kind: 'photo', date, selfie: true })}
          aria-label={selfieUrl ? 'Change daily selfie' : 'Add daily selfie'}
          className="relative h-10 w-10 shrink-0 rounded-full"
        >
          <span className="grid h-full w-full place-items-center overflow-hidden rounded-full border-[1.5px] border-accent text-accent">
            {selfieUrl ? <img src={selfieUrl} alt="Daily selfie" className="h-full w-full object-cover" /> : <UserRound size={19} strokeWidth={1.9} aria-hidden />}
          </span>
          <span className="absolute -right-1 -bottom-1 grid h-[18px] w-[18px] place-items-center rounded-full border-2 border-bg bg-accent text-on-accent">
            <Camera size={9} strokeWidth={2.6} aria-hidden />
          </span>
        </button>

        <div className="relative min-w-0 flex-1">
          <div className="truncate text-xs text-muted">
            {isToday ? (
              greeting()
            ) : (
              <>
                {relativeDayLabel(date, 'EEEE')} ·{' '}
                <button type="button" onClick={() => onDate(todayDate)} className="font-semibold text-accent hover:underline">
                  Back to today
                </button>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={openPicker}
            aria-label={`Selected date ${formatDate(date, 'EEEE, d MMMM yyyy')}. Choose a date`}
            className="block max-w-full truncate text-left font-display text-[16px] font-semibold tracking-tight"
          >
            {formatDate(date, 'EEEE, d MMM')}
          </button>
          <input
            ref={pickerRef}
            type="date"
            tabIndex={-1}
            aria-hidden
            value={date}
            onChange={(e) => isISODate(e.target.value) && onDate(e.target.value)}
            className="pointer-events-none absolute bottom-0 left-0 h-6 w-full opacity-0"
          />
        </div>

        <button
          type="button"
          onClick={() => openDialog({ kind: 'quick', date })}
          aria-label="Add to this day"
          title="Add"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          <Plus size={18} strokeWidth={2} aria-hidden />
        </button>
        <Link
          to="/reminders"
          aria-label={pendingReminders ? `Reminders, ${pendingReminders} pending today` : 'Reminders'}
          title="Reminders"
          className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          <Bell size={17} strokeWidth={1.9} aria-hidden />
          {!!pendingReminders && <span className="absolute top-2 right-2.5 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />}
        </Link>
      </div>

      <div className="mt-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => onDate(addDays(date, -7))}
          aria-label="Previous week"
          className="grid h-12 w-6 shrink-0 place-items-center rounded-lg text-faint hover:text-text"
        >
          <ChevronLeft size={16} aria-hidden />
        </button>
        <div role="group" aria-label="This week" className="flex flex-1 gap-1">
          {week.map((d, i) => {
            const selected = d === date
            const isTodayCell = d === todayDate
            return (
              <button
                key={d}
                type="button"
                onClick={() => onDate(d)}
                aria-label={formatDate(d, 'EEEE d MMMM')}
                aria-current={selected ? 'date' : undefined}
                className={cn(
                  'flex h-12 flex-1 flex-col items-center justify-center rounded-[13px] border text-[10px] transition-colors',
                  selected ? 'border-accent bg-accent text-on-accent' : 'border-line text-muted hover:bg-surface-2',
                  !selected && isTodayCell && 'border-accent/60 text-accent',
                )}
              >
                {letters[i]}
                <span className={cn('font-display text-[13.5px] leading-tight font-semibold', selected ? 'text-on-accent' : 'text-text')}>
                  {Number(d.slice(8))}
                </span>
                <span className={cn('mt-0.5 h-1 w-1 rounded-full', selected ? (ratings?.[d] ? 'bg-on-accent/70' : 'bg-transparent') : ratingDot(ratings?.[d]))} aria-hidden />
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => onDate(addDays(date, 7))}
          aria-label="Next week"
          className="grid h-12 w-6 shrink-0 place-items-center rounded-lg text-faint hover:text-text"
        >
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>
    </header>
  )
}
