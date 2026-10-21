import { useState } from 'react'
import { ChevronDown, Trash } from 'lucide-react'
import { CURRENCIES, amountInputValue, currencySymbol, minorUnitDigits, parseAmount } from '@/lib/money'
import { isISODate, today } from '@/lib/dates'
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
              className="mr-auto"
              onClick={async () => {
                await deleteExpense(existing.id)
                onClose()
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {existing ? 'Save' : 'Add expense'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Amount" error={errors.amount}>
          {(p) => (
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-2xl font-medium text-muted" aria-hidden>
                {currencySymbol(currency)}
              </span>
              <Input
                {...p}
                autoFocus
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-16 text-3xl font-semibold tracking-tight tabular-nums"
                style={{ paddingLeft: `${Math.max(2.5, currencySymbol(currency).length * 0.9 + 1.6)}rem`, fontSize: '1.875rem' }}
              />
            </div>
          )}
        </Field>

        <Field label="Description" error={errors.description}>
          {(p) => <Input {...p} value={description} maxLength={140} placeholder="e.g. Lunch with friends" onChange={(e) => setDescription(e.target.value)} />}
        </Field>

        <div>
          <p id="exp-cat-label" className="mb-1.5 text-[13px] font-medium text-muted">
            Category
          </p>
          <div role="radiogroup" aria-labelledby="exp-cat-label" className="scrollbar-none -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            {visibleCats.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={categoryId === c.id}
                onClick={() => setCategoryId(categoryId === c.id ? '' : c.id)}
                className={cn(
                  'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
                  categoryId === c.id ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface-2 text-muted hover:text-text',
                )}
              >
                <CategoryIcon name={c.icon} size={15} />
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <Field label="Date" error={errors.date}>
          {(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>

        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore((m) => !m)}
          className="inline-flex items-center gap-1 self-start text-[13px] font-medium text-accent hover:underline"
        >
          More options
          <ChevronDown size={15} className={cn('transition-transform', more && 'rotate-180')} aria-hidden />
        </button>
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
      </div>
    </Sheet>
  )
}
