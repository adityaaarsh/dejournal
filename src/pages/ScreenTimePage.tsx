import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, Info, Pencil, Plus, Smartphone, Trash } from 'lucide-react'
import { db } from '@/db/db'
import type { ScreenTimeRecord } from '@/db/types'
import { addDays, addMonthsKey, formatDate, isISODate, monthEnd, monthKey, monthStart, relativeDayLabel, today, weekRange } from '@/lib/dates'
import { formatDuration } from '@/lib/duration'
import { nowISO, uid } from '@/lib/id'
import { describeChange, previousPeriod } from '@/domain/study'
import { updateSettings, useSettings } from '@/stores/settings'
import { toast, undoToast } from '@/stores/ui'
import { ChartCard, ColumnChart } from '@/components/charts/Charts'
import { Button, Card, EmptyState, Field, IconButton, Input, Notice, Page, PageHeader, Segmented, Sheet, StatTile, Textarea } from '@/components/ui'
import { isNativeApp } from '@/platform/native'
import { PhoneUsageSync } from '@/features/screentime/PhoneUsageSync'

type Range = 'week' | 'month'

/** Insert or replace the record for a date (one per date). */
async function upsertScreenTime(date: string, minutes: number, note: string | undefined, replacingId?: string) {
  await db.transaction('rw', db.screenTime, async () => {
    const existing = await db.screenTime.where('date').equals(date).first()
    // If the date changed on edit, remove the old row.
    if (replacingId && existing?.id !== replacingId) await db.screenTime.delete(replacingId)
    const now = nowISO()
    await db.screenTime.put({
      id: existing?.id ?? replacingId ?? uid(),
      date,
      minutes,
      note,
      source: existing?.source ?? 'manual',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
  })
}

async function deleteScreenTime(id: string) {
  const rec = await db.screenTime.get(id)
  if (!rec) return
  await db.screenTime.delete(id)
  undoToast('Entry deleted', async () => {
    await db.screenTime.put(rec)
  })
}

function EntrySheet({ record, defaultDate, onClose }: { record?: ScreenTimeRecord; defaultDate: string; onClose: () => void }) {
  const [date, setDate] = useState(record?.date ?? defaultDate)
  const [hours, setHours] = useState(record ? String(Math.floor(record.minutes / 60)) : '')
  const [minutes, setMinutes] = useState(record ? String(record.minutes % 60) : '')
  const [note, setNote] = useState(record?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const existingForDate = useLiveQuery(() => (isISODate(date) ? db.screenTime.where('date').equals(date).first() : undefined), [date])
  const willReplace = existingForDate && existingForDate.id !== record?.id

  const save = async () => {
    if (saving) return
    const h = hours.trim() === '' ? 0 : Number(hours)
    const m = minutes.trim() === '' ? 0 : Number(minutes)
    if (!isISODate(date)) return setError('Pick a valid date.')
    if (date > today()) return setError('You can only log today or earlier.')
    if (![h, m].every((x) => Number.isInteger(x) && x >= 0)) return setError('Use whole numbers for hours and minutes.')
    const total = h * 60 + m
    if (total <= 0) return setError('Enter how much screen time you had.')
    if (total > 24 * 60) return setError('A day has at most 24 hours.')
    setError(null)
    setSaving(true)
    try {
      await upsertScreenTime(date, total, note.trim() || undefined, record?.id)
      toast('Screen time saved', { tone: 'success' })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      title={record ? 'Edit screen time' : 'Log screen time'}
      description="Copy the total from your phone's Digital Wellbeing or Screen Time settings."
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          {record && (
            <Button
              variant="danger"
              icon={Trash}
              className="mr-auto"
              onClick={async () => {
                await deleteScreenTime(record.id)
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
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Date" hint={willReplace ? `This replaces the ${formatDuration(existingForDate!.minutes * 60)} already logged for that day.` : undefined}>
          {(p) => <Input {...p} type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hours">
            {(p) => <Input {...p} aria-invalid={error ? true : undefined} autoFocus type="number" inputMode="numeric" min={0} max={24} placeholder="0" value={hours} onChange={(e) => setHours(e.target.value)} />}
          </Field>
          <Field label="Minutes">
            {(p) => <Input {...p} aria-invalid={error ? true : undefined} type="number" inputMode="numeric" min={0} max={59} placeholder="0" value={minutes} onChange={(e) => setMinutes(e.target.value)} />}
          </Field>
        </div>
        {error && (
          <p role="alert" className="-mt-2 text-xs text-danger">
            {error}
          </p>
        )}
        <Field label="Note" optional>
          {(p) => <Textarea {...p} rows={2} maxLength={500} value={note} placeholder="e.g. Mostly video calls" onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
    </Sheet>
  )
}

function GoalSheet({ minutes, onClose }: { minutes: number; onClose: () => void }) {
  const [h, setH] = useState(minutes ? String(Math.floor(minutes / 60)) : '')
  const [m, setM] = useState(minutes ? String(minutes % 60) : '')
  const [error, setError] = useState<string | null>(null)
  return (
    <Sheet
      title="Daily screen-time goal"
      description="A limit you'd like to stay under. Leave empty for no goal."
      size="sm"
      onClose={onClose}
      onSubmit={async () => {
        const total = (Number(h) || 0) * 60 + (Number(m) || 0)
        if (!Number.isFinite(total) || total < 0 || total > 24 * 60) return setError('Enter a goal between 0 and 24 hours.')
        await updateSettings({ screenTimeGoalMin: Math.round(total) })
        toast(total ? 'Goal saved' : 'Goal removed', { tone: 'success' })
        onClose()
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            Save goal
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Hours" error={error}>
          {(p) => <Input {...p} autoFocus type="number" min={0} max={24} value={h} onChange={(e) => setH(e.target.value)} />}
        </Field>
        <Field label="Minutes">
          {(p) => <Input {...p} type="number" min={0} max={59} value={m} onChange={(e) => setM(e.target.value)} />}
        </Field>
      </div>
    </Sheet>
  )
}

export default function ScreenTimePage() {
  const settings = useSettings()
  const todayDate = today()
  const [range, setRange] = useState<Range>('week')
  const [offset, setOffset] = useState(0)
  const [editing, setEditing] = useState<ScreenTimeRecord | 'new' | null>(null)
  const [goalOpen, setGoalOpen] = useState(false)
  const records = useLiveQuery(() => db.screenTime.toArray(), []) ?? []
  const byDate = new Map(records.map((r) => [r.date, r]))
  const goal = settings.screenTimeGoalMin

  const period = useMemo(() => {
    if (range === 'week') {
      const [s, e] = weekRange(addDays(todayDate, offset * 7), settings.weekStartsOn)
      return { start: s, end: e }
    }
    const m = addMonthsKey(monthKey(todayDate), offset)
    return { start: monthStart(m), end: monthEnd(m) }
  }, [range, offset, todayDate, settings.weekStartsOn])

  const inPeriod = records.filter((r) => r.date >= period.start && r.date <= period.end)
  const totalMin = inPeriod.reduce((s, r) => s + r.minutes, 0)
  // Average only over days you actually logged — unlogged days are unknown, not zero.
  const avgMin = inPeriod.length ? Math.round(totalMin / inPeriod.length) : null
  const prev = previousPeriod(period)
  const prevLogged = records.filter((r) => r.date >= prev.start && r.date <= prev.end)
  const prevAvg = prevLogged.length ? Math.round(prevLogged.reduce((s, r) => s + r.minutes, 0) / prevLogged.length) : 0
  const underGoal = goal > 0 ? inPeriod.filter((r) => r.minutes <= goal).length : 0

  const chartData: Array<{ label: string; fullLabel: string; value: number | null }> = []
  for (let d = period.start; d <= period.end; d = addDays(d, 1)) {
    chartData.push({
      label: range === 'week' ? formatDate(d, 'EEEEE') : String(Number(d.slice(8))),
      fullLabel: formatDate(d, 'EEE, d MMM'),
      value: byDate.get(d)?.minutes ?? null,
    })
  }
  const todayRec = byDate.get(todayDate)
  const history = [...records].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30)
  const periodTitle =
    range === 'week' ? (offset === 0 ? 'This week' : `${formatDate(period.start, 'd MMM')} – ${formatDate(period.end, 'd MMM')}`) : formatDate(period.start, 'MMMM yyyy')

  return (
    <Page>
      <PageHeader
        back="/more"
        title="Screen time"
        subtitle={isNativeApp() ? 'Optional · from your phone or logged by hand' : 'Optional · logged manually'}
        actions={<IconButton icon={Plus} label="Log screen time" onClick={() => setEditing('new')} />}
      />
      <div className="flex flex-col gap-4">
        {isNativeApp() ? (
          <PhoneUsageSync />
        ) : (
          <Notice icon={Info} title="Manual logging">
            Browsers can’t read your phone or computer’s screen-time data, so DeJournal only shows what you log here. Automatic tracking is available in the
            DeJournal Android app, which reads Android’s usage stats with your permission.
          </Notice>
        )}

        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[13px] text-muted">Today</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{todayRec ? formatDuration(todayRec.minutes * 60) : 'Not logged'}</div>
              {goal > 0 && todayRec && (
                <div className={`mt-0.5 text-xs ${todayRec.minutes <= goal ? 'text-success' : 'text-warn'}`}>
                  {todayRec.minutes <= goal ? `${formatDuration((goal - todayRec.minutes) * 60)} under your goal` : `${formatDuration((todayRec.minutes - goal) * 60)} over your goal`}
                </div>
              )}
            </div>
            <Button size="sm" variant={todayRec ? 'secondary' : 'subtle'} icon={todayRec ? Pencil : Plus} onClick={() => setEditing(todayRec ?? 'new')}>
              {todayRec ? 'Edit' : 'Log today'}
            </Button>
          </div>
          <div className="mt-3 border-t border-line pt-3">
            <button type="button" onClick={() => setGoalOpen(true)} className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
              {goal > 0 ? `Daily goal: under ${formatDuration(goal * 60)}` : 'Set a daily goal'} <Pencil size={12} aria-hidden />
            </button>
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <IconButton icon={ChevronLeft} label={`Previous ${range}`} size="sm" onClick={() => setOffset((o) => o - 1)} />
            <span className="min-w-28 text-center text-sm font-medium">{periodTitle}</span>
            <IconButton icon={ChevronRight} label={`Next ${range}`} size="sm" onClick={() => setOffset((o) => o + 1)} disabled={offset >= 0} />
          </div>
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

        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Daily average"
            value={avgMin === null ? '—' : formatDuration(avgMin * 60)}
            sub={avgMin === null ? 'Nothing logged' : `${describeChange(avgMin, prevAvg, range === 'week' ? 'previous week' : 'previous month')}`}
          />
          <StatTile
            label={goal > 0 ? 'Days under goal' : 'Days logged'}
            value={goal > 0 ? `${underGoal}/${inPeriod.length}` : String(inPeriod.length)}
            sub={goal > 0 ? 'of days logged' : `Average uses logged days only`}
          />
        </div>

        <ChartCard
          title="Screen time per day"
          subtitle={goal > 0 ? `Line shows your goal (${formatDuration(goal * 60)}). Gaps are days you didn't log.` : "Gaps are days you didn't log."}
          data={chartData}
          valueHeader="Screen time"
          formatValue={(v) => formatDuration(v * 60)}
        >
          <ColumnChart
            data={chartData}
            formatValue={(v) => formatDuration(v * 60)}
            formatTick={(v) => formatDuration(Math.round(v) * 60)}
            goal={goal || undefined}
          />
        </ChartCard>

        <section aria-labelledby="st-history">
          <h2 id="st-history" className="mb-2 text-[17px] font-semibold tracking-tight">
            Logged days
          </h2>
          {history.length === 0 ? (
            <EmptyState
              icon={Smartphone}
              title="Nothing logged yet"
              description="Add a day's total to start seeing trends."
              action={
                <Button size="sm" variant="subtle" icon={Plus} onClick={() => setEditing('new')}>
                  Log screen time
                </Button>
              }
            />
          ) : (
            <Card className="px-2 py-1">
              <ul className="divide-y divide-line">
                {history.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setEditing(r)} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-surface-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px]">{relativeDayLabel(r.date, settings.dateFormat)}</span>
                        {r.note && <span className="block truncate text-xs text-muted">{r.note}</span>}
                      </span>
                      <span className={`shrink-0 text-[15px] font-medium tabular-nums ${goal > 0 && r.minutes > goal ? 'text-warn' : ''}`}>{formatDuration(r.minutes * 60)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      </div>
      {editing && <EntrySheet record={editing === 'new' ? undefined : editing} defaultDate={todayDate} onClose={() => setEditing(null)} />}
      {goalOpen && <GoalSheet minutes={goal} onClose={() => setGoalOpen(false)} />}
    </Page>
  )
}
