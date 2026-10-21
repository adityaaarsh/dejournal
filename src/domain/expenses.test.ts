import { describe, expect, it } from 'vitest'
import type { Expense } from '@/db/types'
import { averageDaily, budgetStatus, elapsedDays, highestDay, splitByCurrency, total, totalsByCategory, totalsByDay } from './expenses'
import { formatMoney, parseAmount } from '@/lib/money'

let n = 0
function e(date: string, amount: number, categoryId = 'food', currency = 'INR'): Expense {
  return { id: `e${n++}`, date, amount, categoryId, currency, description: 'x', createdAt: '', updatedAt: '' }
}

describe('expense analytics', () => {
  const list = [e('2026-10-01', 34000), e('2026-10-01', 15050, 'transport'), e('2026-10-03', 100000, 'bills'), e('2026-10-03', 500, 'food', 'USD')]
  const oct = { start: '2026-10-01', end: '2026-10-31' }

  it('splits currencies so totals never mix them', () => {
    const { same, other } = splitByCurrency(list, 'INR')
    expect(same).toHaveLength(3)
    expect(other).toHaveLength(1)
    expect(total(same)).toBe(149050)
  })

  it('totals per day and category', () => {
    const { same } = splitByCurrency(list, 'INR')
    const byDay = totalsByDay(same, oct)
    expect(byDay['2026-10-01']).toBe(49050)
    expect(byDay['2026-10-02']).toBe(0)
    expect(totalsByCategory(same)[0]).toEqual({ categoryId: 'bills', amount: 100000, count: 1 })
  })

  it('average daily uses elapsed days only', () => {
    const { same } = splitByCurrency(list, 'INR')
    expect(elapsedDays(oct, '2026-10-05')).toBe(5)
    expect(averageDaily(same, oct, '2026-10-05')).toBe(Math.round(149050 / 5))
    expect(averageDaily(same, { start: '2026-11-01', end: '2026-11-30' }, '2026-10-05')).toBeNull()
  })

  it('highest day', () => {
    const { same } = splitByCurrency(list, 'INR')
    expect(highestDay(same, oct)).toEqual({ date: '2026-10-03', amount: 100000 })
    expect(highestDay([], oct)).toBeNull()
  })

  it('budget thresholds', () => {
    expect(budgetStatus(100, 0).level).toBe('none')
    expect(budgetStatus(70, 100).level).toBe('ok')
    expect(budgetStatus(80, 100).level).toBe('near')
    expect(budgetStatus(101, 100).level).toBe('over')
    expect(budgetStatus(100, 100).level).toBe('near')
  })

  it('amount parsing and formatting', () => {
    expect(parseAmount('340')).toBe(34000)
    expect(parseAmount('12.5')).toBe(1250)
    expect(parseAmount('1,299.99')).toBe(129999)
    expect(parseAmount('0')).toBeNull()
    expect(parseAmount('-5')).toBeNull()
    expect(parseAmount('1.234')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('500', 'JPY')).toBe(500)
    expect(formatMoney(34000, 'INR')).toBe('₹340')
  })
})
