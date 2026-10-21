import { describe, expect, it } from 'vitest'
import { formatPercent, overdueTasks, statsByDate, taskStats } from './taskStats'
import type { Task } from '@/db/types'

const t = (date: string, completed: boolean): Task => ({
  id: Math.random().toString(),
  title: 'x',
  date,
  completed,
  priority: 'normal',
  tags: [],
  order: 0,
  createdAt: '',
  updatedAt: '',
})

describe('taskStats', () => {
  it('returns null percent when no tasks', () => {
    const s = taskStats([])
    expect(s.percent).toBeNull()
    expect(formatPercent(s.percent)).toBe('—')
  })

  it('computes completion', () => {
    const s = taskStats([t('2026-10-22', true), t('2026-10-22', false), t('2026-10-22', true)])
    expect(s).toEqual({ total: 3, done: 2, open: 1, percent: 67 })
  })

  it('finds overdue tasks', () => {
    const list = [t('2026-10-20', false), t('2026-10-20', true), t('2026-10-22', false)]
    expect(overdueTasks(list, '2026-10-22')).toHaveLength(1)
  })

  it('groups by date', () => {
    const s = statsByDate([t('2026-10-20', false), t('2026-10-21', true)])
    expect(s['2026-10-21'].percent).toBe(100)
    expect(s['2026-10-20'].percent).toBe(0)
  })
})
