import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, Check, Info, Maximize, Minimize, Pause, Play, Square, Timer, X } from 'lucide-react'
import { db } from '@/db/db'
import { discardTimer, elapsedMs, finishFocusTimer, pauseTimer, resumeTimer, startTimer, useTimer } from '@/db/timers'
import type { FocusSession } from '@/db/types'
import { formatTime, isoToLocalTime, relativeDayLabel, today, weekRange } from '@/lib/dates'
import { formatClock, formatDuration } from '@/lib/duration'
import { cn } from '@/lib/text'
import { useSettings } from '@/stores/settings'
import { confirmDialog, toast } from '@/stores/ui'
import { Button, Card, EmptyState, Field, Input, Notice, Page, PageHeader, Segmented, Select, StatTile } from '@/components/ui'
import { SubjectPicker, subjectMap, useSubjects } from '@/features/study/subjects'
import { createStudySession } from '@/features/study/sessions'
import { isNativeApp, showNativeNotification } from '@/platform/native'

type Preset = '25' | '50' | 'open' | 'custom'

function Ring({ progress, children }: { progress: number | null; children: React.ReactNode }) {
  const r = 46
  const c = 2 * Math.PI * r
  const p = progress === null ? 0 : Math.min(1, Math.max(0, progress))
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[18rem]">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--c-surface-3)" strokeWidth="2.5" />
        {progress !== null && (
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="var(--c-accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - p)}
            className="transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

function notifyDone(label: string) {
  const body = label ? `${label} — nice work.` : 'Nice work. Take a short break.'
  if (isNativeApp() && document.visibilityState !== 'visible' && showNativeNotification('Focus session complete', body)) return
  try {
    if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      new Notification('Focus session complete', { body: label ? `${label} — nice work.` : 'Nice work. Take a short break.', icon: '/icon.svg' })
      return
    }
  } catch {
    /* notifications unsupported */
  }
  toast('Focus time is up — nice work.', { tone: 'success' })
}

function ActiveFocus() {
  const { timer, elapsed } = useTimer('focus', 500)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFull, setIsFull] = useState(false)
  const [busy, setBusy] = useState(false)
  const notifiedFor = useRef<string | null>(null)
  const task = useLiveQuery(async () => (timer?.taskId ? db.tasks.get(timer.taskId) : undefined), [timer?.taskId])
  const subject = useLiveQuery(async () => (timer?.subjectId ? db.studySubjects.get(timer.subjectId) : undefined), [timer?.subjectId])

  const planned = timer?.plannedSec ? timer.plannedSec * 1000 : null
  const done = planned !== null && elapsed >= planned

  useEffect(() => {
    if (done && timer && notifiedFor.current !== timer.id) {
      notifiedFor.current = timer.id
      notifyDone(timer.label ?? '')
    }
  }, [done, timer])

  useEffect(() => {
    const onFs = () => setIsFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  if (!timer) return null
  const running = !!timer.runningSince
  const canFullscreen = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen

  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await containerRef.current?.requestFullscreen()
    } catch {
      toast('Full screen is not available here.')
    }
  }

  const end = async () => {
    if (busy) return
    setBusy(true)
    try {
      const sec = Math.round(elapsedMs(timer) / 1000)
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
      const saved = await finishFocusTimer(30)
      if (!saved && sec < 30) toast('Session was under 30 seconds, so it wasn’t saved.')
      if (saved) window.dispatchEvent(new CustomEvent('dj:focus-finished', { detail: saved }))
    } finally {
      setBusy(false)
    }
  }

  const display = planned === null ? formatClock(elapsed) : done ? `+${formatClock(elapsed - planned)}` : formatClock(planned - elapsed)

  return (
    <div ref={containerRef} className={cn('flex flex-col items-center', isFull && 'justify-center bg-bg p-8')}>
      <div className="mb-6 text-center">
        <p className="text-[15px] font-medium">{timer.label || (planned ? `${Math.round(planned / 60000)} minute focus` : 'Open focus')}</p>
        {(task || subject) && (
          <p className="mt-0.5 text-[13px] text-muted">
            {task ? task.title : ''}
            {task && subject ? ' · ' : ''}
            {subject ? subject.name : ''}
          </p>
        )}
      </div>
      <Ring progress={planned === null ? null : elapsed / planned}>
        <span className="text-[13px] text-muted">{done ? 'Time’s up' : running ? (planned ? 'Remaining' : 'Elapsed') : 'Paused'}</span>
        <span role="timer" aria-live="off" className="mt-1 text-5xl font-semibold tracking-tight tabular-nums">
          {display}
        </span>
        {done && <span className="mt-1 text-xs text-success">Planned time complete</span>}
      </Ring>
      <div className="mt-8 grid w-full max-w-sm grid-cols-2 gap-2">
        {running ? (
          <Button size="lg" icon={Pause} block onClick={() => pauseTimer('focus')}>
            Pause
          </Button>
        ) : (
          <Button size="lg" variant="subtle" icon={Play} block onClick={() => resumeTimer('focus')}>
            Resume
          </Button>
        )}
        <Button size="lg" variant="primary" icon={done ? Check : Square} block loading={busy} onClick={end}>
          {done ? 'Finish' : 'End'}
        </Button>
      </div>
      <div className="mt-3 flex items-center gap-1">
        {canFullscreen && (
          <Button size="sm" variant="ghost" icon={isFull ? Minimize : Maximize} onClick={toggleFull}>
            {isFull ? 'Exit full screen' : 'Full screen'}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          icon={X}
          onClick={() =>
            confirmDialog({
              title: 'Discard this focus session?',
              message: 'It will not be recorded.',
              confirmLabel: 'Discard',
              destructive: true,
              onConfirm: () => discardTimer('focus'),
            })
          }
        >
          Discard
        </Button>
      </div>
    </div>
  )
}

function Setup() {
  const [preset, setPreset] = useState<Preset>('25')
  const [custom, setCustom] = useState('30')
  const [label, setLabel] = useState('')
  const [taskId, setTaskId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const todayDate = today()
  const tasks = useLiveQuery(() => db.tasks.where('date').equals(todayDate).filter((t) => !t.completed).toArray(), [todayDate]) ?? []

  const start = async () => {
    let plannedSec: number | null = null
    if (preset === '25') plannedSec = 25 * 60
    else if (preset === '50') plannedSec = 50 * 60
    else if (preset === 'custom') {
      const m = Number(custom)
      if (!Number.isInteger(m) || m < 1 || m > 600) {
        setError('Enter whole minutes between 1 and 600.')
        return
      }
      plannedSec = m * 60
    }
    setError(null)
    setBusy(true)
    try {
      // Ask for notification permission only now, so we can tell you when time is up.
      if (plannedSec && 'Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission().catch(() => undefined)
      }
      await startTimer('focus', { plannedSec, label: label.trim() || undefined, taskId: taskId || null, subjectId: subjectId || null })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          start()
        }}
      >
        <div>
          <p id="focus-len" className="mb-1.5 text-[13px] font-medium text-muted">
            Length
          </p>
          <Segmented
            label="Focus length"
            value={preset}
            onChange={setPreset}
            className="w-full"
            options={[
              { value: '25', label: '25 min' },
              { value: '50', label: '50 min' },
              { value: 'open', label: 'Open' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
          {preset === '25' && <p className="mt-1.5 text-xs text-faint">Pomodoro: 25 minutes of focus, then a short break.</p>}
          {preset === 'open' && <p className="mt-1.5 text-xs text-faint">Counts up until you end it.</p>}
        </div>
        {preset === 'custom' && (
          <Field label="Minutes" error={error}>
            {(p) => <Input {...p} type="number" inputMode="numeric" min={1} max={600} value={custom} onChange={(e) => setCustom(e.target.value)} />}
          </Field>
        )}
        <Field label="What are you focusing on?" optional>
          {(p) => <Input {...p} value={label} maxLength={100} placeholder="e.g. Write report intro" onChange={(e) => setLabel(e.target.value)} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Link to a task" optional>
            {(p) => (
              <Select {...p} value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                <option value="">None</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Study subject" optional hint="Lets you log the time as study afterwards.">
            {(p) => <SubjectPicker id={p.id} value={subjectId} onChange={setSubjectId} />}
          </Field>
        </div>
        <Button type="submit" variant="primary" size="lg" icon={Play} loading={busy} block>
          Start focus
        </Button>
      </form>
    </Card>
  )
}

function FinishedCard({ session, onDone }: { session: FocusSession; onDone: () => void }) {
  const subject = useLiveQuery(async () => (session.subjectId ? db.studySubjects.get(session.subjectId) : undefined), [session.subjectId])
  const alreadyLogged = useLiveQuery(async () => !!(await db.studySessions.get(session.id)), [session.id])
  const [busy, setBusy] = useState(false)
  return (
    <Card className="p-5 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-success-soft text-success">
        <Check size={22} aria-hidden />
      </div>
      <p className="text-[17px] font-semibold">Focused for {formatDuration(session.durationSec, { seconds: true })}</p>
      <p className="mt-1 text-[13px] text-muted">{session.completed ? 'You completed the planned time.' : 'Saved to your focus history.'}</p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        {subject && !alreadyLogged && (
          <Button
            variant="subtle"
            icon={BookOpen}
            loading={busy}
            onClick={async () => {
              setBusy(true)
              try {
                // Same id as the focus session → can never be logged twice.
                await createStudySession({
                  id: session.id,
                  subjectId: session.subjectId,
                  topic: session.label,
                  date: session.date,
                  startedAt: session.startedAt,
                  endedAt: session.endedAt,
                  durationSec: session.durationSec,
                  tags: ['focus'],
                  completed: session.completed,
                  source: 'timer',
                })
                toast(`Logged as ${subject.name} study`, { tone: 'success' })
              } finally {
                setBusy(false)
              }
            }}
          >
            Also log as {subject.name} study
          </Button>
        )}
        {alreadyLogged && <p className="text-[13px] text-success">Logged as study time</p>}
        <Button variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </Card>
  )
}

export default function FocusPage() {
  const settings = useSettings()
  const { timer, loaded } = useTimer('focus', 60000)
  const [finished, setFinished] = useState<FocusSession | null>(null)
  const todayDate = today()
  const [wkStart, wkEnd] = weekRange(todayDate, settings.weekStartsOn)
  const recent = useLiveQuery(() => db.focusSessions.orderBy('date').reverse().limit(60).toArray(), []) ?? []
  const subjects = subjectMap(useSubjects())

  useEffect(() => {
    const onDone = (e: Event) => setFinished((e as CustomEvent<FocusSession>).detail)
    window.addEventListener('dj:focus-finished', onDone)
    return () => window.removeEventListener('dj:focus-finished', onDone)
  }, [])

  const todaySec = recent.filter((s) => s.date === todayDate).reduce((a, s) => a + s.durationSec, 0)
  const weekSec = recent.filter((s) => s.date >= wkStart && s.date <= wkEnd).reduce((a, s) => a + s.durationSec, 0)
  const history = [...recent].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 20)

  return (
    <Page>
      <PageHeader back="/more" title="Focus mode" subtitle="Optional · a quiet timer for deep work" />
      <div className="flex flex-col gap-4">
        {!loaded ? null : timer ? (
          <div className="py-4">
            <ActiveFocus />
          </div>
        ) : finished ? (
          <FinishedCard session={finished} onDone={() => setFinished(null)} />
        ) : (
          <Setup />
        )}

        <Notice icon={Info}>Focus mode doesn’t block other apps or websites — browsers don’t allow that. It gives you a calm, full-screen timer and records your focused time.</Notice>

        {!timer && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Focused today" value={formatDuration(todaySec)} />
              <StatTile label="This week" value={formatDuration(weekSec)} />
            </div>
            <section aria-labelledby="focus-history">
              <h2 id="focus-history" className="mb-2 text-[17px] font-semibold tracking-tight">
                History
              </h2>
              {history.length === 0 ? (
                <EmptyState compact icon={Timer} title="No focus sessions yet" />
              ) : (
                <Card className="px-4">
                  <ul className="divide-y divide-line">
                    {history.map((s) => (
                      <li key={s.id} className="flex min-h-14 items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px]">{s.label || (s.subjectId ? subjects.get(s.subjectId)?.name : null) || 'Focus session'}</p>
                          <p className="truncate text-xs text-muted">
                            {relativeDayLabel(s.date, settings.dateFormat)} · {formatTime(isoToLocalTime(s.startedAt))}
                            {s.plannedSec ? ` · planned ${formatDuration(s.plannedSec)}` : ' · open-ended'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[15px] font-medium tabular-nums">{formatDuration(s.durationSec, { seconds: true })}</p>
                          {s.plannedSec ? <p className={cn('text-xs', s.completed ? 'text-success' : 'text-faint')}>{s.completed ? 'Completed' : 'Ended early'}</p> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </section>
          </>
        )}
      </div>
    </Page>
  )
}
