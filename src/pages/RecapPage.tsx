import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Activity,
  BookOpen,
  Bot,
  CalendarCheck,
  CircleCheck,
  Clock,
  Images,
  MapPin,
  Minus,
  NotebookPen,
  PenLine,
  Repeat,
  Save,
  Smartphone,
  Sparkles,
  Star,
  Timer,
  TrendingDown,
  TrendingUp,
  Trophy,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { db } from '@/db/db'
import type { Highlight, MonthlyReflection } from '@/db/types'
import { compareWithPrevious, computeMonthRecap, type MetricDelta, type MonthComparison, type MonthRecap, type RecapData } from '@/domain/recap'
import {
  Button,
  CenteredHeader,
  EmptyState,
  Field,
  IconTile,
  LoadingState,
  MetricTile,
  MonthGrid,
  MoodLegend,
  MOOD_FACES,
  Notice,
  Page,
  RECORD_TONE,
  Textarea,
  TimelineRow,
  type DayCell,
  type Tone,
} from '@/components/ui'
import { ChartCard, ColumnChart, LineChart, MonthHeatmap } from '@/components/charts/Charts'
import { categoryIcon } from '@/features/expenses/categoryIcons'
import { useSettings } from '@/stores/settings'
import { toast } from '@/stores/ui'
import { addMonthsKey, currentMonth, dateRange, formatDate, formatMonth, monthEnd, monthGrid, monthStart, today, weekdayLabels } from '@/lib/dates'
import { formatDuration } from '@/lib/duration'
import { formatMoney } from '@/lib/money'
import { nowISO } from '@/lib/id'
import { plural } from '@/lib/text'
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

/* ------------------------------------------------------------------ */
/* Small layout pieces                                                 */
/* ------------------------------------------------------------------ */

/** Direction icon + text; neutral colour so "more spending" isn't shown as good or bad. */
function Delta({ d, format, label }: { d: MetricDelta; format: (v: number) => string; label: string }) {
  if (d.delta === null) return null
  const Icon = d.delta > 0 ? TrendingUp : d.delta < 0 ? TrendingDown : Minus
  const text = d.delta === 0 ? `Same as ${label}` : `${d.delta > 0 ? '+' : '−'}${format(Math.abs(d.delta))} vs ${label}`
  return (
    <span className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] text-muted">
      <Icon size={12} aria-hidden />
      {text}
    </span>
  )
}

