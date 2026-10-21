import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  BookOpen,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Images,
  Minus,
  PenLine,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  Wallet,
  Activity,
  Bot,
  Save,
} from 'lucide-react'
import { db } from '@/db/db'
import type { Highlight, MonthlyReflection } from '@/db/types'
import { compareWithPrevious, computeMonthRecap, type MetricDelta, type MonthComparison, type MonthRecap, type RecapData } from '@/domain/recap'
import { Button, Card, EmptyState, Field, IconButton, LoadingState, Notice, Page, PageHeader, StatTile, Textarea } from '@/components/ui'
import { BreakdownBars, ChartCard, ColumnChart, LineChart, MonthHeatmap } from '@/components/charts/Charts'
import { useSettings } from '@/stores/settings'
import { toast } from '@/stores/ui'
import {
  addMonthsKey,
  currentMonth,
  dateRange,
  formatDate,
  formatMonth,
  monthEnd,
  monthGrid,
  monthStart,
  today,
  weekdayLabels,
} from '@/lib/dates'
import { formatDuration } from '@/lib/duration'
import { formatMoney } from '@/lib/money'
import { nowISO } from '@/lib/id'
import { cn, plural } from '@/lib/text'
import { AIError, getAIProvider } from '@/ai/provider'
import { monthSummaryInput } from '@/ai/prompts'

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

async function loadRecapData(month: string): Promise<RecapData & { highlightsList: Highlight[] }> {
  // Previous month is loaded too, for comparisons.
  const from = monthStart(addMonthsKey(month, -1))
  const to = monthEnd(month)
  const between = <T,>(table: { where: (k: string) => { between: (a: string, b: string, i: boolean, j: boolean) => { toArray: () => Promise<T[]> } } }) =>
    table.where('date').between(from, to, true, true).toArray()
  const [tasks, days, highlights, studySessions, subjects, expenses, categories, photos, notes, places, focusSessions, routines, routineLogs, screenTime] =
    await Promise.all([
      between(db.tasks),
      between(db.days),
      between(db.highlights),
      between(db.studySessions),
      db.studySubjects.toArray(),
      between(db.expenses),
      db.expenseCategories.toArray(),
      between(db.photos),
      db.notes.toArray(),
      between(db.places),
      between(db.focusSessions),
      db.routines.toArray(),
      between(db.routineLogs),
      between(db.screenTime),
    ])
  return {
    tasks,
    days,
    highlights,
    highlightsList: highlights as Highlight[],
    studySessions,
    subjects,
    expenses,
    categories,
    photos: (photos as Array<{ id: string; date: string; isSelfie: boolean }>).map((p) => ({ id: p.id, date: p.date, isSelfie: p.isSelfie })),
    notes: notes.map((n) => ({ id: n.id, date: n.date, createdAt: n.createdAt })),
    places,
    focusSessions,
    routines,
    routineLogs,
    screenTime,
  } as RecapData & { highlightsList: Highlight[] }
}

/** Direction icon + text; neutral colour so "more spending" isn't shown as good or bad. */
function Delta({ d, format, label }: { d: MetricDelta; format: (v: number) => string; label: string }) {
  if (d.delta === null) return null
  const Icon = d.delta > 0 ? TrendingUp : d.delta < 0 ? TrendingDown : Minus
  const text = d.delta === 0 ? `Same as ${label}` : `${d.delta > 0 ? '+' : '−'}${format(Math.abs(d.delta))} vs ${label}`
  return (
    <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted">
      <Icon size={13} aria-hidden />
      {text}
    </span>
  )
}

