import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Check, ChevronDown, CircleAlert, CircleCheck, PenLine, Trash, TriangleAlert } from 'lucide-react'
import { db } from '@/db/db'
import type { Expense } from '@/db/types'
import { CURRENCIES, amountInputValue, currencySymbol, formatMoney, minorUnitDigits, parseAmount, toMajor } from '@/lib/money'
import { isISODate, relativeDayLabel, today } from '@/lib/dates'
import { spendLevel, type SpendLevel } from '@/domain/expenses'
import { cn } from '@/lib/text'
import { useSettings } from '@/stores/settings'
import { toast } from '@/stores/ui'
import { Button, Field, Input, Select, Sheet, Textarea } from '@/components/ui'
import type { DialogProps } from '@/features/quick/DialogHost'
import { CategoryIcon } from './categoryIcons'
import { PAYMENT_METHODS, createExpense, deleteExpense, updateExpense, useCategories } from './expenses'

export default function ExpenseDialog({ request, onClose }: DialogProps<'expense'>) {
  const settings = useSettings()
  const existing = request.expense
  const categories = useCategories()
  const [currency, setCurrency] = useState(existing?.currency ?? settings.currency)
  const [amount, setAmount] = useState(existing ? amountInputValue(existing.amount, existing.currency) : '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [categoryId, setCategoryId] = useState<string>(existing?.categoryId ?? '')
  const [date, setDate] = useState(existing?.date ?? request.date ?? today())
  const [time, setTime] = useState(existing?.time ?? '')
  const [payment, setPayment] = useState(existing?.paymentMethod ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [more, setMore] = useState(!!(existing?.time || existing?.paymentMethod || existing?.note || (existing && existing.currency !== settings.currency)))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const visibleCats = (categories ?? []).filter((c) => !c.archived || c.id === categoryId)

  // Live preview of the day's total (same currency) after this expense.
  const dayExpenses = useLiveQuery(async () => (isISODate(date) ? db.expenses.where('date').equals(date).toArray() : ([] as Expense[])), [date])
  const before = (dayExpenses ?? []).filter((e) => e.currency === currency && e.id !== existing?.id).reduce((t, e) => t + e.amount, 0)
  const minorNow = parseAmount(amount, currency)
  const after = before + (minorNow ?? 0)

  /** Quick chips add to the amount typed so far. */
  const bump = (n: number) => {
    const cur = toMajor(parseAmount(amount, currency) ?? 0, currency)
    const next = Math.round((cur + n) * 100) / 100
    setAmount(Number.isInteger(next) ? String(next) : next.toFixed(minorUnitDigits(currency)))
  }

  const save = async () => {
    if (saving) return
    const errs: Record<string, string> = {}
    const minor = parseAmount(amount, currency)
    if (!amount.trim()) errs.amount = 'Enter an amount.'
    else if (minor === null) {
      const digits = minorUnitDigits(currency)
      errs.amount = `Enter a positive amount${digits ? ` with at most ${digits} decimal places` : ' without decimals'}.`
    }
    if (!description.trim() && !categoryId) errs.description = 'Add a description or pick a category.'
    if (!isISODate(date)) errs.date = 'Pick a valid date.'
    setErrors(errs)
    if (Object.keys(errs).length || minor === null) return

    const cat = categories?.find((c) => c.id === categoryId)
    const data = {
      amount: minor,
      currency,
      description: description.trim() || cat?.name || 'Expense',
      date,
      time: time || null,
      categoryId: categoryId || 'other',
      paymentMethod: payment.trim() || null,
      note: note.trim() || undefined,
    }
    setSaving(true)
    try {
      if (existing) {
        await updateExpense(existing.id, data)
        toast('Expense updated', { tone: 'success' })
      } else {
        await createExpense(data)
        toast('Expense added', { tone: 'success' })
      }
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save the expense.', { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      title={existing ? 'Edit expense' : 'Add expense'}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          {existing && (
            <Button
              variant="danger"
              icon={Trash}
              onClick={async () => {
                await deleteExpense(existing.id)
                onClose()
              }}
            >
              Delete
            </Button>
          )}
          <Button type="submit" variant="primary" size="lg" icon={Check} loading={saving} className="flex-1">
            {existing ? 'Save' : minorNow ? `Add ${formatMoney(minorNow, currency)}` : 'Add expense'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="exp-amount" className="sr-only">
            Amount
          </label>
          <div className="flex items-baseline justify-center gap-1.5 pt-1">
            <span className="text-2xl font-medium text-muted" aria-hidden>
              {currencySymbol(currency)}
            </span>
            <input
              id="exp-amount"
              autoFocus
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={amount}
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={errors.amount ? 'exp-amount-err' : undefined}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-transparent text-center font-display text-[48px] leading-none font-semibold tracking-tight tabular-nums outline-none placeholder:text-faint"
              style={{ width: `${Math.max(1, amount.length) * 0.8 + 0.2}em` }}
            />
          </div>
          {errors.amount && (
            <p id="exp-amount-err" role="alert" className="mt-1 text-center text-xs text-danger">
              {errors.amount}
            </p>
          )}
          <div className="mt-3 flex justify-center gap-2">
            {[50, 100, 200, 500].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => bump(n)}
                className="h-8 rounded-full border border-line px-3 text-[13px] font-semibold text-text/80 hover:bg-surface-2"
              >
                +{n}
              </button>
            ))}
          </div>
        </div>

        <div role="radiogroup" aria-label="Category" className="grid grid-cols-4 gap-2">
          {visibleCats.map((c) => {
            const on = categoryId === c.id
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setCategoryId(on ? '' : c.id)}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1.5 rounded-2xl border text-[11.5px] font-semibold transition-colors',
                  on ? 'border-accent bg-accent-soft text-text' : 'border-line text-muted hover:bg-surface-2 hover:text-text',
                )}
              >
                <span className={on ? 'text-accent' : undefined}>
                  <CategoryIcon name={c.icon} size={19} />
                </span>
                <span className="max-w-full truncate px-1">{c.name}</span>
              </button>
            )
          })}
        </div>

        <Field label="Description" error={errors.description}>
          {(p) => (
            <div className="relative">
              <PenLine size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" aria-hidden />
              <Input {...p} value={description} maxLength={140} placeholder="e.g. Dinner with friends" onChange={(e) => setDescription(e.target.value)} className="pl-10" />
            </div>
          )}
        </Field>

        <div className="flex items-end gap-3">
          <Field label="Date" error={errors.date} className="flex-1">
            {(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
          <button
            type="button"
            aria-expanded={more}
            onClick={() => setMore((m) => !m)}
            className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline"
          >
            More options
            <ChevronDown size={15} className={cn('transition-transform', more && 'rotate-180')} aria-hidden />
          </button>
        </div>
        {more && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Time" optional>
                {(p) => <Input {...p} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}
              </Field>
              <Field label="Currency">
                {(p) => (
                  <Select {...p} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    {Array.from(new Set([...CURRENCIES, currency])).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <Field label="Payment method" optional>
              {(p) => (
                <>
                  <Input {...p} list="exp-payment-methods" value={payment} maxLength={40} placeholder="Cash, UPI, Card…" onChange={(e) => setPayment(e.target.value)} />
                  <datalist id="exp-payment-methods">
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <Field label="Note" optional>
              {(p) => <Textarea {...p} rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />}
            </Field>
          </div>
        )}

        {dayExpenses !== undefined && <SpendPreview date={date} before={before} after={after} currency={currency} />}
      </div>
    </Sheet>
  )
}

const LEVEL: Record<SpendLevel, { box: string; text: string; Icon: typeof CircleCheck }> = {
  low: { box: 'border-success/35 bg-success-soft', text: 'text-success', Icon: CircleCheck },
  mid: { box: 'border-warn/40 bg-warn-soft', text: 'text-warn', Icon: CircleAlert },
  high: { box: 'border-danger/40 bg-danger-soft', text: 'text-danger', Icon: TriangleAlert },
}

/** The day's spending before and after this expense, each in its colour. */
function SpendPreview({ date, before, after, currency }: { date: string; before: number; after: number; currency: string }) {
  const a = LEVEL[spendLevel(before, currency)]
  const b = LEVEL[spendLevel(after, currency)]
  return (
    <div className={cn('flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 transition-colors', b.box)} aria-live="polite">
      <b.Icon size={19} className={cn('shrink-0', b.text)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted">Spending · {isISODate(date) ? relativeDayLabel(date, 'd MMM') : ''}</div>
        <div className="mt-0.5 flex items-center gap-2 font-display text-[15px] font-semibold tabular-nums">
          <span className={a.text}>{formatMoney(before, currency)}</span>
          {after !== before && (
            <>
              <ArrowRight size={14} className="text-muted" aria-hidden />
              <span className={b.text}>{formatMoney(after, currency)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
