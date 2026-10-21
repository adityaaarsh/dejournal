import type { ISODate, Recurrence } from '@/db/types'
import { diffDays, weekday } from './dates'

/** Does a recurring rule starting on `start` produce an occurrence on `date`? */
export function occursOn(rule: Recurrence, start: ISODate, date: ISODate, end?: ISODate | null): boolean {
  if (date < start) return false
  if (end && date > end) return false
  const interval = Math.max(1, Math.floor(rule.interval ?? 1))
  const delta = diffDays(date, start)
  switch (rule.type) {
    case 'daily':
      return delta % interval === 0
    case 'weekly':
      return delta % (7 * interval) === 0
    case 'days': {
      const days = rule.days && rule.days.length ? rule.days : [weekday(start)]
      if (!days.includes(weekday(date))) return false
      if (interval === 1) return true
      return Math.floor(delta / 7) % interval === 0
    }
  }
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function describeRecurrence(rule: Recurrence | null | undefined, start?: ISODate): string {
  if (!rule) return 'Does not repeat'
  const n = Math.max(1, rule.interval ?? 1)
  switch (rule.type) {
    case 'daily':
      return n === 1 ? 'Every day' : `Every ${n} days`
    case 'weekly': {
      const wd = start ? DAY_NAMES[weekday(start)] : ''
      return n === 1 ? `Every week${wd ? ` on ${wd}` : ''}` : `Every ${n} weeks${wd ? ` on ${wd}` : ''}`
    }
    case 'days': {
      const days = (rule.days ?? []).slice().sort()
      if (days.length === 7) return 'Every day'
      if (days.join() === '1,2,3,4,5') return 'Weekdays'
      if (days.join() === '0,6') return 'Weekends'
      return days.map((d) => DAY_NAMES[d]).join(', ') || 'Selected days'
    }
  }
}
