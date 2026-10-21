import { describe, expect, it } from 'vitest'
import { compareWithPrevious, computeMonthRecap, type RecapData } from './recap'
import type { Task } from '@/db/types'

const ts = '2026-09-01T06:00:00.000Z'
const base = { createdAt: ts, updatedAt: ts }
const task = (id: string, date: string, completed: boolean): Task => ({ ...base, id, title: id, date, completed, priority: 'normal', tags: [], order: 0 })
const settings = { studyGoalDailyMin: 60, currency: 'INR' }

const data: RecapData = {
  tasks: [task('a', '2026-10-01', true), task('b', '2026-10-01', true), task('c', '2026-10-02', false), task('d', '2026-10-25', false)],
  days: [
    { date: '2026-10-01', rating: 4, updatedAt: ts },
    { date: '2026-10-03', rating: 2, updatedAt: ts },
    { date: '2026-10-04', rating: null, reflection: { wentWell: 'Walked' }, updatedAt: ts },
  ],
  studySessions: [
    { ...base, id: 's1', subjectId: 'm', date: '2026-10-01', durationSec: 3600, tags: [], source: 'manual' },
    { ...base, id: 's2', subjectId: 'm', date: '2026-10-02', durationSec: 1800, tags: [], source: 'manual' },
    { ...base, id: 's3', subjectId: null, date: '2026-09-02', durationSec: 600, tags: [], source: 'manual' },
  ],
  subjects: [{ id: 'm', name: 'Maths', color: '#000', archived: false, createdAt: ts }],
  expenses: [
    { ...base, id: 'x1', amount: 34000, currency: 'INR', description: 'Lunch', date: '2026-10-02', categoryId: 'food' },
    { ...base, id: 'x2', amount: 10050, currency: 'INR', description: 'Bus', date: '2026-10-02', categoryId: 'transport' },
    { ...base, id: 'x3', amount: 500, currency: 'USD', description: 'App', date: '2026-10-03', categoryId: 'other' },
    { ...base, id: 'x4', amount: 20000, currency: 'INR', description: 'Book', date: '2026-09-01', categoryId: 'education' },
    { ...base, id: 'x5', amount: 99900, currency: 'INR', description: 'Late Sept', date: '2026-09-20', categoryId: 'shopping' },
  ],
  categories: [
    { id: 'food', name: 'Food', icon: '', builtin: true, order: 0 },
    { id: 'transport', name: 'Transport', icon: '', builtin: true, order: 1 },
  ],
}

describe('computeMonthRecap', () => {
  const r = computeMonthRecap('2026-10', data, settings, { today: '2026-10-04' })

  it('uses elapsed days for the current month', () => {
    expect(r.isCurrent).toBe(true)
    expect(r.elapsedDays).toBe(4)
    expect(r.end).toBe('2026-10-04')
  })

  it('counts only recorded ratings', () => {
    expect(r.daily.ratedDays).toBe(2)
    expect(r.daily.avgRating).toBe(3)
    expect(r.daily.bestDay).toEqual({ date: '2026-10-01', rating: 4 })
    expect(r.daily.ratingByDate['2026-10-02']).toBeNull()
    expect(r.daily.reflections).toBe(1)
  })

  it('excludes future tasks beyond today and computes completion', () => {
    expect(r.tasks.scheduled).toBe(3)
    expect(r.tasks.completed).toBe(2)
    expect(r.tasks.completionRate).toBeCloseTo(2 / 3)
    expect(r.tasks.mostActiveDays[0]).toEqual({ date: '2026-10-01', completed: 2 })
  })

  it('computes study totals and goal days', () => {
    expect(r.study.totalSec).toBe(5400)
    expect(r.study.studyDays).toBe(2)
    expect(r.study.avgPerStudyDaySec).toBe(2700)
    expect(r.study.avgPerElapsedDaySec).toBe(1350)
    expect(r.study.goalDaysMet).toBe(1)
    expect(r.study.topSubjects[0]).toMatchObject({ name: 'Maths', sec: 5400 })
  })

  it('totals expenses in the main currency only', () => {
    expect(r.expenses.total).toBe(44050)
    expect(r.expenses.otherCurrencyCount).toBe(1)
    expect(r.expenses.highestDay).toEqual({ date: '2026-10-02', amount: 44050 })
    expect(r.expenses.byCategory.map((c) => c.name)).toEqual(['Food', 'Transport'])
  })

  it('counts active days from recorded activity only', () => {
    // 1st: rating, tasks, study; 2nd: study, expenses; 3rd: rating, usd expense; 4th: reflection
    expect(r.daily.activeDays).toBe(4)
    expect(r.consistency.longestRun).toBe(4)
    expect(r.activityByDate['2026-10-25']).toBeUndefined()
  })

  it('returns nulls rather than zeros for missing data', () => {
    const empty = computeMonthRecap('2026-08', {}, settings, { today: '2026-10-04' })
    expect(empty.empty).toBe(true)
    expect(empty.daily.avgRating).toBeNull()
    expect(empty.tasks.completionRate).toBeNull()
    expect(empty.study.avgPerStudyDaySec).toBeNull()
    const noGoal = computeMonthRecap('2026-10', data, { ...settings, studyGoalDailyMin: 0 }, { today: '2026-10-04' })
    expect(noGoal.study.goalDaysMet).toBeNull()
  })

  it('treats future months as having no elapsed days', () => {
    const f = computeMonthRecap('2026-12', data, settings, { today: '2026-10-04' })
    expect(f.isFuture).toBe(true)
    expect(f.elapsedDays).toBe(0)
  })
})

describe('compareWithPrevious', () => {
  it('compares the same number of days for an incomplete month', () => {
    const r = computeMonthRecap('2026-10', data, settings, { today: '2026-10-04' })
    const c = compareWithPrevious(r, data, settings, { today: '2026-10-04' })
    expect(c.partial).toBe(true)
    expect(c.comparedDays).toBe(4)
    // Sept 1–4 only: book (20000), not late-Sept shopping.
    expect(c.spending).toEqual({ current: 44050, previous: 20000, delta: 24050 })
    expect(c.studySec.previous).toBe(600)
    expect(c.avgRating.previous).toBeNull()
    expect(c.avgRating.delta).toBeNull()
  })

  it('marks the previous month empty when nothing was recorded', () => {
    const r = computeMonthRecap('2026-09', data, settings, { today: '2026-10-04' })
    const c = compareWithPrevious(r, data, settings, { today: '2026-10-04' })
    expect(c.partial).toBe(false)
    expect(c.previousEmpty).toBe(true)
    expect(c.spending.delta).toBeNull()
  })
})
