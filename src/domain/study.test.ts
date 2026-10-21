import { describe, expect, it } from 'vitest'
import type { StudySession } from '@/db/types'
import {
  consistency,
  describeChange,
  findOverlaps,
  goalDaysMet,
  percentChange,
  previousPeriod,
  secondsByDay,
  secondsBySubject,
  totalSeconds,
} from './study'

let n = 0
function s(date: string, durationSec: number, extra: Partial<StudySession> = {}): StudySession {
  return {
    id: `s${n++}`,
    date,
    durationSec,
    tags: [],
    source: 'manual',
    createdAt: '',
    updatedAt: '',
    ...extra,
  }
}

describe('study analytics', () => {
  const sessions = [
    s('2026-10-20', 1800, { subjectId: 'dsa' }),
    s('2026-10-20', 1200, { subjectId: 'math' }),
    s('2026-10-21', 3600, { subjectId: 'dsa' }),
    s('2026-10-25', 600),
  ]

  it('totals by day within range including empty days', () => {
    const byDay = secondsByDay(sessions, '2026-10-19', '2026-10-21')
    expect(byDay).toEqual({ '2026-10-19': 0, '2026-10-20': 3000, '2026-10-21': 3600 })
  })

  it('total seconds respects range', () => {
    expect(totalSeconds(sessions)).toBe(7200)
    expect(totalSeconds(sessions, '2026-10-21', '2026-10-31')).toBe(4200)
  })

  it('groups by subject, null subject as empty key', () => {
    const by = secondsBySubject(sessions)
    expect(by[0]).toEqual({ subjectId: 'dsa', seconds: 5400, count: 2 })
    expect(by.find((x) => x.subjectId === '')?.seconds).toBe(600)
  })

  it('previous period has equal length', () => {
    expect(previousPeriod({ start: '2026-10-19', end: '2026-10-25' })).toEqual({ start: '2026-10-12', end: '2026-10-18' })
    expect(previousPeriod({ start: '2026-03-01', end: '2026-03-31' })).toEqual({ start: '2026-01-29', end: '2026-02-28' })
  })

  it('percent change handles zero baseline', () => {
    expect(percentChange(120, 100)).toBe(20)
    expect(percentChange(50, 0)).toBeNull()
    expect(describeChange(50, 0, 'last week')).toBe('Nothing recorded last week')
    expect(describeChange(0, 0, 'last week')).toMatch(/No activity/)
    expect(describeChange(80, 100, 'last week')).toBe('-20% vs last week')
  })

  it('consistency counts only elapsed days', () => {
    const c = consistency(sessions, { start: '2026-10-19', end: '2026-10-25' }, '2026-10-22')
    expect(c).toEqual({ studied: 2, elapsed: 4 })
  })

  it('goal days met uses saved totals', () => {
    expect(goalDaysMet(sessions, { start: '2026-10-19', end: '2026-10-25' }, 50, '2026-10-22')).toBe(2)
    expect(goalDaysMet(sessions, { start: '2026-10-19', end: '2026-10-25' }, 0, '2026-10-22')).toBe(0)
  })

  it('detects overlapping timed sessions', () => {
    const existing = [
      s('2026-10-22', 3600, { id: 'a', startedAt: '2026-10-22T09:00:00.000Z', endedAt: '2026-10-22T10:00:00.000Z' }),
      s('2026-10-22', 1800), // untimed manual session — never overlaps
    ]
    expect(findOverlaps({ startedAt: '2026-10-22T09:30:00.000Z', endedAt: '2026-10-22T11:00:00.000Z' }, existing)).toHaveLength(1)
    expect(findOverlaps({ startedAt: '2026-10-22T10:00:00.000Z', endedAt: '2026-10-22T11:00:00.000Z' }, existing)).toHaveLength(0)
    expect(findOverlaps({ startedAt: '2026-10-22T09:30:00.000Z', endedAt: '2026-10-22T09:45:00.000Z' }, existing, 'a')).toHaveLength(0)
  })
})
