/**
 * Minimal iCalendar (RFC 5545) parser for importing events.
 *
 * Supports: line unfolding, VEVENT, SUMMARY / DESCRIPTION / LOCATION / UID,
 * DTSTART / DTEND / DURATION (all-day VALUE=DATE, UTC "Z" times converted to
 * local time, TZID and floating times treated as local wall-clock), text
 * unescaping, RRULE (DAILY / WEEKLY+BYDAY / MONTHLY+BYMONTHDAY|BYDAY /
 * YEARLY with INTERVAL, COUNT, UNTIL), EXDATE and RECURRENCE-ID overrides.
 *
 * Recurring events are expanded only inside a window (default −1y..+1y) and
 * capped at `maxOccurrences` per event.
 */
import type { ISODate } from '@/db/types'
import { addDays, diffDays, parseDate, toISODate, today, weekday } from './dates'

export interface IcsEvent {
  uid: string
  /** Unique per occurrence: uid, or uid:date for recurring occurrences. */
  externalId: string
  title: string
  description?: string
  location?: string
  date: ISODate
  endDate?: ISODate | null
  allDay: boolean
  startTime?: string | null
  endTime?: string | null
}

export interface IcsParseResult {
  calendarName?: string
  events: IcsEvent[]
  /** Number of VEVENT blocks found (before expansion). */
  sourceCount: number
  skipped: number
}

interface Prop {
  name: string
  params: Record<string, string>
  value: string
}

interface DateValue {
  date: ISODate
  time: string | null // HH:mm, null for all-day
}

export function unfold(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
    .filter((l) => l.length > 0)
}

export function parseLine(line: string): Prop | null {
  // Find the first ':' that is not inside a quoted parameter value.
  let inQuote = false
  let idx = -1
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') inQuote = !inQuote
    else if (c === ':' && !inQuote) {
      idx = i
      break
    }
  }
  if (idx < 0) return null
  const head = line.slice(0, idx)
  const value = line.slice(idx + 1)
  const parts = head.split(';')
  const name = parts[0].toUpperCase()
  const params: Record<string, string> = {}
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=')
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name, params, value }
}

