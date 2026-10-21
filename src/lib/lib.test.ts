import { describe, expect, it } from 'vitest'
import { addDays, dateRange, diffDays, isISODate, monthEnd, monthGrid, parseDate, toISODate, addMonthsKey } from './dates'
import { formatMoney, parseAmount, amountInputValue } from './money'
import { occursOn, describeRecurrence } from './recurrence'
import { formatClock, formatDuration } from './duration'
import { matchesQuery, normalize, parseTags, snippet } from './text'
import { elapsedMs } from '@/db/timers'
import type { ActiveTimer } from '@/db/types'

describe('dates', () => {
  it('parses local dates without timezone shift', () => {
    const d = parseDate('2026-10-22')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(9)
    expect(d.getDate()).toBe(22)
    expect(toISODate(d)).toBe('2026-10-22')
  })
  it('validates ISO dates', () => {
    expect(isISODate('2026-02-28')).toBe(true)
    expect(isISODate('2026-02-30')).toBe(false)
    expect(isISODate('2026-2-3')).toBe(false)
    expect(isISODate(undefined)).toBe(false)
  })
  it('does date arithmetic across month and DST boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
    expect(diffDays('2026-11-01', '2026-10-30')).toBe(2)
    expect(dateRange('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
    expect(monthEnd('2028-02')).toBe('2028-02-29')
    expect(addMonthsKey('2026-12', 1)).toBe('2027-01')
  })
  it('builds full-week month grids', () => {
    const g = monthGrid('2026-10', 1)
    expect(g.length % 7).toBe(0)
    expect(g[0]).toBe('2026-09-28') // Monday
    expect(g).toContain('2026-10-31')
  })
})

describe('money', () => {
  it('parses amounts into minor units', () => {
    expect(parseAmount('340')).toBe(34000)
    expect(parseAmount('12.5')).toBe(1250)
    expect(parseAmount('1,299.99')).toBe(129999)
    expect(parseAmount('₹ 50')).toBe(5000)
    expect(parseAmount('0.1')).toBe(10)
  })
  it('rejects invalid amounts', () => {
    for (const bad of ['', '0', '-5', 'abc', '1.234', 'Infinity', '1e5', '.']) expect(parseAmount(bad)).toBeNull()
    expect(parseAmount('5.5', 'JPY')).toBeNull()
    expect(parseAmount('500', 'JPY')).toBe(500)
  })
  it('formats money', () => {
    expect(formatMoney(34000, 'INR')).toBe('₹340')
    expect(formatMoney(129950, 'INR')).toBe('₹1,299.50')
    expect(formatMoney(10000000, 'INR')).toBe('₹1,00,000')
    expect(amountInputValue(1250)).toBe('12.50')
  })
})

describe('recurrence', () => {
  it('daily with interval', () => {
    const r = { type: 'daily' as const, interval: 2 }
    expect(occursOn(r, '2026-10-01', '2026-10-01')).toBe(true)
    expect(occursOn(r, '2026-10-01', '2026-10-02')).toBe(false)
    expect(occursOn(r, '2026-10-01', '2026-10-03')).toBe(true)
    expect(occursOn(r, '2026-10-01', '2026-09-30')).toBe(false)
  })
  it('weekly and selected days', () => {
    expect(occursOn({ type: 'weekly' }, '2026-10-22', '2026-10-29')).toBe(true)
    expect(occursOn({ type: 'weekly' }, '2026-10-22', '2026-10-28')).toBe(false)
    const weekdays = { type: 'days' as const, days: [1, 2, 3, 4, 5] }
    expect(occursOn(weekdays, '2026-10-01', '2026-10-24')).toBe(false) // Saturday
    expect(occursOn(weekdays, '2026-10-01', '2026-10-26')).toBe(true) // Monday
    expect(describeRecurrence(weekdays)).toBe('Weekdays')
  })
  it('respects end date', () => {
    expect(occursOn({ type: 'daily' }, '2026-10-01', '2026-10-10', '2026-10-05')).toBe(false)
  })
})

describe('duration & text', () => {
  it('formats durations', () => {
    expect(formatDuration(4800)).toBe('1h 20m')
    expect(formatDuration(2700)).toBe('45m')
    expect(formatDuration(3600)).toBe('1h')
    expect(formatClock(65_000)).toBe('01:05')
    expect(formatClock(3_725_000)).toBe('1:02:05')
  })
  it('matches queries forgivingly and safely', () => {
    expect(normalize('Café ÉTUDE')).toBe('cafe etude')
    expect(matchesQuery('Pay electricity bill', 'ELEC bill')).toBe(true)
    expect(matchesQuery('Pay electricity bill', 'water')).toBe(false)
    expect(matchesQuery('cost (approx) [x]', '(approx')).toBe(true)
    expect(matchesQuery('anything', '   ')).toBe(false)
    expect(snippet('a'.repeat(100) + ' needle ' + 'b'.repeat(100), 'needle')).toContain('needle')
    expect(parseTags('Study, dsa #Exam, study')).toEqual(['study', 'dsa', 'exam'])
  })
})

describe('timer elapsed', () => {
  const base: ActiveTimer = {
    id: 't',
    kind: 'study',
    startedAt: '2026-10-22T10:00:00.000Z',
    accumulatedMs: 0,
    runningSince: '2026-10-22T10:00:00.000Z',
    date: '2026-10-22',
  }
  it('counts running time from timestamps', () => {
    expect(elapsedMs(base, Date.parse('2026-10-22T10:30:00.000Z'))).toBe(30 * 60_000)
  })
  it('excludes paused time', () => {
    const paused = { ...base, accumulatedMs: 10 * 60_000, runningSince: null }
    expect(elapsedMs(paused, Date.parse('2026-10-22T12:00:00.000Z'))).toBe(10 * 60_000)
    const resumed = { ...paused, runningSince: '2026-10-22T11:00:00.000Z' }
    expect(elapsedMs(resumed, Date.parse('2026-10-22T11:05:00.000Z'))).toBe(15 * 60_000)
  })
})
