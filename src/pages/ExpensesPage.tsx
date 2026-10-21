import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, Plus, Tag, Target, TriangleAlert, Wallet } from 'lucide-react'
import { db } from '@/db/db'
import type { Expense } from '@/db/types'
import {
  addDays,
  addMonthsKey,
  dateRange,
  formatDate,
  formatMonth,
  formatTime,
  isISODate,
  monthEnd,
  monthKey,
  monthStart,
  relativeDayLabel,
  today,
  weekRange,
} from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { averageDaily, budgetStatus, elapsedDays, highestDay, splitByCurrency, total, totalsByCategory, totalsByDay, type BudgetStatus } from '@/domain/expenses'
import { describeChange, previousPeriod } from '@/domain/study'
import { useSettings } from '@/stores/settings'
import { openDialog } from '@/stores/ui'
import { BreakdownBars, ChartCard, ColumnChart } from '@/components/charts/Charts'
import { Button, Card, EmptyState, IconButton, LoadingState, Notice, Page, PageHeader, ProgressBar, Segmented, StatTile } from '@/components/ui'
import { CategoryIcon } from '@/features/expenses/categoryIcons'
import { categoryMap, useCategories } from '@/features/expenses/expenses'
import { CategoriesSheet } from '@/features/expenses/CategoriesSheet'
import { BudgetSheet } from '@/features/expenses/BudgetSheet'

type Range = 'day' | 'week' | 'month'

function BudgetRow({ label, status, currency, icon }: { label: string; status: BudgetStatus; currency: string; icon?: React.ReactNode }) {
  const pct = Math.round(status.ratio * 100)
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          {icon}
          {label}
        </span>
        <span className="shrink-0 tabular-nums">
          {formatMoney(status.spent, currency)} <span className="text-faint">/ {formatMoney(status.budget, currency)}</span>
        </span>
      </div>
      <ProgressBar value={status.spent} max={status.budget} label={`${label} budget used`} tone={status.level === 'ok' ? 'accent' : 'warn'} />
      <p className={`mt-1 text-xs ${status.level === 'over' ? 'text-danger' : status.level === 'near' ? 'text-warn' : 'text-faint'}`}>
        {status.level === 'over' ? `${formatMoney(-status.remaining, currency)} over budget` : `${pct}% used · ${formatMoney(status.remaining, currency)} left`}
      </p>
    </div>
  )
}

