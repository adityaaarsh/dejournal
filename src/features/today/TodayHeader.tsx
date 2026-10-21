import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Settings, Undo2 } from 'lucide-react'
import type { ISODate } from '@/db/types'
import { addDays, formatDate, isISODate, relativeDayLabel, today } from '@/lib/dates'
import { IconButton } from '@/components/ui'

/**
 * Wordmark + selected date. Prev/next day buttons, a native date picker behind
 * the date label, a "Back to today" pill on other dates, and a settings link.
 */
export function TodayHeader({ date, onDate, dateFormat }: { date: ISODate; onDate: (d: ISODate) => void; dateFormat: string }) {
  const pickerRef = useRef<HTMLInputElement>(null)
  const isToday = date === today()
  const rel = relativeDayLabel(date, dateFormat)

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
    <header className="sticky top-0 z-20 -mx-4 bg-bg/90 px-4 pt-[max(env(safe-area-inset-top),14px)] pb-2 backdrop-blur-md sm:-mx-6 sm:px-6">
      <div className="flex min-h-11 items-center gap-1">
        <h1 className="mr-auto text-[22px] font-bold tracking-tight lg:hidden">DeJournal</h1>
        <h1 className="mr-auto hidden text-[22px] font-semibold tracking-tight lg:block">{isToday ? 'Today' : rel}</h1>
        <IconButton icon={ChevronLeft} label="Previous day" size="sm" onClick={() => onDate(addDays(date, -1))} />
        <div className="relative">
          <button
            type="button"
            onClick={openPicker}
            className="h-9 rounded-lg px-2 text-[15px] font-medium tabular-nums hover:bg-surface-2"
            aria-label={`Selected date ${formatDate(date, 'EEEE, d MMMM yyyy')}. Choose a date`}
          >
            {formatDate(date, dateFormat)}
          </button>
          <input
            ref={pickerRef}
            type="date"
            tabIndex={-1}
            aria-hidden
            value={date}
            onChange={(e) => isISODate(e.target.value) && onDate(e.target.value)}
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          />
        </div>
        <IconButton icon={ChevronRight} label="Next day" size="sm" onClick={() => onDate(addDays(date, 1))} />
        <Link
          to="/settings"
          aria-label="Settings"
          title="Settings"
          className="ml-0.5 grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-text"
        >
          <Settings size={18} strokeWidth={1.8} aria-hidden />
        </Link>
      </div>
      {!isToday && (
        <div className="mt-1 flex items-center justify-between gap-2 rounded-xl bg-accent-soft px-3 py-1.5 text-[13px] text-accent">
          <span>
            Viewing <strong className="font-semibold">{rel}</strong>
          </span>
          <button type="button" onClick={() => onDate(today())} className="inline-flex items-center gap-1 font-medium hover:underline">
            <Undo2 size={13} aria-hidden /> Back to today
          </button>
        </div>
      )}
    </header>
  )
}
