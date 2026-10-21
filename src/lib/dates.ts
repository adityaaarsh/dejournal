/**
 * Date helpers. Date-based records use local 'YYYY-MM-DD' strings. Convert to a
 * Date only with `parseDate` (local midnight) — never `new Date('YYYY-MM-DD')`,
 * which is parsed as UTC and can land on the previous day.
 */
import {
  addDays as dfAddDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import type { ISODate } from '@/db/types'

export type WeekStart = 0 | 1

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false
  const d = parseDate(s)
  return isValid(d) && toISODate(d) === s
}

/** Local date string for a Date (defaults to now). */
export function toISODate(d: Date = new Date()): ISODate {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function today(): ISODate {
  return toISODate(new Date())
}

/** Parse 'YYYY-MM-DD' as local midnight. */
export function parseDate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function addDays(date: ISODate, n: number): ISODate {
  return toISODate(dfAddDays(parseDate(date), n))
}

/** a - b in calendar days. */
export function diffDays(a: ISODate, b: ISODate): number {
  return differenceInCalendarDays(parseDate(a), parseDate(b))
}

export function weekday(date: ISODate): number {
  return parseDate(date).getDay()
}

export function monthKey(date: ISODate): string {
  return date.slice(0, 7)
}

export function currentMonth(): string {
  return monthKey(today())
}

export function monthStart(month: string): ISODate {
  return `${month}-01`
}

export function monthEnd(month: string): ISODate {
  return toISODate(endOfMonth(parseDate(monthStart(month))))
}

export function addMonthsKey(month: string, n: number): string {
  return monthKey(toISODate(addMonths(parseDate(monthStart(month)), n)))
}

export function daysInMonth(month: string): number {
  return Number(monthEnd(month).slice(8, 10))
}

/** Inclusive list of dates from start to end. */
export function dateRange(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = []
  let d = start
  let guard = 0
  while (d <= end && guard++ < 4000) {
    out.push(d)
    d = addDays(d, 1)
  }
  return out
}

export function weekRange(date: ISODate, weekStartsOn: WeekStart): [ISODate, ISODate] {
  const d = parseDate(date)
  return [toISODate(startOfWeek(d, { weekStartsOn })), toISODate(endOfWeek(d, { weekStartsOn }))]
}

/** Full weeks of dates covering a month view. */
export function monthGrid(month: string, weekStartsOn: WeekStart): ISODate[] {
  const first = startOfWeek(startOfMonth(parseDate(monthStart(month))), { weekStartsOn })
  const last = endOfWeek(endOfMonth(parseDate(monthStart(month))), { weekStartsOn })
  return dateRange(toISODate(first), toISODate(last))
}

export function formatDate(date: ISODate, pattern = 'EEE, d MMM'): string {
  return format(parseDate(date), pattern)
}

export function formatMonth(month: string, pattern = 'MMMM yyyy'): string {
  return format(parseDate(monthStart(month)), pattern)
}

/** "Today", "Yesterday", "Tomorrow" or the formatted date. */
export function relativeDayLabel(date: ISODate, pattern = 'EEE, d MMM'): string {
  const d = diffDays(date, today())
  if (d === 0) return 'Today'
  if (d === -1) return 'Yesterday'
  if (d === 1) return 'Tomorrow'
  return formatDate(date, pattern)
}

export function weekdayLabels(weekStartsOn: WeekStart, style: 'short' | 'narrow' = 'short'): string[] {
  const base = style === 'short' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  return weekStartsOn === 1 ? [...base.slice(1), base[0]] : base
}

/** Combine a local date and 'HH:mm' into a Date. */
export function atTime(date: ISODate, time: string): Date {
  const d = parseDate(date)
  const [h, m] = time.split(':').map(Number)
  d.setHours(h || 0, m || 0, 0, 0)
  return d
}

export function formatTime(time: string | null | undefined): string {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  return format(new Date(2000, 0, 1, h, m), 'h:mm a')
}

export function nowHHmm(): string {
  return format(new Date(), 'HH:mm')
}

/** Local date of a UTC ISO timestamp. */
export function isoToLocalDate(iso: string): ISODate {
  return toISODate(new Date(iso))
}

/** Local 'HH:mm' of a UTC ISO timestamp. */
export function isoToLocalTime(iso: string): string {
  return format(new Date(iso), 'HH:mm')
}
