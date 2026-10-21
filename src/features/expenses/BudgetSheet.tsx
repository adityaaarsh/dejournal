import { useState } from 'react'
import { amountInputValue, currencySymbol, parseAmount } from '@/lib/money'
import { updateSettings, useSettings } from '@/stores/settings'
import { toast } from '@/stores/ui'
import { Button, Field, Input, Sheet } from '@/components/ui'
import { CategoryIcon } from './categoryIcons'
import { useCategories } from './expenses'

/** Edit the monthly budget and optional per-category monthly budgets. */
export function BudgetSheet({ onClose }: { onClose: () => void }) {
  const settings = useSettings()
  const categories = useCategories()
  const cur = settings.currency
  const [monthly, setMonthly] = useState(settings.monthlyBudget ? amountInputValue(settings.monthlyBudget, cur) : '')
  const [perCat, setPerCat] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(settings.categoryBudgets).map(([k, v]) => [k, v ? amountInputValue(v, cur) : ''])),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = async () => {
    const errs: Record<string, string> = {}
    const parse = (v: string, key: string): number => {
      if (!v.trim()) return 0
      const n = parseAmount(v, cur)
      if (n === null) errs[key] = 'Enter a positive amount, or leave empty for no budget.'
      return n ?? 0
    }
    const monthlyBudget = parse(monthly, 'monthly')
    const categoryBudgets: Record<string, number> = {}
    for (const [id, v] of Object.entries(perCat)) {
      const n = parse(v, id)
      if (n > 0) categoryBudgets[id] = n
    }
    setErrors(errs)
    if (Object.keys(errs).length) return
    await updateSettings({ monthlyBudget, categoryBudgets })
    toast('Budgets saved', { tone: 'success' })
    onClose()
  }

  const sym = currencySymbol(cur)
  return (
    <Sheet
      title="Budgets"
      description={`Monthly limits in ${cur}. You'll see a warning at 80% and when you go over. Leave empty for no budget.`}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            Save budgets
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label={`Monthly budget (${sym})`} error={errors.monthly}>
          {(p) => <Input {...p} inputMode="decimal" placeholder="No budget" value={monthly} onChange={(e) => setMonthly(e.target.value)} />}
        </Field>
        <div>
          <p className="mb-2 text-[13px] font-medium text-muted">Per category (optional)</p>
          <ul className="flex flex-col gap-2">
            {(categories ?? [])
              .filter((c) => !c.archived || perCat[c.id])
              .map((c) => (
                <li key={c.id}>
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
                      <CategoryIcon name={c.icon} />
                    </span>
                    <label htmlFor={`budget-${c.id}`} className="min-w-0 flex-1 truncate text-sm">
                      {c.name}
                    </label>
                    <Input
                      id={`budget-${c.id}`}
                      inputMode="decimal"
                      placeholder="—"
                      aria-invalid={errors[c.id] ? true : undefined}
                      className="w-32 text-right"
                      value={perCat[c.id] ?? ''}
                      onChange={(e) => setPerCat((s) => ({ ...s, [c.id]: e.target.value }))}
                    />
                  </div>
                  {errors[c.id] && (
                    <p role="alert" className="mt-1 text-right text-xs text-danger">
                      {errors[c.id]}
                    </p>
                  )}
                </li>
              ))}
          </ul>
        </div>
      </div>
    </Sheet>
  )
}
