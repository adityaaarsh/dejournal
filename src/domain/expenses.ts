/**
 * Pure expense analytics. Amounts are integer minor units. Totals only mix
 * records in the same currency — callers pass the display currency and
 * records in other currencies are reported separately.
 */
import type { Expense, ISODate } from '@/db/types'
import { dateRange, diffDays } from '@/lib/dates'
import { toMajor } from '@/lib/money'

export interface Period {
  start: ISODate
  end: ISODate
}

export function inPeriod(e: Pick<Expense, 'date'>, p: Period): boolean {
  return e.date >= p.start && e.date <= p.end
}

/** Split expenses into the display currency and "other currency" ones. */
export function splitByCurrency(expenses: Expense[], currency: string): { same: Expense[]; other: Expense[] } {
  const same: Expense[] = []
  const other: Expense[] = []
  for (const e of expenses) (e.currency === currency ? same : other).push(e)
  return { same, other }
}

export function total(expenses: Expense[]): number {
  return expenses.reduce((s, e) => s + e.amount, 0)
}

export function totalsByDay(expenses: Expense[], p: Period): Record<ISODate, number> {
  const out: Record<ISODate, number> = {}
  for (const d of dateRange(p.start, p.end)) out[d] = 0
  for (const e of expenses) if (inPeriod(e, p)) out[e.date] = (out[e.date] ?? 0) + e.amount
  return out
}

export function totalsByCategory(expenses: Expense[]): Array<{ categoryId: string; amount: number; count: number }> {
  const map = new Map<string, { amount: number; count: number }>()
  for (const e of expenses) {
    const cur = map.get(e.categoryId) ?? { amount: 0, count: 0 }
    cur.amount += e.amount
    cur.count++
    map.set(e.categoryId, cur)
  }
  return Array.from(map, ([categoryId, v]) => ({ categoryId, ...v })).sort((a, b) => b.amount - a.amount)
}

/** Days of the period that have elapsed (up to and including today). */
export function elapsedDays(p: Period, todayDate: ISODate): number {
  const end = p.end < todayDate ? p.end : todayDate
  if (end < p.start) return 0
  return diffDays(end, p.start) + 1
}

/** Average daily spend over elapsed days of the period (minor units, rounded). */
export function averageDaily(expenses: Expense[], p: Period, todayDate: ISODate): number | null {
  const days = elapsedDays(p, todayDate)
  if (days === 0) return null
  return Math.round(total(expenses.filter((e) => inPeriod(e, p))) / days)
}

export function highestDay(expenses: Expense[], p: Period): { date: ISODate; amount: number } | null {
  const byDay = totalsByDay(expenses, p)
  let best: { date: ISODate; amount: number } | null = null
  for (const [date, amount] of Object.entries(byDay)) if (amount > 0 && (!best || amount > best.amount)) best = { date, amount }
  return best
}

export type BudgetLevel = 'none' | 'ok' | 'near' | 'over'

export interface BudgetStatus {
  level: BudgetLevel
  spent: number
  budget: number
  /** 0..∞ ratio spent / budget. */
  ratio: number
  remaining: number
}

/** Budget status; "near" at ≥ 80 %, "over" above 100 %. */
export function budgetStatus(spent: number, budget: number): BudgetStatus {
  if (!budget || budget <= 0) return { level: 'none', spent, budget: 0, ratio: 0, remaining: 0 }
  const ratio = spent / budget
  const level: BudgetLevel = ratio > 1 ? 'over' : ratio >= 0.8 ? 'near' : 'ok'
  return { level, spent, budget, ratio, remaining: budget - spent }
}

/**
 * Colour level for a day's spending (in the display currency's major units):
 * green under 100, yellow under 400, red from 400.
 */
export type SpendLevel = 'low' | 'mid' | 'high'
export const SPEND_THRESHOLDS = { mid: 100, high: 400 } as const

export function spendLevel(totalMinor: number, currency: string): SpendLevel {
  const major = toMajor(totalMinor, currency)
  if (major < SPEND_THRESHOLDS.mid) return 'low'
  if (major < SPEND_THRESHOLDS.high) return 'mid'
  return 'high'
}