export default function ExpensesPage() {
  const settings = useSettings()
  const currency = settings.currency
  const [params] = useSearchParams()
  const dParam = params.get('d')
  const todayDate = today()
  const [range, setRange] = useState<Range>(isISODate(dParam) ? 'day' : 'month')
  const [anchor, setAnchor] = useState<string>(isISODate(dParam) ? dParam : todayDate)
  const [sheet, setSheet] = useState<null | 'categories' | 'budget'>(null)

  const all = useLiveQuery(() => db.expenses.toArray(), [])
  const categories = useCategories()
  const cats = categoryMap(categories)

  const period = useMemo(() => {
    if (range === 'day') return { start: anchor, end: anchor }
    if (range === 'week') {
      const [s, e] = weekRange(anchor, settings.weekStartsOn)
      return { start: s, end: e }
    }
    const m = monthKey(anchor)
    return { start: monthStart(m), end: monthEnd(m) }
  }, [range, anchor, settings.weekStartsOn])

  const shift = (dir: 1 | -1) => {
    if (range === 'day') setAnchor((a) => addDays(a, dir))
    else if (range === 'week') setAnchor((a) => addDays(a, 7 * dir))
    else setAnchor((a) => monthStart(addMonthsKey(monthKey(a), dir)))
  }
  const isCurrent = period.start <= todayDate && todayDate <= period.end

  if (!all) {
    return (
      <Page>
        <PageHeader back="/more" title="Expenses" />
        <LoadingState />
      </Page>
    )
  }

  const { same, other } = splitByCurrency(all, currency)
  const inP = (e: Expense) => e.date >= period.start && e.date <= period.end
  const periodItems = same.filter(inP)
  const otherInPeriod = other.filter(inP)
  const periodTotal = total(periodItems)

  // Comparison: same number of elapsed days in the previous period.
  const prev = previousPeriod(period)
  const elapsed = elapsedDays(period, todayDate)
  const prevEnd = isCurrent && elapsed > 0 ? addDays(prev.start, elapsed - 1) : prev.end
  const prevTotal = total(same.filter((e) => e.date >= prev.start && e.date <= prevEnd))
  const prevLabel = range === 'day' ? 'the day before' : range === 'week' ? (isCurrent ? 'the same days last week' : 'the week before') : isCurrent ? 'the same days last month' : 'the month before'

  const avg = range === 'day' ? null : averageDaily(same, period, todayDate)
  const peak = range === 'day' ? null : highestDay(same, period)
  const byCategory = totalsByCategory(periodItems)

  const chartData =
    range === 'day'
      ? []
      : Object.entries(totalsByDay(same, period)).map(([d, amt]) => ({
          label: range === 'week' ? formatDate(d, 'EEEEE') : String(Number(d.slice(8))),
          fullLabel: formatDate(d, 'EEE, d MMM'),
          value: d > todayDate ? null : amt,
        }))

  // Budgets always refer to the calendar month containing the anchor date.
  const budgetMonth = monthKey(anchor)
  const monthItems = same.filter((e) => e.date >= monthStart(budgetMonth) && e.date <= monthEnd(budgetMonth))
  const monthStatus = budgetStatus(total(monthItems), settings.monthlyBudget)
  const monthByCat = new Map(totalsByCategory(monthItems).map((c) => [c.categoryId, c.amount]))
  const catStatuses = Object.entries(settings.categoryBudgets)
    .filter(([, b]) => b > 0)
    .map(([id, b]) => ({ id, status: budgetStatus(monthByCat.get(id) ?? 0, b) }))
  const hasBudgets = monthStatus.level !== 'none' || catStatuses.length > 0
  const warnings = [
    ...(monthStatus.level === 'over' || monthStatus.level === 'near' ? [{ label: 'Monthly budget', s: monthStatus }] : []),
    ...catStatuses.filter((c) => c.status.level === 'over' || c.status.level === 'near').map((c) => ({ label: cats.get(c.id)?.name ?? 'Category', s: c.status })),
  ]

  const periodTitle =
    range === 'day'
      ? relativeDayLabel(anchor, settings.dateFormat)
      : range === 'week'
        ? `${formatDate(period.start, 'd MMM')} – ${formatDate(period.end, 'd MMM')}`
        : formatMonth(monthKey(anchor))

  // List grouped by date, newest first
  const sorted = [...periodItems, ...otherInPeriod].sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? '') || b.createdAt.localeCompare(a.createdAt))
  const groups: Array<{ date: string; items: Expense[] }> = []
  for (const e of sorted) {
    const g = groups[groups.length - 1]
    if (g && g.date === e.date) g.items.push(e)
    else groups.push({ date: e.date, items: [e] })
  }

  const addDate = range === 'day' ? anchor : isCurrent ? todayDate : period.end < todayDate ? period.end : period.start

  return (
    <Page>
      <PageHeader
        back="/more"
        title="Expenses"
        actions={
          <>
            <IconButton icon={Tag} label="Manage categories" onClick={() => setSheet('categories')} />
            <IconButton icon={Target} label="Edit budgets" onClick={() => setSheet('budget')} />
            <IconButton icon={Plus} label="Add expense" onClick={() => openDialog({ kind: 'expense', date: addDate })} />
          </>
        }
      />
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Segmented
            label="Period"
            value={range}
            onChange={setRange}
            className="w-full"
            options={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
          />
          <div className="flex items-center justify-between">
            <IconButton icon={ChevronLeft} label={`Previous ${range}`} onClick={() => shift(-1)} />
            <div className="text-center">
              <div className="text-sm font-medium">{periodTitle}</div>
              {!isCurrent && (
                <button type="button" className="text-xs text-accent hover:underline" onClick={() => setAnchor(todayDate)}>
                  Back to today
                </button>
              )}
            </div>
            <IconButton icon={ChevronRight} label={`Next ${range}`} onClick={() => shift(1)} />
          </div>
        </div>

        <Card className="p-5">
          <div className="text-[13px] text-muted">{range === 'day' ? 'Spent' : 'Total spent'}</div>
          <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{formatMoney(periodTotal, currency)}</div>
          <div className="mt-1 text-xs text-faint">
            {periodItems.length} {periodItems.length === 1 ? 'expense' : 'expenses'}
            {(periodTotal > 0 || prevTotal > 0) && ` · ${describeChange(periodTotal, prevTotal, prevLabel)}`}
          </div>
          {otherInPeriod.length > 0 && (
            <p className="mt-2 text-xs text-faint">
              {otherInPeriod.length} {otherInPeriod.length === 1 ? 'expense' : 'expenses'} in other currencies {otherInPeriod.length === 1 ? 'is' : 'are'} listed below but not included in totals.
            </p>
          )}
        </Card>

        {range !== 'day' && (
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label="Average per day"
              value={avg === null ? '—' : formatMoney(avg, currency)}
              sub={avg === null ? 'Period hasn’t started' : `Total ÷ ${elapsed} ${elapsed === 1 ? 'day' : 'days'}${isCurrent ? ' so far' : ''}`}
            />
            <StatTile
              label="Highest day"
              value={peak ? formatMoney(peak.amount, currency) : '—'}
              sub={peak ? formatDate(peak.date, 'EEE, d MMM') : 'No spending recorded'}
              onClick={
                peak
                  ? () => {
                      setRange('day')
                      setAnchor(peak.date)
                    }
                  : undefined
              }
            />
          </div>
        )}

        {warnings.map((w) => (
          <Notice key={w.label} icon={TriangleAlert} tone="warn" title={w.s.level === 'over' ? `${w.label}: over budget` : `${w.label}: ${Math.round(w.s.ratio * 100)}% used`}>
            {w.s.level === 'over'
              ? `You've spent ${formatMoney(-w.s.remaining, currency)} more than your ${formatMonth(budgetMonth, 'MMMM')} budget.`
              : `${formatMoney(w.s.remaining, currency)} left for ${formatMonth(budgetMonth, 'MMMM')}.`}
          </Notice>
        ))}

        {hasBudgets && (
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-medium">{formatMonth(budgetMonth, 'MMMM')} budget</h2>
              <button type="button" className="text-[13px] font-medium text-accent hover:underline" onClick={() => setSheet('budget')}>
                Edit
              </button>
            </div>
            <div className="flex flex-col gap-4">
              {monthStatus.level !== 'none' && <BudgetRow label="All spending" status={monthStatus} currency={currency} />}
              {catStatuses.map(({ id, status }) => (
                <BudgetRow
                  key={id}
                  label={cats.get(id)?.name ?? 'Category'}
                  status={status}
                  currency={currency}
                  icon={<CategoryIcon name={cats.get(id)?.icon} size={14} className="text-muted" />}
                />
              ))}
            </div>
          </Card>
        )}

        {range !== 'day' && (
          <ChartCard title="Daily spending" data={chartData} valueHeader="Spent" formatValue={(v) => formatMoney(v, currency)}>
            <ColumnChart data={chartData} formatValue={(v) => formatMoney(v, currency)} />
          </ChartCard>
        )}

        {byCategory.length > 0 && (
          <Card className="p-4">
            <h2 className="mb-3 text-[15px] font-medium">By category</h2>
            <BreakdownBars
              formatValue={(v) => formatMoney(v, currency)}
              items={byCategory.map((c) => ({
                key: c.categoryId,
                label: cats.get(c.categoryId)?.name ?? 'Other',
                value: c.amount,
                icon: <CategoryIcon name={cats.get(c.categoryId)?.icon} size={14} className="text-muted" />,
              }))}
            />
          </Card>
        )}

        <section aria-labelledby="exp-list">
          <h2 id="exp-list" className="mb-2 text-[17px] font-semibold tracking-tight">
            Expenses
          </h2>
          {groups.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No expenses in this period"
              description="Log what you spend manually — DeJournal doesn't connect to your bank."
              action={
                <Button size="sm" variant="subtle" icon={Plus} onClick={() => openDialog({ kind: 'expense', date: addDate })}>
                  Add expense
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {groups.map((g) => {
                const dayTotal = total(g.items.filter((e) => e.currency === currency))
                return (
                  <Card key={g.date} className="px-2 py-2">
                    {range !== 'day' && (
                      <div className="flex items-center justify-between px-2 pt-1 pb-1 text-[13px]">
                        <span className="font-medium text-muted">{relativeDayLabel(g.date, settings.dateFormat)}</span>
                        <span className="text-faint tabular-nums">{formatMoney(dayTotal, currency)}</span>
                      </div>
                    )}
                    <ul>
                      {g.items.map((e) => {
                        const cat = cats.get(e.categoryId)
                        return (
                          <li key={e.id}>
                            <button
                              type="button"
                              onClick={() => openDialog({ kind: 'expense', expense: e })}
                              className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-2"
                            >
                              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
                                <CategoryIcon name={cat?.icon} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[15px]">{e.description}</span>
                                <span className="block truncate text-xs text-muted">
                                  {cat?.name ?? 'Other'}
                                  {e.time ? ` · ${formatTime(e.time)}` : ''}
                                  {e.paymentMethod ? ` · ${e.paymentMethod}` : ''}
                                </span>
                              </span>
                              <span className="shrink-0 text-[15px] font-medium tabular-nums">{formatMoney(e.amount, e.currency)}</span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </Card>
                )
              })}
            </div>
          )}
        </section>

        <p className="text-center text-xs text-faint">
          Expenses are logged manually and stay on this device. DeJournal never reads bank or card transactions.
          {dateRange(period.start, period.end).length > 1 && avg !== null && ' Averages divide by days elapsed in the period.'}
        </p>
      </div>
      {sheet === 'categories' && <CategoriesSheet onClose={() => setSheet(null)} />}
      {sheet === 'budget' && <BudgetSheet onClose={() => setSheet(null)} />}
    </Page>
  )
}
