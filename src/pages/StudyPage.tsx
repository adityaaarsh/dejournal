import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, ChevronLeft, ChevronRight, Pencil, Plus, Settings2, X } from 'lucide-react'
import { db } from '@/db/db'
import { useTimer } from '@/db/timers'
import type { StudySession } from '@/db/types'
import {
  addDays,
  addMonthsKey,
  dateRange,
  formatDate,
  formatTime,
  isISODate,
  isoToLocalTime,
  monthEnd,
  monthKey,
  monthStart,
  relativeDayLabel,
  today,
  weekRange,
} from '@/lib/dates'
import { formatDuration } from '@/lib/duration'
import { consistency, describeChange, goalDaysMet, previousPeriod, secondsByDay, secondsBySubject, totalSeconds } from '@/domain/study'
import { updateSettings, useSettings } from '@/stores/settings'
import { openDialog } from '@/stores/ui'
import {
  BreakdownBars,
  ChartCard,
  ColumnChart,
} from '@/components/charts/Charts'
import { Button, Card, Chip, EmptyState, IconButton, Input, LoadingState, Page, PageHeader, ProgressBar, Segmented, StatTile } from '@/components/ui'
import { StudyTimer } from '@/features/study/StudyTimer'
import { SubjectsSheet } from '@/features/study/SubjectsSheet'
import { SubjectDot, subjectMap, useSubjects } from '@/features/study/subjects'

type Range = 'week' | 'month'

/** Small inline editor for a minutes goal. */
function GoalEditor({ label, minutes, onSave }: { label: string; minutes: number; onSave: (m: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [h, setH] = useState('')
  const [m, setM] = useState('')
  if (!editing)
    return (
      <button
        type="button"
        onClick={() => {
          setH(String(Math.floor(minutes / 60)))
          setM(String(minutes % 60))
          setEditing(true)
        }}
        className="inline-flex items-center gap-1 rounded-md text-xs text-muted hover:text-text"
      >
        {minutes > 0 ? `${label}: ${formatDuration(minutes * 60)}` : `Set ${label.toLowerCase()}`}
        <Pencil size={12} aria-hidden />
      </button>
    )
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        const total = (Number(h) || 0) * 60 + (Number(m) || 0)
        if (total >= 0 && total <= 24 * 60 * 7) onSave(Math.round(total))
        setEditing(false)
      }}
    >
      <Input aria-label={`${label} hours`} className="h-9 w-16 px-2 text-sm" type="number" min={0} value={h} onChange={(e) => setH(e.target.value)} autoFocus />
      <span className="text-xs text-muted">h</span>
      <Input aria-label={`${label} minutes`} className="h-9 w-16 px-2 text-sm" type="number" min={0} max={59} value={m} onChange={(e) => setM(e.target.value)} />
      <span className="text-xs text-muted">m</span>
      <Button type="submit" size="sm" variant="primary">
        Save
      </Button>
      <IconButton icon={X} label="Cancel" size="sm" onClick={() => setEditing(false)} />
    </form>
  )
}

function SessionRow({ s, subject }: { s: StudySession; subject?: { name: string; color: string } }) {
  const title = s.topic || subject?.name || 'Study session'
  return (
    <li>
      <button
        type="button"
        onClick={() => openDialog({ kind: 'study', session: s })}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-surface-2"
      >
        <SubjectDot color={subject?.color} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px]">{title}</span>
          <span className="block truncate text-xs text-muted">
            {s.topic && subject ? `${subject.name} · ` : ''}
            {s.startedAt && s.endedAt ? `${formatTime(isoToLocalTime(s.startedAt))} – ${formatTime(isoToLocalTime(s.endedAt))} · ` : ''}
            {s.source === 'timer' ? 'Timer' : 'Logged'}
          </span>
        </span>
        <span className="shrink-0 text-[15px] font-medium tabular-nums">{formatDuration(s.durationSec)}</span>
      </button>
    </li>
  )
}

