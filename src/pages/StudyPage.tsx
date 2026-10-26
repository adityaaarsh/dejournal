import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, CalendarCheck, Pencil, Plus, Settings2, X } from 'lucide-react'
import { db } from '@/db/db'
import { useTimer } from '@/db/timers'
import type { StudySession, StudySubject } from '@/db/types'
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
import { plural } from '@/lib/text'
import { consistency, describeChange, goalDaysMet, previousPeriod, secondsByDay, secondsBySubject, totalSeconds } from '@/domain/study'
import { updateSettings, useSettings } from '@/stores/settings'
import { openDialog } from '@/stores/ui'
import { ChartCard, ColumnChart } from '@/components/charts/Charts'
import { Button, Card, Chip, EmptyState, IconButton, Input, LoadingState, MetricTile, NavSquare, Page, PageHeader, SectionLabel, Segmented, TimelineRow } from '@/components/ui'
import { Ring } from '@/features/today/Cards'
import { StudyTimer } from '@/features/study/StudyTimer'
import { SubjectsSheet } from '@/features/study/SubjectsSheet'
import { CardHead, PeriodRow, StatStrip } from '@/features/study/PeriodRow'
import { subjectMap, subjectTone, useSubjects } from '@/features/study/subjects'

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
      className="flex flex-wrap items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        const total = (Number(h) || 0) * 60 + (Number(m) || 0)
        if (total >= 0 && total <= 24 * 60 * 7) onSave(Math.round(total))
        setEditing(false)
      }}
    >
      <Input aria-label={`${label} hours`} className="h-9 w-14 px-2 text-sm" type="number" min={0} value={h} onChange={(e) => setH(e.target.value)} autoFocus />
      <span className="text-xs text-muted">h</span>
      <Input aria-label={`${label} minutes`} className="h-9 w-14 px-2 text-sm" type="number" min={0} max={59} value={m} onChange={(e) => setM(e.target.value)} />
      <span className="text-xs text-muted">m</span>
      <Button type="submit" size="sm" variant="primary">
        Save
      </Button>
      <IconButton icon={X} label="Cancel" size="sm" onClick={() => setEditing(false)} />
    </form>
  )
}

