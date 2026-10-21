import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { Expense, ExpenseCategory } from '@/db/types'
import { nowISO, uid } from '@/lib/id'
import { normalize } from '@/lib/text'
import { undoToast } from '@/stores/ui'

export type ExpenseInput = Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>

export async function createExpense(input: ExpenseInput): Promise<Expense> {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error('Amount must be a positive number.')
  const now = nowISO()
  const rec: Expense = { ...input, id: uid(), createdAt: now, updatedAt: now }
  await db.expenses.add(rec)
  return rec
}

export async function updateExpense(id: string, patch: Partial<Expense>): Promise<void> {
  if (patch.amount !== undefined && (!Number.isSafeInteger(patch.amount) || patch.amount <= 0)) throw new Error('Amount must be a positive number.')
  await db.expenses.update(id, { ...patch, updatedAt: nowISO() })
}

export async function deleteExpense(id: string): Promise<void> {
  const rec = await db.expenses.get(id)
  if (!rec) return
  await db.expenses.delete(id)
  undoToast('Expense deleted', async () => {
    await db.expenses.put(rec)
  })
}

/* Categories */

export function useCategories(): ExpenseCategory[] | undefined {
  return useLiveQuery(() => db.expenseCategories.orderBy('order').toArray(), [])
}

export function categoryMap(list: ExpenseCategory[] | undefined): Map<string, ExpenseCategory> {
  return new Map((list ?? []).map((c) => [c.id, c]))
}

export async function createCategory(name: string, icon: string): Promise<ExpenseCategory> {
  const clean = name.trim()
  const all = await db.expenseCategories.toArray()
  const existing = all.find((c) => normalize(c.name) === normalize(clean))
  if (existing) {
    if (existing.archived) await db.expenseCategories.update(existing.id, { archived: false })
    return { ...existing, archived: false }
  }
  const cat: ExpenseCategory = {
    id: uid(),
    name: clean,
    icon,
    builtin: false,
    order: all.reduce((m, c) => Math.max(m, c.order), -1) + 1,
  }
  await db.expenseCategories.add(cat)
  return cat
}

export async function updateCategory(id: string, patch: Partial<ExpenseCategory>): Promise<void> {
  await db.expenseCategories.update(id, patch)
}

export const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Bank transfer']
