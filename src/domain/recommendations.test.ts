import { describe, expect, it } from 'vitest'
import { recommend, type RecContext } from './recommendations'
import type { RecommendationFeedback } from '@/db/types'

const base = (over: Partial<RecContext> = {}): RecContext => ({
  date: '2026-10-22',
  yesterday: { rating: null, tasksTotal: 0, tasksDone: 0, studySec: 0 },
  studyGoalSec: 0,
  routinesMissedYesterday: [],
  incompleteToday: 0,
  overdueCount: 0,
  feedback: [],
  hasAnyHistory: true,
  ...over,
})

const fb = (ruleId: string, action: RecommendationFeedback['action'], date = '2026-10-22'): RecommendationFeedback => ({
  id: Math.random().toString(),
  ruleId,
  action,
  date,
  createdAt: '2026-10-22T08:00:00Z',
})

describe('recommend', () => {
  it('returns a neutral planning prompt with no history and empty day', () => {
    const r = recommend(base({ hasAnyHistory: false }))
    expect(r?.ruleId).toBe('plan-day')
    expect(r?.message).not.toMatch(/yesterday/i)
  })

  it('returns nothing when there is history but nothing noteworthy', () => {
    expect(recommend(base())).toBeNull()
  })

  it('does not invent a rating in the message', () => {
    const r = recommend(base({ yesterday: { rating: null, tasksTotal: 4, tasksDone: 1, studySec: 0 } }))
    expect(r?.ruleId).toBe('low-completion')
    expect(r?.message).not.toMatch(/\/5/)
    expect(r?.message).toContain('3 of 4')
  })

  it('prefers gentle low-rating advice and mentions the rating', () => {
    const r = recommend(base({ yesterday: { rating: 2, tasksTotal: 4, tasksDone: 1, studySec: 0 } }))
    expect(r?.ruleId).toBe('low-rating')
    expect(r?.message).toContain('Yesterday was a 2/5')
  })

  it('suggests a manageable study session when goal was missed', () => {
    const r = recommend(base({ studyGoalSec: 3600, yesterday: { rating: null, tasksTotal: 0, tasksDone: 0, studySec: 1200 } }))
    expect(r?.ruleId).toBe('missed-study-goal')
    expect(r?.message).toContain('20 min of your 1h goal')
    expect(r?.action?.kind).toBe('study')
  })

  it('does not nag about study when no goal is set', () => {
    expect(recommend(base({ studyGoalSec: 0 }))).toBeNull()
  })

  it('gives a neutral routine reminder', () => {
    const r = recommend(base({ routinesMissedYesterday: ['Drink 2L water'] }))
    expect(r?.ruleId).toBe('missed-routine')
    expect(r?.message).toContain('"Drink 2L water"')
  })

  it('hides a rule dismissed today and falls back to the next one', () => {
    const ctx = base({
      yesterday: { rating: 2, tasksTotal: 4, tasksDone: 1, studySec: 0 },
      feedback: [fb('low-rating', 'dismissed')],
    })
    expect(recommend(ctx)?.ruleId).toBe('low-completion')
  })

  it('deprioritizes rules marked unhelpful recently', () => {
    const ctx = base({
      studyGoalSec: 3600,
      routinesMissedYesterday: ['Walk'],
      yesterday: { rating: null, tasksTotal: 0, tasksDone: 0, studySec: 0 },
      feedback: [fb('missed-study-goal', 'unhelpful', '2026-10-20')],
    })
    expect(recommend(ctx)?.ruleId).toBe('missed-routine')
  })

  it('ignores very old feedback', () => {
    const ctx = base({
      studyGoalSec: 3600,
      routinesMissedYesterday: ['Walk'],
      feedback: [fb('missed-study-goal', 'unhelpful', '2026-08-01')],
    })
    expect(recommend(ctx)?.ruleId).toBe('missed-study-goal')
  })
})