function SessionRow({ s, subject, showTime }: { s: StudySession; subject?: StudySubject; showTime: boolean }) {
  const title = subject?.name ?? s.topic ?? 'Study session'
  const sub = [
    subject && s.topic ? s.topic : null,
    s.startedAt && s.endedAt ? `${formatTime(isoToLocalTime(s.startedAt))} – ${formatTime(isoToLocalTime(s.endedAt))}` : null,
    s.source === 'timer' ? 'Timer' : 'Logged',
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <li>
      <TimelineRow
        time={showTime ? (s.startedAt ? isoToLocalTime(s.startedAt) : '—') : undefined}
        icon={BookOpen}
        tone={subject ? subjectTone(subject) : 3}
        title={title}
        subtitle={sub}
        trailing={<span className="shrink-0 text-[13px] font-semibold tabular-nums">{formatDuration(s.durationSec)}</span>}
        onClick={() => openDialog({ kind: 'study', session: s })}
      />
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
        subtitle={`${formatDuration(weekSec)} this week · ${formatDuration(todaySec)} today`}
        actions={
          <>
            <NavSquare icon={Settings2} label="Manage subjects" onClick={() => setShowSubjects(true)} />
            <NavSquare icon={Plus} label="Log a study session" onClick={() => openDialog({ kind: 'study', date: filterDate ?? todayDate })} />
          </>
        }
      />
      <div className="flex flex-col gap-3">
        <StudyTimer />

        <div className="grid grid-cols-2 gap-2">
          <MetricTile
            icon={BookOpen}
            label="Today"
            className="relative"
            value={formatDuration(todaySec)}
            sub={
              runningToday >= 60 ? (
                <span className="text-accent">+ {formatDuration(runningToday)} running</span>
              ) : todayCount === 0 ? (
                'No sessions yet'
              ) : goalSec > 0 && todaySec >= goalSec ? (
                <span className="text-success">Goal reached</span>
              ) : (
                `${todayCount} ${todayCount === 1 ? 'session' : 'sessions'}`
              )
            }
          >
            {goalSec > 0 && <Ring value={todaySec} max={goalSec} className="absolute top-3 right-3" />}
            <div className="mt-2">
              <GoalEditor label="Daily goal" minutes={settings.studyGoalDailyMin} onSave={(m) => updateSettings({ studyGoalDailyMin: m })} />
            </div>
          </MetricTile>
          <MetricTile
            icon={CalendarCheck}
            label="This week"
            className="relative"
            value={formatDuration(weekSec)}
            sub={
              weeklyGoalSec > 0 ? (
                weekSec >= weeklyGoalSec ? (
                  <span className="text-success">Weekly goal reached</span>
                ) : (
                  `of ${formatDuration(weeklyGoalSec)}`
                )
              ) : (
                'No weekly goal'
              )
            }
          >
            {weeklyGoalSec > 0 && <Ring value={weekSec} max={weeklyGoalSec} className="absolute top-3 right-3" />}
            <div className="mt-2">
              <GoalEditor label="Weekly goal" minutes={settings.studyGoalWeeklyMin} onSave={(m) => updateSettings({ studyGoalWeeklyMin: m })} />
            </div>
          </MetricTile>
        </div>

        {/* Insights */}
        <section aria-labelledby="study-analytics" className="flex flex-col gap-3">
          <SectionLabel>
            <span id="study-analytics">Insights</span>
          </SectionLabel>
          <Segmented
            label="Period"
            className="w-full"
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
          <PeriodRow
            title={periodTitle}
            subtitle={describeChange(periodSec, prevSec, period.end >= todayDate ? `the same days ${periodLabel}` : periodLabel)}
            onPrev={() => setOffset((o) => o - 1)}
            onNext={() => setOffset((o) => o + 1)}
            prevLabel={`Previous ${range}`}
            nextLabel={`Next ${range}`}
            nextDisabled={offset >= 0}
          />
          <StatStrip
            items={[
              { label: 'Total', value: formatDuration(periodSec), sub: plural(bySubject.reduce((n, b) => n + b.count, 0), 'session') },
              { label: 'Days studied', value: cons.elapsed ? `${cons.studied}/${cons.elapsed}` : '—', sub: cons.elapsed ? 'so far' : 'not started' },
              {
                label: 'Goal days',
                value: settings.studyGoalDailyMin > 0 && cons.elapsed ? `${goalMet}/${cons.elapsed}` : '—',
                sub: settings.studyGoalDailyMin > 0 ? `≥ ${formatDuration(goalSec)}` : 'no goal',
              },
            ]}
          />
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
          <Card className="px-3 py-2">
            <CardHead title="By subject" meta={bySubject.length ? formatDuration(periodSec) : undefined} />
            {bySubject.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-muted">No sessions in this period.</p>
            ) : (
              <ul>
                {bySubject.map((b) => {
                  const subj = subjectsById.get(b.subjectId)
                  const pct = periodSec > 0 ? Math.round((b.seconds / periodSec) * 100) : 0
                  return (
                    <li key={b.subjectId || 'none'}>
                      <TimelineRow
                        icon={BookOpen}
                        tone={subj ? subjectTone(subj) : 5}
                        title={subj?.name ?? 'No subject'}
                        subtitle={`${b.count} ${b.count === 1 ? 'session' : 'sessions'} · ${pct}%`}
                        trailing={<span className="shrink-0 text-[13px] font-semibold tabular-nums">{formatDuration(b.seconds)}</span>}
                      />
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </section>

        {/* History */}
        <section aria-labelledby="study-history" className="flex flex-col gap-2">
          <SectionLabel
            action={
              filterDate ? (
                <Chip
                  active
                  onClick={() => {
                    params.delete('d')
                    setParams(params, { replace: true })
                  }}
                >
                  {formatDate(filterDate)} <X size={12} aria-label="Clear date filter" />
                </Chip>
              ) : undefined
            }
          >
            <span id="study-history">Sessions</span>
          </SectionLabel>
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
            <div className="flex flex-col gap-2">
              {groups.map((g) => (
                <Card key={g.date} className="px-3 py-2">
                  <CardHead
                    title={relativeDayLabel(g.date, settings.dateFormat)}
                    meta={formatDuration(g.items.reduce((s, x) => s + x.durationSec, 0))}
                    onAdd={() => openDialog({ kind: 'study', date: g.date })}
                  />
                  <ul>
                    {g.items.map((s) => (
                      <SessionRow key={s.id} s={s} showTime={g.items.some((x) => !!x.startedAt)} subject={s.subjectId ? subjectsById.get(s.subjectId) : undefined} />
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