export default function StudyPage() {
  const settings = useSettings()
  const [params, setParams] = useSearchParams()
  const dParam = params.get('d')
  const filterDate = isISODate(dParam) ? dParam : null
  const [range, setRange] = useState<Range>('week')
  const [offset, setOffset] = useState(0)
  const [showSubjects, setShowSubjects] = useState(false)
  const [limit, setLimit] = useState(20)
  const todayDate = today()

  const sessions = useLiveQuery(() => db.studySessions.toArray(), [])
  const subjects = useSubjects()
  const subjectsById = subjectMap(subjects)
  const { timer, elapsed } = useTimer('study', 15000)

  const period = useMemo(() => {
    if (range === 'week') {
      const [s, e] = weekRange(addDays(todayDate, offset * 7), settings.weekStartsOn)
      return { start: s, end: e }
    }
    const m = addMonthsKey(monthKey(todayDate), offset)
    return { start: monthStart(m), end: monthEnd(m) }
  }, [range, offset, todayDate, settings.weekStartsOn])

  if (!sessions) {
    return (
      <Page>
        <PageHeader back="/more" title="Study" />
        <LoadingState />
      </Page>
    )
  }

  const todaySec = totalSeconds(sessions, todayDate, todayDate)
  const todayCount = sessions.filter((s) => s.date === todayDate).length
  const runningToday = timer && timer.date === todayDate ? elapsed / 1000 : 0
  const goalSec = settings.studyGoalDailyMin * 60
  const [wkStart, wkEnd] = weekRange(todayDate, settings.weekStartsOn)
  const weekSec = totalSeconds(sessions, wkStart, wkEnd)
  const weeklyGoalSec = settings.studyGoalWeeklyMin * 60

  // Analytics for the selected period
  const prev = previousPeriod(period)
  const periodSec = totalSeconds(sessions, period.start, period.end)
  // Compare like with like: for the current period only count elapsed days of both.
  const elapsedEnd = period.end < todayDate ? period.end : todayDate
  const elapsedLen = dateRange(period.start, elapsedEnd).length
  const prevComparableEnd = elapsedLen > 0 ? addDays(prev.start, elapsedLen - 1) : prev.start
  const prevSec = totalSeconds(sessions, prev.start, period.end >= todayDate ? prevComparableEnd : prev.end)
  const periodLabel = range === 'week' ? 'last week' : 'last month'
  const cons = consistency(sessions, period, todayDate)
  const goalMet = goalDaysMet(sessions, period, settings.studyGoalDailyMin, todayDate)
  const byDay = secondsByDay(sessions, period.start, period.end)
  const chartData = Object.entries(byDay).map(([d, sec]) => ({
    label: range === 'week' ? formatDate(d, 'EEEEE') : String(Number(d.slice(8))),
    fullLabel: formatDate(d, 'EEE, d MMM'),
    value: d > todayDate ? null : Math.round(sec / 60),
  }))
  const bySubject = secondsBySubject(sessions, period.start, period.end)
  const periodTitle =
    range === 'week'
      ? offset === 0
        ? 'This week'
        : `${formatDate(period.start, 'd MMM')} – ${formatDate(period.end, 'd MMM')}`
      : formatDate(period.start, 'MMMM yyyy')

  // History
  const history = sessions
    .filter((s) => !filterDate || s.date === filterDate)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.startedAt ?? b.createdAt).localeCompare(a.startedAt ?? a.createdAt))
  const visible = history.slice(0, filterDate ? history.length : limit)
  const groups: Array<{ date: string; items: StudySession[] }> = []
  for (const s of visible) {
    const g = groups[groups.length - 1]
    if (g && g.date === s.date) g.items.push(s)
    else groups.push({ date: s.date, items: [s] })
  }

  return (
    <Page>
      <PageHeader
        back="/more"
        title="Study"
        actions={
          <>
            <IconButton icon={Settings2} label="Manage subjects" onClick={() => setShowSubjects(true)} />
            <IconButton icon={Plus} label="Log a study session" onClick={() => openDialog({ kind: 'study', date: filterDate ?? todayDate })} />
          </>
        }
      />
      <div className="flex flex-col gap-4">
        <StudyTimer />

        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[13px] text-muted">Study time today</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
                {formatDuration(todaySec)}
                {runningToday >= 60 && <span className="ml-2 text-sm font-normal text-accent">+ {formatDuration(runningToday)} running</span>}
              </div>
              <div className="mt-0.5 text-xs text-faint">
                {todayCount === 0 ? 'No sessions saved yet' : `${todayCount} ${todayCount === 1 ? 'session' : 'sessions'}`}
                {goalSec > 0 && todaySec >= goalSec && <span className="text-success"> · Daily goal reached</span>}
              </div>
            </div>
            <GoalEditor label="Daily goal" minutes={settings.studyGoalDailyMin} onSave={(m) => updateSettings({ studyGoalDailyMin: m })} />
          </div>
          {goalSec > 0 && (
            <div className="mt-3">
              <ProgressBar value={todaySec} max={goalSec} label="Progress toward daily study goal" tone={todaySec >= goalSec ? 'success' : 'accent'} />
              <p className="mt-1.5 text-xs text-faint">
                {todaySec >= goalSec ? `${formatDuration(todaySec - goalSec)} over your goal` : `${formatDuration(goalSec - todaySec)} to go`} · counts saved sessions only
              </p>
            </div>
          )}
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
            <div className="text-[13px]">
              <span className="text-muted">This week </span>
              <span className="font-medium tabular-nums">{formatDuration(weekSec)}</span>
              {weeklyGoalSec > 0 && <span className="text-faint"> / {formatDuration(weeklyGoalSec)}</span>}
            </div>
            <GoalEditor label="Weekly goal" minutes={settings.studyGoalWeeklyMin} onSave={(m) => updateSettings({ studyGoalWeeklyMin: m })} />
          </div>
          {weeklyGoalSec > 0 && (
            <div className="mt-2">
              <ProgressBar value={weekSec} max={weeklyGoalSec} label="Progress toward weekly study goal" tone={weekSec >= weeklyGoalSec ? 'success' : 'accent'} />
            </div>
          )}
        </Card>

        {/* Analytics */}
        <section aria-labelledby="study-analytics" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="study-analytics" className="text-[17px] font-semibold tracking-tight">
              Insights
            </h2>
            <Segmented
              label="Period"
              size="sm"
              value={range}
              onChange={(r) => {
                setRange(r)
                setOffset(0)
              }}
              options={[
                { value: 'week', label: 'Week' },
                { value: 'month', label: 'Month' },
              ]}
            />
          </div>
          <div className="flex items-center justify-between">
            <IconButton icon={ChevronLeft} label={`Previous ${range}`} size="sm" onClick={() => setOffset((o) => o - 1)} />
            <span className="text-sm font-medium">{periodTitle}</span>
            <IconButton icon={ChevronRight} label={`Next ${range}`} size="sm" onClick={() => setOffset((o) => o + 1)} disabled={offset >= 0} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Total" value={formatDuration(periodSec)} sub={describeChange(periodSec, prevSec, period.end >= todayDate ? `the same days ${periodLabel}` : periodLabel)} />
            <StatTile label="Consistency" value={cons.elapsed ? `${cons.studied}/${cons.elapsed}` : '—'} sub={cons.elapsed ? 'days studied so far' : 'Period not started'} />
            <StatTile
              label="Goal days"
              value={settings.studyGoalDailyMin > 0 && cons.elapsed ? `${goalMet}/${cons.elapsed}` : '—'}
              sub={settings.studyGoalDailyMin > 0 ? `days with ≥ ${formatDuration(goalSec)}` : 'No daily goal set'}
              className="col-span-2 sm:col-span-1"
            />
          </div>
          <ChartCard
            title="Minutes per day"
            subtitle={settings.studyGoalDailyMin > 0 ? `Line shows your daily goal (${formatDuration(goalSec)})` : undefined}
            data={chartData}
            valueHeader="Minutes"
            formatValue={(v) => formatDuration(v * 60)}
          >
            <ColumnChart
              data={chartData}
              formatValue={(v) => formatDuration(v * 60)}
              formatTick={(v) => formatDuration(Math.round(v) * 60)}
              goal={settings.studyGoalDailyMin || undefined}
            />
          </ChartCard>
          <Card className="p-4">
            <h3 className="mb-3 text-[15px] font-medium">By subject</h3>
            {bySubject.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-muted">No sessions in this period.</p>
            ) : (
              <BreakdownBars
                formatValue={(v) => formatDuration(v)}
                items={bySubject.map((b) => {
                  const subj = subjectsById.get(b.subjectId)
                  return {
                    key: b.subjectId || 'none',
                    label: subj?.name ?? 'No subject',
                    value: b.seconds,
                    icon: <SubjectDot color={subj?.color} />,
                    sub: `${b.count} ${b.count === 1 ? 'session' : 'sessions'}`,
                  }
                })}
              />
            )}
          </Card>
        </section>

        {/* History */}
        <section aria-labelledby="study-history">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 id="study-history" className="text-[17px] font-semibold tracking-tight">
              Sessions
            </h2>
            {filterDate && (
              <Chip
                active
                onClick={() => {
                  params.delete('d')
                  setParams(params, { replace: true })
                }}
              >
                {formatDate(filterDate)} <X size={12} aria-label="Clear date filter" />
              </Chip>
            )}
          </div>
          {groups.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title={filterDate ? 'No study sessions on this day' : 'No study sessions yet'}
              description="Start the timer above or log a session you already did."
              action={
                <Button size="sm" variant="subtle" icon={Plus} onClick={() => openDialog({ kind: 'study', date: filterDate ?? todayDate })}>
                  Log session
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {groups.map((g) => (
                <Card key={g.date} className="px-2 py-2">
                  <div className="flex items-center justify-between px-2 pt-1 pb-1 text-[13px]">
                    <span className="font-medium text-muted">{relativeDayLabel(g.date, settings.dateFormat)}</span>
                    <span className="text-faint tabular-nums">{formatDuration(g.items.reduce((s, x) => s + x.durationSec, 0))}</span>
                  </div>
                  <ul>
                    {g.items.map((s) => (
                      <SessionRow key={s.id} s={s} subject={s.subjectId ? subjectsById.get(s.subjectId) : undefined} />
                    ))}
                  </ul>
                </Card>
              ))}
              {!filterDate && history.length > limit && (
                <Button variant="ghost" onClick={() => setLimit((l) => l + 30)}>
                  Show more
                </Button>
              )}
            </div>
          )}
        </section>
      </div>
      {showSubjects && <SubjectsSheet onClose={() => setShowSubjects(false)} />}
    </Page>
  )
}