export function unescapeText(s: string): string {
  return s.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c))
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Parse a DATE or DATE-TIME value into local date + time. */
export function parseDateValue(value: string, params: Record<string, string> = {}): DateValue | null {
  const v = value.trim()
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v)
  if (dateOnly || params.VALUE === 'DATE') {
    const m = dateOnly ?? /^(\d{4})(\d{2})(\d{2})/.exec(v)
    if (!m) return null
    return { date: `${m[1]}-${m[2]}-${m[3]}`, time: null }
  }
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v)
  if (!dt) return null
  const [, y, mo, d, h, mi, s = '00', z] = dt
  if (z) {
    const local = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
    return { date: toISODate(local), time: `${pad(local.getHours())}:${pad(local.getMinutes())}` }
  }
  // TZID or floating: keep wall-clock time as local.
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` }
}

/** Parse an ISO 8601 duration (P1DT2H, PT30M, P1W) into minutes. */
export function parseDuration(v: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim())
  if (!m) return null
  const [, sign, w, d, h, mi, s] = m
  const total = (+(w ?? 0) * 7 + +(d ?? 0)) * 1440 + +(h ?? 0) * 60 + +(mi ?? 0) + Math.floor(+(s ?? 0) / 60)
  return sign === '-' ? -total : total
}

function addMinutes(dv: DateValue, minutes: number): DateValue {
  const [h, m] = (dv.time ?? '00:00').split(':').map(Number)
  const base = parseDate(dv.date)
  base.setHours(h, m + minutes, 0, 0)
  return { date: toISODate(base), time: `${pad(base.getHours())}:${pad(base.getMinutes())}` }
}

/* ------------------------------------------------------------------ */
/* RRULE                                                               */
/* ------------------------------------------------------------------ */

const DAY_CODES: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

interface RRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  count?: number
  until?: ISODate
  byDay?: Array<{ n: number; day: number }> // n = 0 means every
  byMonthDay?: number[]
  wkst: number
}

export function parseRRule(value: string): RRule | null {
  const parts: Record<string, string> = {}
  for (const kv of value.split(';')) {
    const [k, v] = kv.split('=')
    if (k && v) parts[k.toUpperCase()] = v
  }
  const freq = parts.FREQ as RRule['freq']
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null
  const rule: RRule = { freq, interval: Math.max(1, parseInt(parts.INTERVAL ?? '1', 10) || 1), wkst: DAY_CODES[parts.WKST ?? 'MO'] ?? 1 }
  if (parts.COUNT) rule.count = Math.max(1, parseInt(parts.COUNT, 10))
  if (parts.UNTIL) rule.until = parseDateValue(parts.UNTIL)?.date
  if (parts.BYDAY) {
    rule.byDay = parts.BYDAY.split(',')
      .map((t) => /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(t.trim()))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => ({ n: m[1] ? parseInt(m[1], 10) : 0, day: DAY_CODES[m[2]] }))
  }
  if (parts.BYMONTHDAY) rule.byMonthDay = parts.BYMONTHDAY.split(',').map((n) => parseInt(n, 10)).filter((n) => !isNaN(n))
  return rule
}

function weekStartOf(date: ISODate, wkst: number): ISODate {
  const wd = weekday(date)
  return addDays(date, -((wd - wkst + 7) % 7))
}

function monthIndex(date: ISODate): number {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1
}

function daysInMonthOf(date: ISODate): number {
  const y = Number(date.slice(0, 4))
  const m = Number(date.slice(5, 7))
  return new Date(y, m, 0).getDate()
}

/** Is `date` the nth (1-based, negative from end) weekday `day` of its month? */
function isNthWeekday(date: ISODate, n: number, day: number): boolean {
  if (weekday(date) !== day) return false
  if (n === 0) return true
  const dom = Number(date.slice(8, 10))
  if (n > 0) return Math.ceil(dom / 7) === n
  const fromEnd = Math.floor((daysInMonthOf(date) - dom) / 7) + 1
  return fromEnd === -n
}

function matchesRule(rule: RRule, start: ISODate, date: ISODate): boolean {
  switch (rule.freq) {
    case 'DAILY':
      return diffDays(date, start) % rule.interval === 0
    case 'WEEKLY': {
      const weeks = Math.round(diffDays(weekStartOf(date, rule.wkst), weekStartOf(start, rule.wkst)) / 7)
      if (weeks % rule.interval !== 0) return false
      const days = rule.byDay?.length ? rule.byDay.map((b) => b.day) : [weekday(start)]
      return days.includes(weekday(date))
    }
    case 'MONTHLY': {
      if ((monthIndex(date) - monthIndex(start)) % rule.interval !== 0) return false
      const dom = Number(date.slice(8, 10))
      if (rule.byMonthDay?.length) {
        const dim = daysInMonthOf(date)
        return rule.byMonthDay.some((n) => (n > 0 ? n === dom : dim + n + 1 === dom))
      }
      if (rule.byDay?.length) return rule.byDay.some((b) => isNthWeekday(date, b.n, b.day))
      return dom === Number(start.slice(8, 10))
    }
    case 'YEARLY': {
      const years = Number(date.slice(0, 4)) - Number(start.slice(0, 4))
      if (years % rule.interval !== 0) return false
      return date.slice(5) === start.slice(5)
    }
  }
}

/** Expand occurrence start dates of a rule inside [windowStart, windowEnd]. */
export function expandRule(
  rule: RRule,
  start: ISODate,
  windowStart: ISODate,
  windowEnd: ISODate,
  maxOccurrences = 500,
): ISODate[] {
  const out: ISODate[] = []
  const hardEnd = rule.until && rule.until < windowEnd ? rule.until : windowEnd
  let d = start
  let seen = 0
  let guard = 0
  while (d <= hardEnd && guard++ < 40000) {
    if (matchesRule(rule, start, d)) {
      seen++
      if (rule.count && seen > rule.count) break
      if (d >= windowStart) {
        out.push(d)
        if (out.length >= maxOccurrences) break
      }
    }
    d = addDays(d, 1)
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Parse                                                               */
/* ------------------------------------------------------------------ */

interface RawEvent {
  props: Prop[]
}

function first(ev: RawEvent, name: string): Prop | undefined {
  return ev.props.find((p) => p.name === name)
}

export function parseIcs(
  text: string,
  opts: { windowStart?: ISODate; windowEnd?: ISODate; maxOccurrences?: number } = {},
): IcsParseResult {
  const windowStart = opts.windowStart ?? addDays(today(), -366)
  const windowEnd = opts.windowEnd ?? addDays(today(), 366)
  const max = opts.maxOccurrences ?? 500

  const lines = unfold(text)
  if (!lines.some((l) => l.toUpperCase().startsWith('BEGIN:VCALENDAR'))) {
    throw new Error('This file does not look like an iCalendar (.ics) file.')
  }

  let calendarName: string | undefined
  const raw: RawEvent[] = []
  let cur: RawEvent | null = null
  let depth = 0 // nested components inside VEVENT (e.g. VALARM)
  for (const line of lines) {
    const p = parseLine(line)
    if (!p) continue
    if (p.name === 'BEGIN') {
      if (p.value.toUpperCase() === 'VEVENT' && !cur) cur = { props: [] }
      else if (cur) depth++
      continue
    }
    if (p.name === 'END') {
      if (cur && depth > 0) depth--
      else if (cur && p.value.toUpperCase() === 'VEVENT') {
        raw.push(cur)
        cur = null
      }
      continue
    }
    if (cur && depth === 0) cur.props.push(p)
    else if (!cur && p.name === 'X-WR-CALNAME') calendarName = unescapeText(p.value).trim()
  }

  const events: IcsEvent[] = []
  let skipped = 0

  // RECURRENCE-ID overrides: uid -> set of overridden occurrence dates
  const overrides = new Map<string, Set<ISODate>>()
  for (const ev of raw) {
    const rid = first(ev, 'RECURRENCE-ID')
    const uid = first(ev, 'UID')?.value
    if (rid && uid) {
      const dv = parseDateValue(rid.value, rid.params)
      if (dv) {
        if (!overrides.has(uid)) overrides.set(uid, new Set())
        overrides.get(uid)!.add(dv.date)
      }
    }
  }

  for (const ev of raw) {
    const dtstart = first(ev, 'DTSTART')
    const start = dtstart ? parseDateValue(dtstart.value, dtstart.params) : null
    if (!start) {
      skipped++
      continue
    }
    const status = first(ev, 'STATUS')?.value.toUpperCase()
    if (status === 'CANCELLED') {
      skipped++
      continue
    }
    const uidRaw = first(ev, 'UID')?.value.trim()
    const title = unescapeText(first(ev, 'SUMMARY')?.value ?? '').trim() || '(No title)'
    const description = unescapeText(first(ev, 'DESCRIPTION')?.value ?? '').trim() || undefined
    const location = unescapeText(first(ev, 'LOCATION')?.value ?? '').trim() || undefined
    const uid = uidRaw || `${start.date}-${start.time ?? 'allday'}-${title}`
    const allDay = start.time === null

    // End
    let end: DateValue | null = null
    const dtend = first(ev, 'DTEND')
    const duration = first(ev, 'DURATION')
    if (dtend) end = parseDateValue(dtend.value, dtend.params)
    else if (duration) {
      const mins = parseDuration(duration.value)
      if (mins !== null) end = allDay ? { date: addDays(start.date, Math.round(mins / 1440)), time: null } : addMinutes(start, mins)
    }

    // Span in days (for occurrences) and end time.
    let spanDays = 0
    let endTime: string | null = null
    if (end) {
      if (allDay) {
        // DTEND is exclusive for all-day events.
        spanDays = Math.max(0, diffDays(end.date, start.date) - 1)
      } else {
        spanDays = Math.max(0, diffDays(end.date, start.date))
        endTime = end.time
        if (spanDays === 0 && endTime && start.time && endTime <= start.time) endTime = null
      }
    }

    const make = (date: ISODate, externalId: string): IcsEvent => ({
      uid,
      externalId,
      title,
      description,
      location,
      date,
      endDate: spanDays > 0 ? addDays(date, spanDays) : null,
      allDay,
      startTime: allDay ? null : start.time,
      endTime: allDay ? null : endTime,
    })

    const rid = first(ev, 'RECURRENCE-ID')
    const rruleProp = first(ev, 'RRULE')
    if (rid) {
      // An override replaces one occurrence of the series.
      const ridDate = parseDateValue(rid.value, rid.params)?.date ?? start.date
      events.push(make(start.date, `${uid}:${ridDate}`))
      continue
    }
    if (rruleProp) {
      const rule = parseRRule(rruleProp.value)
      if (!rule) {
        events.push(make(start.date, uid))
        continue
      }
      const exdates = new Set<ISODate>()
      for (const p of ev.props.filter((x) => x.name === 'EXDATE')) {
        for (const v of p.value.split(',')) {
          const dv = parseDateValue(v, p.params)
          if (dv) exdates.add(dv.date)
        }
      }
      const overridden = overrides.get(uid)
      for (const d of expandRule(rule, start.date, windowStart, windowEnd, max)) {
        if (exdates.has(d) || overridden?.has(d)) continue
        events.push(make(d, `${uid}:${d}`))
      }
      continue
    }
    events.push(make(start.date, uid))
  }

  return { calendarName, events, sourceCount: raw.length, skipped }
}