/** Card with a header row: small icon tile + title, optional link/aside on the right. */
function SectionCard({
  id,
  icon,
  tone,
  title,
  aside,
  children,
  className,
}: {
  id?: string
  icon: LucideIcon
  tone: Tone
  title: string
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  const hid = `${id ?? title.replace(/\W+/g, '-').toLowerCase()}-h`
  return (
    <section id={id} aria-labelledby={hid} className={`scroll-mt-24 rounded-[var(--radius-card)] border border-line bg-surface px-3 pt-3 pb-2 ${className ?? ''}`}>
      <div className="mb-2 flex items-center gap-2.5">
        <IconTile icon={icon} tone={tone} size="sm" />
        <h2 id={hid} className="flex-1 text-[14px] font-semibold">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** Inline mini stat used in rows of 2–3 inside a card. */
function Mini({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2/60 px-3 py-2.5">
      <div className="truncate text-[11.5px] text-muted">{label}</div>
      <div className="mt-1 truncate font-display text-[14.5px] leading-tight font-semibold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-faint">{sub}</div>}
    </div>
  )
}

function Minis({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 }) {
  return <div className={`mb-2 grid gap-2 ${cols === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>{children}</div>
}

const AsideLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="text-[13px] font-semibold text-accent hover:underline">
    {children}
  </Link>
)

const NONE = <span className="text-faint">—</span>

/* ------------------------------------------------------------------ */
/* Reflection                                                          */
/* ------------------------------------------------------------------ */

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
    <div className="flex flex-col gap-3">
      <SectionCard id="reflection" icon={PenLine} tone={RECORD_TONE.reflection} title="Monthly reflection">
        <p className="mb-3 text-xs text-muted">Optional. Saved as a journal entry on {formatDate(filedDate, 'd MMMM')} and searchable later.</p>
        <form
          className="flex flex-col gap-3 pb-1"
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
      </SectionCard>

      {existing?.aiSummary && !aiText && (
        <SectionCard icon={Bot} tone="muted" title="Saved AI summary">
          <p className="pb-2 text-sm leading-relaxed whitespace-pre-line">{existing.aiSummary}</p>
        </SectionCard>
      )}

      {provider && aiReady ? (
        <SectionCard
          icon={Bot}
          tone="muted"
          title="AI summary"
          aside={
            <Button size="sm" variant="subtle" icon={Sparkles} loading={aiBusy} onClick={generate}>
              {aiText ? 'Regenerate' : 'Summarize'}
            </Button>
          }
        >
          <p className="text-xs text-faint">Sends counts, ratings, highlight titles and totals for this month to your AI server. No photos, places or note text.</p>
          {aiErr && <p role="alert" className="mt-3 text-[13px] text-danger">{aiErr}</p>}
          {aiText && (
            <>
              <p className="mt-3 text-sm leading-relaxed whitespace-pre-line">{aiText}</p>
              <p className="mt-2 text-xs text-faint">Generated from your records. It may be imperfect and is not professional advice.</p>
              <Button size="sm" className="mt-3 mb-1" onClick={() => save({ aiSummary: aiText })}>
                Save with reflection
              </Button>
            </>
          )}
        </SectionCard>
      ) : (
        <p className="px-1 text-xs text-faint">
          {provider && aiReady === false ? 'AI is enabled but the AI server is not reachable. ' : 'Want an AI-written summary? It is optional and off by default. '}
          <Link to="/settings#ai" className="text-accent hover:underline">
            AI settings
          </Link>
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

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

  const subtitle = !recap
    ? 'Loading…'
    : [
        recap.isCurrent ? 'So far' : 'Summary',
        recap.daily.avgRating !== null ? `avg mood ${ratingFmt(recap.daily.avgRating)}` : null,
        `${plural(recap.daily.activeDays, 'day')} logged`,
      ]
        .filter(Boolean)
        .join(' · ')

  const header = (
    <>
      <CenteredHeader
        title={formatMonth(month)}
        subtitle={subtitle}
        onPrev={() => setMonth(addMonthsKey(month, -1))}
        onNext={() => setMonth(addMonthsKey(month, 1))}
        prevLabel="Previous month"
        nextLabel="Next month"
        nextDisabled={month >= thisMonth}
      />
      {month !== thisMonth && (
        <div className="-mt-1 mb-2 text-center">
          <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={() => setMonth(thisMonth)}>
            Back to this month
          </button>
        </div>
      )}
    </>
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

  // Mood calendar cells for this month.
  const moodCells: Record<string, DayCell> = {}
  for (const [d, r] of Object.entries(recap.daily.ratingByDate)) if (r) moodCells[d] = { rating: r }
  const AvgFace = recap.daily.avgRating !== null ? MOOD_FACES[Math.min(4, Math.max(0, Math.round(recap.daily.avgRating) - 1))] : Star
  const catIcon = new Map((data.categories ?? []).map((c) => [c.id, c.icon]))
  const catTotal = recap.expenses.byCategory.reduce((s, c) => s + c.amount, 0)

  const journalTiles: Array<{ icon: LucideIcon; tone: Tone; label: string; value: ReactNode; sub?: string }> = [
    { icon: Images, tone: RECORD_TONE.photo, label: 'Photos', value: recap.journal.photos, sub: recap.journal.selfies ? plural(recap.journal.selfies, 'selfie') : undefined },
    { icon: NotebookPen, tone: RECORD_TONE.note, label: 'Notes', value: recap.journal.notes },
    { icon: Sparkles, tone: RECORD_TONE.highlight, label: 'Highlights', value: recap.journal.highlights },
    { icon: PenLine, tone: RECORD_TONE.reflection, label: 'Reflections', value: recap.journal.reflections, sub: 'daily' },
    ...(recap.journal.places > 0 ? [{ icon: MapPin, tone: RECORD_TONE.place, label: 'Places', value: recap.journal.places }] : []),
    ...(recap.journal.focusSec > 0 ? [{ icon: Timer, tone: RECORD_TONE.focus, label: 'Focus', value: formatDuration(recap.journal.focusSec) }] : []),
  ]

  return (
    <Page width="wide">
      {header}

      {recap.empty ? (
        <div className="flex flex-col gap-4">
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
        <div className="flex flex-col gap-3">
          {/* Hero tiles */}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <MetricTile icon={CalendarCheck} label="Active days" value={`${recap.daily.activeDays} / ${recap.elapsedDays}`} sub="days with entries">
              <Delta d={cmp.activeDays} format={(v) => plural(v, 'day')} label={prevLabel} />
            </MetricTile>
            <MetricTile
              icon={AvgFace}
              label="Average mood"
              value={recap.daily.avgRating === null ? NONE : `${ratingFmt(recap.daily.avgRating)} / 5`}
              sub={recap.daily.ratedDays ? `from ${plural(recap.daily.ratedDays, 'rated day')}` : 'No days rated'}
            >
              <Delta d={cmp.avgRating} format={ratingFmt} label={prevLabel} />
            </MetricTile>
            <MetricTile icon={BookOpen} label="Study" value={formatDuration(recap.study.totalSec)} sub={plural(recap.study.sessions, 'session')} to="/study">
              <Delta d={cmp.studySec} format={(v) => formatDuration(v)} label={prevLabel} />
            </MetricTile>
            <MetricTile icon={Wallet} label="Spending" value={money(recap.expenses.total)} sub={plural(recap.expenses.count, 'expense')} to="/expenses">
              <Delta d={cmp.spending} format={money} label={prevLabel} />
            </MetricTile>
          </div>
          <p className="px-1 text-[11.5px] text-faint">{compareNote}</p>

          <div className="grid items-start gap-3 lg:grid-cols-2">
            <div className="flex flex-col gap-3">
              {/* Mood calendar */}
              {/* Grid sits on the page background so empty days stay visible. */}
              <section aria-labelledby="mood-cal-h">
                <div className="mb-2 flex items-center gap-2.5 px-1">
                  <IconTile icon={AvgFace} tone="accent" size="sm" />
                  <h2 id="mood-cal-h" className="flex-1 text-[14px] font-semibold">
                    Mood calendar
                  </h2>
                  {recap.daily.ratedDays > 0 && <span className="text-xs text-muted">{plural(recap.daily.ratedDays, 'rated day')}</span>}
                </div>
                <MonthGrid
                  month={month}
                  weekStartsOn={settings.weekStartsOn}
                  today={today()}
                  cells={moodCells}
                  onSelect={(d) => d <= today() && navigate(`/?d=${d}`)}
                />
                <MoodLegend className="mt-3" />
              </section>
              {recap.daily.bestDay && (
                <div className="rounded-[var(--radius-card)] border border-line bg-surface px-3 py-1">
                  <TimelineRow
                    time={formatDate(recap.daily.bestDay.date, 'd MMM')}
                    icon={Trophy}
                    tone="warn"
                    title="Best day"
                    subtitle={`${recap.daily.bestDay.rating}/5 · ${settings.ratingLabels[recap.daily.bestDay.rating - 1]}`}
                    to={`/?d=${recap.daily.bestDay.date}`}
                  />
                </div>
              )}

              <ChartCard
                title="Daily rating"
                subtitle="Unrated days are left as gaps"
                data={ratingData}
                valueHeader="Rating"
                empty={<p className="py-6 text-center text-[13px] text-muted">No days rated this month.</p>}
              >
                <LineChart data={ratingData} min={1} max={5} yTicks={[1, 3, 5]} formatValue={(v) => String(Math.round(v * 10) / 10)} />
              </ChartCard>

              {/* Tasks */}
              <SectionCard icon={CircleCheck} tone={RECORD_TONE.task} title="Tasks" aside={recap.tasks.outstanding ? <AsideLink to="/tasks">Review</AsideLink> : undefined}>
                <Minis>
                  <Mini label="Completed" value={recap.tasks.completed} sub={`of ${recap.tasks.scheduled}`} />
                  <Mini
                    label="Completion"
                    value={recap.tasks.completionRate === null ? NONE : `${Math.round(recap.tasks.completionRate * 100)}%`}
                    sub={recap.tasks.completionRate === null ? 'none scheduled' : undefined}
                  />
                  <Mini label="Still open" value={recap.tasks.outstanding} />
                </Minis>
                {cmp.tasksCompleted.delta !== null && (
                  <div className="px-1 pb-1">
                    <Delta d={cmp.tasksCompleted} format={(v) => `${plural(v, 'task')} completed`} label={prevLabel} />
                  </div>
                )}
                {recap.tasks.mostActiveDays.map((d) => (
                  <TimelineRow
                    key={d.date}
                    time={formatDate(d.date, 'd MMM')}
                    icon={CircleCheck}
                    tone={RECORD_TONE.task}
                    title={formatDate(d.date, 'EEEE')}
                    subtitle={`${plural(d.completed, 'task')} completed`}
                    to={`/?d=${d.date}`}
                  />
                ))}
              </SectionCard>

              {/* Highlights */}
              {monthHighlights.length > 0 && (
                <SectionCard
                  icon={Sparkles}
                  tone={RECORD_TONE.highlight}
                  title={plural(monthHighlights.length, 'highlight')}
                  aside={monthHighlights.length > 6 ? <AsideLink to="/highlights">See all</AsideLink> : undefined}
                >
                  {monthHighlights.slice(0, 6).map((h) => (
                    <TimelineRow
                      key={h.id}
                      time={formatDate(h.date, 'd MMM')}
                      icon={Sparkles}
                      tone={RECORD_TONE.highlight}
                      title={h.title}
                      subtitle={formatDate(h.date, 'EEEE')}
                      to={`/?d=${h.date}`}
                    />
                  ))}
                </SectionCard>
              )}
            </div>

            <div className="flex flex-col gap-3">
              {/* Study */}
              <SectionCard icon={BookOpen} tone={RECORD_TONE.study} title="Study" aside={<AsideLink to="/study">Open</AsideLink>}>
                <Minis>
                  <Mini label="Total" value={formatDuration(recap.study.totalSec)} sub={plural(recap.study.sessions, 'session')} />
                  <Mini
                    label="Per study day"
                    value={recap.study.avgPerStudyDaySec === null ? NONE : formatDuration(recap.study.avgPerStudyDaySec)}
                    sub={`${plural(recap.study.studyDays, 'day')} studied`}
                  />
                  <Mini
                    label="Per day"
                    value={recap.study.avgPerElapsedDaySec === null ? NONE : formatDuration(recap.study.avgPerElapsedDaySec)}
                    sub={`over ${plural(recap.elapsedDays, 'day')}`}
                  />
                </Minis>
                {recap.study.goalDaysMet !== null && (
                  <TimelineRow
                    icon={Trophy}
                    tone="success"
                    title={`Daily goal met on ${plural(recap.study.goalDaysMet, 'day')}`}
                    subtitle={`goal ${formatDuration(recap.study.goalMin * 60)} a day`}
                  />
                )}
                {recap.study.topSubjects.map((s) => (
                  <TimelineRow
                    key={s.id || 'none'}
                    icon={BookOpen}
                    tone={RECORD_TONE.study}
                    title={s.name}
                    subtitle="Most studied"
                    trailing={<span className="text-[13px] font-semibold tabular-nums">{formatDuration(s.sec)}</span>}
                  />
                ))}
              </SectionCard>

              <ChartCard
                title="Study time per day"
                subtitle={recap.study.goalMin ? `Minutes · the line marks your ${formatDuration(recap.study.goalMin * 60)} daily goal` : 'Minutes'}
                data={studyData}
                valueHeader="Minutes"
                formatValue={(v) => `${v}m`}
              >
                <ColumnChart data={studyData} formatValue={(v) => formatDuration(v * 60)} formatTick={(v) => `${Math.round(v)}m`} goal={recap.study.goalMin || undefined} />
              </ChartCard>

              {/* Spending */}
              <SectionCard icon={Wallet} tone={RECORD_TONE.expense} title="Spending" aside={<AsideLink to="/expenses">Open</AsideLink>}>
                <Minis>
                  <Mini label="Total" value={money(recap.expenses.total)} sub={plural(recap.expenses.count, 'expense')} />
                  <Mini label="Per day" value={recap.expenses.avgPerElapsedDay === null ? NONE : moneyAvg(recap.expenses.avgPerElapsedDay)} sub={`over ${plural(recap.elapsedDays, 'day')}`} />
                  <Mini
                    label="Highest day"
                    value={recap.expenses.highestDay ? money(recap.expenses.highestDay.amount) : NONE}
                    sub={recap.expenses.highestDay ? formatDate(recap.expenses.highestDay.date, 'd MMM') : undefined}
                  />
                </Minis>
                {recap.expenses.otherCurrencyCount > 0 && (
                  <Notice className="mb-2">
                    {plural(recap.expenses.otherCurrencyCount, 'expense')} in other currencies {recap.expenses.otherCurrencyCount === 1 ? 'is' : 'are'} not included in these totals.
                  </Notice>
                )}
                {recap.expenses.byCategory.map((c) => {
                  const pct = catTotal ? Math.round((c.amount / catTotal) * 100) : 0
                  return (
                    <TimelineRow
                      key={c.id}
                      icon={categoryIcon(catIcon.get(c.id))}
                      tone={RECORD_TONE.expense}
                      title={c.name}
                      subtitle={
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                            <span className="block h-full rounded-full bg-tile-2" style={{ width: `${Math.max(3, pct)}%` }} />
                          </span>
                          <span className="w-8 text-right tabular-nums">{pct}%</span>
                        </span>
                      }
                      trailing={<span className="text-[13px] font-semibold tabular-nums">{money(c.amount)}</span>}
                    />
                  )
                })}
              </SectionCard>

              {/* Photos & journaling */}
              <section aria-label="Photos and journaling" className={`grid gap-2 ${journalTiles.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                {journalTiles.map((t) => (
                  <div key={t.label} className="rounded-[var(--radius-card)] border border-line bg-surface p-3">
                    <IconTile icon={t.icon} tone={t.tone} size="sm" />
                    <div className="mt-2 font-display text-[18px] leading-tight font-semibold tabular-nums">{t.value}</div>
                    <div className="truncate text-[11.5px] text-muted">
                      {t.label}
                      {t.sub ? <span className="text-faint"> · {t.sub}</span> : null}
                    </div>
                  </div>
                ))}
              </section>

              {/* Consistency */}
              <SectionCard icon={Activity} tone="success" title="Consistency">
                <Minis cols={2}>
                  <Mini
                    label="Days with entries"
                    value={`${recap.consistency.activeDays} of ${recap.consistency.elapsedDays}`}
                    sub={recap.consistency.activeRate === null ? undefined : `${Math.round(recap.consistency.activeRate * 100)}%`}
                  />
                  <Mini label="Longest run" value={plural(recap.consistency.longestRun, 'day')} sub="in a row with entries" />
                </Minis>
                <div className="mx-auto max-w-sm py-1">
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
                <p className="px-1 pt-1 pb-1 text-[11.5px] text-faint">Days without entries just weren't logged — they aren't counted against you.</p>
                {recap.consistency.routines.map((r) => (
                  <TimelineRow
                    key={r.id}
                    icon={Repeat}
                    tone={RECORD_TONE.routine}
                    title={r.name}
                    subtitle="Routine"
                    trailing={
                      <span className="text-[13px] font-semibold tabular-nums">
                        {r.done} / {r.applicable}
                      </span>
                    }
                  />
                ))}
                {recap.consistency.screenTime.loggedDays > 0 && (
                  <TimelineRow
                    icon={Smartphone}
                    tone={RECORD_TONE.screentime}
                    title="Screen time"
                    subtitle={`${plural(recap.consistency.screenTime.loggedDays, 'logged day')}`}
                    trailing={
                      <span className="inline-flex items-center gap-1 text-[13px] font-semibold tabular-nums">
                        <Clock size={12} className="text-muted" aria-hidden />
                        avg {formatDuration((recap.consistency.screenTime.avgMin ?? 0) * 60)}
                      </span>
                    }
                    to="/screen-time"
                  />
                )}
              </SectionCard>
            </div>
          </div>

          <ReflectionSection month={month} recap={recap} highlights={monthHighlights} />
        </div>
      )}
    </Page>
  )
}