function Section({ id, title, icon: Icon, children, aside }: { id?: string; title: string; icon: typeof Star; children: ReactNode; aside?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id ?? title}-h`} className="scroll-mt-24">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h2 id={`${id ?? title}-h`} className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <Icon size={17} strokeWidth={1.8} className="text-muted" aria-hidden />
          {title}
        </h2>
        {aside}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

function Metric({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="text-xs text-faint">{sub}</div>}
    </div>
  )
}

function MetricsCard({ children }: { children: ReactNode }) {
  return <Card className="grid grid-cols-2 gap-x-4 gap-y-4 p-4 sm:grid-cols-3">{children}</Card>
}

const NONE = <span className="text-faint">—</span>

function ReflectionSection({ month, recap, highlights }: { month: string; recap: MonthRecap; highlights: Highlight[] }) {
  const settings = useSettings()
  const existing = useLiveQuery(() => db.monthlyReflections.get(month), [month])
  const [form, setForm] = useState({ wentWell: '', proudOf: '', improve: '', prioritize: '' })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const provider = getAIProvider(settings)
  const [aiReady, setAiReady] = useState<boolean | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiText, setAiText] = useState<string | null>(null)
  const [aiErr, setAiErr] = useState<string | null>(null)

  useEffect(() => {
    if (existing === undefined || dirty) return
    setForm({
      wentWell: existing?.wentWell ?? '',
      proudOf: existing?.proudOf ?? '',
      improve: existing?.improve ?? '',
      prioritize: existing?.prioritize ?? '',
    })
  }, [existing, dirty])

  useEffect(() => {
    setDirty(false)
    setSavedAt(null)
    setAiText(null)
    setAiErr(null)
  }, [month])

  useEffect(() => {
    let alive = true
    if (!provider) {
      setAiReady(false)
      return
    }
    provider.isAvailable().then((ok) => alive && setAiReady(ok))
    return () => {
      alive = false
    }
  }, [provider])

  const filedDate = recap.isCurrent ? today() : monthEnd(month)

  const save = async (patch: Partial<MonthlyReflection> = {}) => {
    setSaving(true)
    try {
      const now = nowISO()
      await db.transaction('rw', db.monthlyReflections, async () => {
        const cur = await db.monthlyReflections.get(month)
        await db.monthlyReflections.put({
          month,
          ...cur,
          ...form,
          ...patch,
          date: cur?.date && !recap.isCurrent ? cur.date : filedDate,
          createdAt: cur?.createdAt ?? now,
          updatedAt: now,
        })
      })
      setDirty(false)
      setSavedAt(now)
      toast('Monthly reflection saved', { tone: 'success' })
    } catch {
      toast('Could not save your reflection', { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const generate = async () => {
    if (!provider) return
    setAiBusy(true)
    setAiErr(null)
    try {
      const text = await provider.complete('month-summary', monthSummaryInput(recap, highlights, (m) => formatMoney(m, settings.currency)))
      setAiText(text)
    } catch (e) {
      setAiErr(e instanceof AIError ? e.message : 'Something went wrong generating the summary.')
    } finally {
      setAiBusy(false)
    }
  }

  const prompts: Array<{ key: keyof typeof form; label: string }> = [
    { key: 'wentWell', label: 'What went well this month?' },
    { key: 'proudOf', label: 'What am I proud of?' },
    { key: 'improve', label: 'What would I like to improve?' },
    { key: 'prioritize', label: 'What should I prioritize next month?' },
  ]

  return (
    <Section id="reflection" title="Reflection" icon={PenLine}>
      <Card className="p-4">
        <p className="mb-4 text-[13px] text-muted">
          Optional. Saved as a journal entry on {formatDate(filedDate, 'd MMMM')} and searchable later.
        </p>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          {prompts.map((p) => (
            <Field key={p.key} label={p.label}>
              {(fp) => (
                <Textarea
                  {...fp}
                  rows={2}
                  value={form[p.key]}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, [p.key]: e.target.value }))
                    setDirty(true)
                  }}
                />
              )}
            </Field>
          ))}
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" icon={Save} loading={saving} disabled={!dirty && !!existing}>
              Save reflection
            </Button>
            <span className="text-xs text-faint" aria-live="polite">
              {dirty ? 'Unsaved changes' : savedAt ? 'Saved' : existing ? `Last saved ${formatDate(existing.updatedAt.slice(0, 10), 'd MMM')}` : ''}
            </span>
          </div>
        </form>
      </Card>

      {existing?.aiSummary && !aiText && (
        <Card className="p-4">
          <p className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted">
            <Bot size={15} aria-hidden /> Saved AI summary
          </p>
          <p className="text-sm leading-relaxed whitespace-pre-line">{existing.aiSummary}</p>
        </Card>
      )}

      {provider && aiReady ? (
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted">
              <Bot size={15} aria-hidden /> AI summary
            </p>
            <Button size="sm" variant="subtle" icon={Sparkles} loading={aiBusy} onClick={generate}>
              {aiText ? 'Regenerate' : 'Summarize this month'}
            </Button>
          </div>
          <p className="mt-1 text-xs text-faint">Sends counts, ratings, highlight titles and totals for this month to your AI server. No photos, places or note text.</p>
          {aiErr && <p role="alert" className="mt-3 text-[13px] text-danger">{aiErr}</p>}
          {aiText && (
            <>
              <p className="mt-3 text-sm leading-relaxed whitespace-pre-line">{aiText}</p>
              <p className="mt-2 text-xs text-faint">Generated from your records. It may be imperfect and is not professional advice.</p>
              <Button size="sm" className="mt-3" onClick={() => save({ aiSummary: aiText })}>
                Save with reflection
              </Button>
            </>
          )}
        </Card>
      ) : (
        <p className="px-1 text-xs text-faint">
          {provider && aiReady === false
            ? 'AI is enabled but the AI server is not reachable. '
            : 'Want an AI-written summary? It is optional and off by default. '}
          <Link to="/settings#ai" className="text-accent hover:underline">
            AI settings
          </Link>
        </p>
      )}
    </Section>
  )
}

export default function RecapPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { hash } = useLocation()
  const settings = useSettings()
  const thisMonth = currentMonth()
  const raw = params.get('m') ?? ''
  const month = MONTH_RE.test(raw) && raw <= thisMonth ? raw : thisMonth
  const setMonth = (m: string) => setParams(m === thisMonth ? {} : { m }, { replace: true })

  const data = useLiveQuery(() => loadRecapData(month), [month])
  const recapSettings = { studyGoalDailyMin: settings.studyGoalDailyMin, currency: settings.currency }
  const recap = useMemo(() => (data ? computeMonthRecap(month, data, recapSettings) : null), [data, month, settings.studyGoalDailyMin, settings.currency]) // eslint-disable-line react-hooks/exhaustive-deps
  const cmp: MonthComparison | null = useMemo(
    () => (data && recap ? compareWithPrevious(recap, data, recapSettings) : null),
    [data, recap], // eslint-disable-line react-hooks/exhaustive-deps
  )

  useEffect(() => {
    if (!hash || !recap) return
    const el = document.getElementById(hash.slice(1))
    el?.scrollIntoView({ block: 'start' })
  }, [hash, recap])

  const money = (m: number) => formatMoney(Math.round(m), settings.currency)
  /** Averages are shown in whole currency units (no paise/cents). */
  const moneyAvg = (m: number) => formatMoney(Math.round(m / 100) * 100, settings.currency)
  const prevLabel = cmp ? formatMonth(cmp.previousMonth, 'MMM') : ''
  const ratingFmt = (v: number) => (Math.round(v * 10) / 10).toFixed(1)

  const header = (
    <PageHeader title="Recap" subtitle={recap?.isCurrent ? 'This month so far' : 'Monthly summary'}>
      <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl border border-line bg-surface px-1.5 py-1">
        <IconButton icon={ChevronLeft} label="Previous month" size="sm" onClick={() => setMonth(addMonthsKey(month, -1))} />
        <div className="text-center">
          <div className="text-[15px] font-medium">{formatMonth(month)}</div>
          {month !== thisMonth && (
            <button type="button" className="text-xs text-accent hover:underline" onClick={() => setMonth(thisMonth)}>
              Back to this month
            </button>
          )}
        </div>
        <IconButton icon={ChevronRight} label="Next month" size="sm" disabled={month >= thisMonth} onClick={() => setMonth(addMonthsKey(month, 1))} />
      </div>
    </PageHeader>
  )

  if (!data || !recap || !cmp) {
    return (
      <Page width="wide">
        {header}
        <LoadingState label="Calculating your month…" />
      </Page>
    )
  }

  const elapsed = recap.elapsedDays ? dateRange(recap.start, recap.end) : []
  const ratingData = elapsed.map((d) => ({ label: String(Number(d.slice(8))), fullLabel: formatDate(d, 'EEE, d MMM'), value: recap.daily.ratingByDate[d] ?? null }))
  const studyData = elapsed.map((d) => ({ label: String(Number(d.slice(8))), fullLabel: formatDate(d, 'EEE, d MMM'), value: Math.round((recap.study.secByDate[d] ?? 0) / 60) }))
  const maxActivity = Math.max(1, ...Object.values(recap.activityByDate))
  const heat: Record<string, number | null> = {}
  for (const d of elapsed) heat[d] = recap.activityByDate[d] ? recap.activityByDate[d] / maxActivity : null
  const compareNote = cmp.previousEmpty
    ? `Nothing was recorded in ${formatMonth(cmp.previousMonth, 'MMMM')}${cmp.partial ? ` up to day ${cmp.comparedDays}` : ''}, so there's nothing to compare with.`
    : cmp.partial
      ? `Changes compare the first ${plural(cmp.comparedDays, 'day')} of ${formatMonth(month, 'MMMM')} with the same days of ${formatMonth(cmp.previousMonth, 'MMMM')}.`
      : `Changes compare with ${formatMonth(cmp.previousMonth, 'MMMM')}.`
  const monthHighlights = data.highlightsList.filter((h) => h.date >= recap.start && h.date <= recap.end).sort((a, b) => a.date.localeCompare(b.date))

  return (
    <Page width="wide">
      {header}

      {recap.empty ? (
        <div className="flex flex-col gap-6">
          <EmptyState
            icon={CalendarCheck}
            title={recap.isCurrent ? 'Nothing recorded this month yet' : `Nothing recorded in ${formatMonth(month, 'MMMM')}`}
            description="Your recap fills in as you rate days, complete tasks, log study sessions, expenses and photos."
            action={
              recap.isCurrent ? (
                <Button variant="primary" onClick={() => navigate('/')}>
                  Go to Today
                </Button>
              ) : undefined
            }
          />
          <ReflectionSection month={month} recap={recap} highlights={monthHighlights} />
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {/* Hero row */}
          <div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Active days" value={`${recap.daily.activeDays} / ${recap.elapsedDays}`} sub="days with entries">
                <Delta d={cmp.activeDays} format={(v) => plural(v, 'day')} label={prevLabel} />
              </StatTile>
              <StatTile
                label="Average rating"
                value={recap.daily.avgRating === null ? NONE : `${ratingFmt(recap.daily.avgRating)} / 5`}
                sub={recap.daily.ratedDays ? `from ${plural(recap.daily.ratedDays, 'rated day')}` : 'No days rated'}
              >
                <Delta d={cmp.avgRating} format={ratingFmt} label={prevLabel} />
              </StatTile>
              <StatTile label="Study" value={formatDuration(recap.study.totalSec)} sub={plural(recap.study.sessions, 'session')}>
                <Delta d={cmp.studySec} format={(v) => formatDuration(v)} label={prevLabel} />
              </StatTile>
              <StatTile label="Spending" value={money(recap.expenses.total)} sub={plural(recap.expenses.count, 'expense')}>
                <Delta d={cmp.spending} format={money} label={prevLabel} />
              </StatTile>
            </div>
            <p className="mt-2 px-1 text-xs text-faint">{compareNote}</p>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            {/* Daily life */}
            <Section title="Daily life" icon={Star}>
              <MetricsCard>
                <Metric label="Days rated" value={`${recap.daily.ratedDays}`} sub={`of ${plural(recap.elapsedDays, 'day')}`} />
                <Metric label="Average" value={recap.daily.avgRating === null ? NONE : ratingFmt(recap.daily.avgRating)} sub="recorded days only" />
                <Metric
                  label="Best day"
                  value={
                    recap.daily.bestDay ? (
                      <Link to={`/?d=${recap.daily.bestDay.date}`} className="hover:text-accent">
                        {formatDate(recap.daily.bestDay.date, 'd MMM')}
                      </Link>
                    ) : (
                      NONE
                    )
                  }
                  sub={recap.daily.bestDay ? `${recap.daily.bestDay.rating}/5 · ${settings.ratingLabels[recap.daily.bestDay.rating - 1]}` : undefined}
                />
              </MetricsCard>
              <ChartCard
                title="Daily rating"
                subtitle="Unrated days are left as gaps"
                data={ratingData}
                valueHeader="Rating"
                empty={<p className="py-6 text-center text-[13px] text-muted">No days rated this month.</p>}
              >
                <LineChart data={ratingData} min={1} max={5} yTicks={[1, 3, 5]} formatValue={(v) => String(Math.round(v * 10) / 10)} />
              </ChartCard>
              {monthHighlights.length > 0 && (
                <Card className="p-4">
                  <p className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted">
                    <Sparkles size={15} aria-hidden /> {plural(monthHighlights.length, 'highlight')}
                  </p>
                  <ul className="flex flex-col">
                    {monthHighlights.slice(0, 6).map((h) => (
                      <li key={h.id}>
                        <Link to={`/?d=${h.date}`} className="-mx-2 flex items-baseline gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                          <span className="w-12 shrink-0 text-xs text-faint tabular-nums">{formatDate(h.date, 'd MMM')}</span>
                          <span className="min-w-0 truncate text-sm">{h.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {monthHighlights.length > 6 && (
                    <Link to="/highlights" className="mt-1 inline-block text-[13px] text-accent hover:underline">
                      See all highlights
                    </Link>
                  )}
                </Card>
              )}
            </Section>

            {/* Tasks */}
            <Section title="Tasks" icon={CalendarCheck}>
              <MetricsCard>
                <Metric label="Completed" value={recap.tasks.completed} sub={`of ${recap.tasks.scheduled} scheduled`} />
                <Metric
                  label="Completion"
                  value={recap.tasks.completionRate === null ? NONE : `${Math.round(recap.tasks.completionRate * 100)}%`}
                  sub={recap.tasks.completionRate === null ? 'No tasks scheduled' : undefined}
                />
                <Metric label="Still open" value={recap.tasks.outstanding} sub={recap.tasks.outstanding ? <Link to="/tasks" className="text-accent hover:underline">Review tasks</Link> : undefined} />
                {cmp.tasksCompleted.delta !== null && (
                  <p className="col-span-full -mt-2">
                    <Delta d={cmp.tasksCompleted} format={(v) => `${plural(v, 'task')} completed`} label={prevLabel} />
                  </p>
                )}
              </MetricsCard>
              {recap.tasks.mostActiveDays.length > 0 && (
                <Card className="p-4">
                  <p className="mb-2 text-[13px] font-medium text-muted">Most completed</p>
                  <ul className="flex flex-col">
                    {recap.tasks.mostActiveDays.map((d) => (
                      <li key={d.date}>
                        <Link to={`/?d=${d.date}`} className="-mx-2 flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                          <span>{formatDate(d.date, 'EEEE, d MMM')}</span>
                          <span className="text-muted tabular-nums">{plural(d.completed, 'task')}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </Section>

            {/* Study */}
            <Section title="Study" icon={BookOpen} aside={<Link to="/study" className="text-[13px] text-accent hover:underline">Open Study</Link>}>
              <MetricsCard>
                <Metric label="Total" value={formatDuration(recap.study.totalSec)} sub={plural(recap.study.sessions, 'session')} />
                <Metric
                  label="Per study day"
                  value={recap.study.avgPerStudyDaySec === null ? NONE : formatDuration(recap.study.avgPerStudyDaySec)}
                  sub={`${plural(recap.study.studyDays, 'day')} studied`}
                />
                <Metric
                  label="Per day overall"
                  value={recap.study.avgPerElapsedDaySec === null ? NONE : formatDuration(recap.study.avgPerElapsedDaySec)}
                  sub={`over ${plural(recap.elapsedDays, 'day')}`}
                />
                {recap.study.goalDaysMet !== null && (
                  <Metric label="Daily goal met" value={plural(recap.study.goalDaysMet, 'day')} sub={`goal ${formatDuration(recap.study.goalMin * 60)}`} />
                )}
              </MetricsCard>
              <ChartCard
                title="Study time per day"
                subtitle={recap.study.goalMin ? `Minutes · the line marks your ${formatDuration(recap.study.goalMin * 60)} daily goal` : 'Minutes'}
                data={studyData} valueHeader="Minutes" formatValue={(v) => `${v}m`}>
                <ColumnChart
                  data={studyData}
                  formatValue={(v) => formatDuration(v * 60)}
                  formatTick={(v) => `${Math.round(v)}m`}
                  goal={recap.study.goalMin || undefined}
                />
              </ChartCard>
              {recap.study.topSubjects.length > 0 && (
                <Card className="p-4">
                  <p className="mb-2 text-[13px] font-medium text-muted">Most studied</p>
                  <ul className="flex flex-col gap-1.5">
                    {recap.study.topSubjects.map((s) => (
                      <li key={s.id || 'none'} className="flex items-center justify-between text-sm">
                        <span className="truncate">{s.name}</span>
                        <span className="text-muted tabular-nums">{formatDuration(s.sec)}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </Section>

            {/* Expenses */}
            <Section title="Expenses" icon={Wallet} aside={<Link to="/expenses" className="text-[13px] text-accent hover:underline">Open Expenses</Link>}>
              <MetricsCard>
                <Metric label="Total" value={money(recap.expenses.total)} sub={plural(recap.expenses.count, 'expense')} />
                <Metric label="Per day" value={recap.expenses.avgPerElapsedDay === null ? NONE : moneyAvg(recap.expenses.avgPerElapsedDay)} sub={`over ${plural(recap.elapsedDays, 'day')}`} />
                <Metric
                  label="Highest day"
                  value={
                    recap.expenses.highestDay ? (
                      <Link to={`/?d=${recap.expenses.highestDay.date}`} className="hover:text-accent">
                        {money(recap.expenses.highestDay.amount)}
                      </Link>
                    ) : (
                      NONE
                    )
                  }
                  sub={recap.expenses.highestDay ? formatDate(recap.expenses.highestDay.date, 'd MMM') : undefined}
                />
              </MetricsCard>
              {recap.expenses.otherCurrencyCount > 0 && (
                <Notice>
                  {plural(recap.expenses.otherCurrencyCount, 'expense')} in other currencies {recap.expenses.otherCurrencyCount === 1 ? 'is' : 'are'} not included in these totals.
                </Notice>
              )}
              {recap.expenses.byCategory.length > 0 && (
                <Card className="p-4">
                  <p className="mb-3 text-[13px] font-medium text-muted">By category</p>
                  <BreakdownBars items={recap.expenses.byCategory.map((c) => ({ key: c.id, label: c.name, value: c.amount }))} formatValue={money} />
                </Card>
              )}
            </Section>

            {/* Photos & journaling */}
            <Section title="Photos & journaling" icon={Images}>
              <MetricsCard>
                <Metric label="Photos" value={recap.journal.photos} sub={recap.journal.selfies ? plural(recap.journal.selfies, 'selfie') : undefined} />
                <Metric label="Notes" value={recap.journal.notes} />
                <Metric label="Highlights" value={recap.journal.highlights} />
                <Metric label="Reflections" value={recap.journal.reflections} sub="daily" />
                {recap.journal.places > 0 && <Metric label="Places" value={recap.journal.places} />}
                {recap.journal.focusSec > 0 && <Metric label="Focus time" value={formatDuration(recap.journal.focusSec)} />}
              </MetricsCard>
            </Section>

            {/* Consistency */}
            <Section title="Consistency" icon={Activity}>
              <Card className="p-4">
                <div className="mb-4 grid grid-cols-2 gap-4">
                  <Metric
                    label="Days with entries"
                    value={`${recap.consistency.activeDays} of ${recap.consistency.elapsedDays}`}
                    sub={recap.consistency.activeRate === null ? undefined : `${Math.round(recap.consistency.activeRate * 100)}%`}
                  />
                  <Metric label="Longest run" value={plural(recap.consistency.longestRun, 'day')} sub="in a row with entries" />
                </div>
                <div className="mx-auto max-w-sm">
                <MonthHeatmap
                  dates={monthGrid(month, settings.weekStartsOn)}
                  month={month}
                  values={heat}
                  weekdayLabels={weekdayLabels(settings.weekStartsOn, 'narrow')}
                  describe={(d) => {
                    const n = recap.activityByDate[d]
                    if (d > recap.end) return `${formatDate(d, 'd MMM')}: upcoming`
                    return `${formatDate(d, 'EEE d MMM')}: ${n ? plural(n, 'entry', 'entries') : 'nothing recorded'}`
                  }}
                  onSelect={(d) => d <= recap.end && navigate(`/?d=${d}`)}
                />
                </div>
                <p className="mt-3 text-xs text-faint">Days without entries just weren't logged — they aren't counted against you.</p>
              </Card>
              {recap.consistency.routines.length > 0 && (
                <Card className="p-4">
                  <p className="mb-2 text-[13px] font-medium text-muted">Routines</p>
                  <ul className="flex flex-col gap-1.5">
                    {recap.consistency.routines.map((r) => (
                      <li key={r.id} className="flex items-center justify-between text-sm">
                        <span className="truncate">{r.name}</span>
                        <span className="text-muted tabular-nums">
                          {r.done} / {r.applicable} days
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              {recap.consistency.screenTime.loggedDays > 0 && (
                <Card className={cn('flex items-center justify-between p-4 text-sm')}>
                  <span className="text-muted">Screen time (logged days)</span>
                  <span className="tabular-nums">
                    avg {formatDuration((recap.consistency.screenTime.avgMin ?? 0) * 60)} · {plural(recap.consistency.screenTime.loggedDays, 'day')}
                  </span>
                </Card>
              )}
            </Section>
          </div>

          <ReflectionSection month={month} recap={recap} highlights={monthHighlights} />
        </div>
      )}
    </Page>
  )
}
