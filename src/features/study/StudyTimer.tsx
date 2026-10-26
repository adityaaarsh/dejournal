import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, Pause, Play, Square, Timer, X } from 'lucide-react'
import { db } from '@/db/db'
import { discardTimer, elapsedMs, finishStudyTimer, pauseTimer, resumeTimer, startTimer, useTimer } from '@/db/timers'
import { formatClock, formatDuration } from '@/lib/duration'
import { formatDate, isoToLocalDate, today } from '@/lib/dates'
import { Button, Card, Field, IconTile, Input, NavSquare } from '@/components/ui'
import { cn } from '@/lib/text'
import { confirmDialog, toast } from '@/stores/ui'
import { SubjectPicker, subjectTone } from './subjects'

/** Minimum length for a timer session to be saved. */
export const MIN_SESSION_SEC = 30

export async function endStudyTimer(): Promise<void> {
  const t = await db.kv.get('activeStudyTimer')
  const timer = t?.value as Parameters<typeof elapsedMs>[0] | undefined
  if (!timer) return
  const sec = Math.round(elapsedMs(timer) / 1000)
  const saved = await finishStudyTimer({}, MIN_SESSION_SEC)
  if (saved) toast(`Saved ${formatDuration(saved.durationSec)} of study`, { tone: 'success' })
  else if (sec < MIN_SESSION_SEC) toast(`Session was under ${MIN_SESSION_SEC} seconds, so it wasn't saved.`)
}

/** Start / pause / resume / end the persistent study timer. */
export function StudyTimer() {
  const { timer, elapsed, loaded } = useTimer('study')
  const [subjectId, setSubjectId] = useState('')
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState(false)
  const subject = useLiveQuery(async () => (timer?.subjectId ? db.studySubjects.get(timer.subjectId) : undefined), [timer?.subjectId])

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return <Card className="h-44 animate-pulse p-5" aria-busy="true" />

  if (!timer) {
    return (
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-3">
          <IconTile icon={Timer} tone={3} />
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold">Study timer</h2>
            <p className="text-xs text-muted">Keeps running if you close the app</p>
          </div>
          <span className="font-display text-[22px] font-semibold text-faint tabular-nums" aria-hidden>
            00:00
          </span>
        </div>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              await startTimer('study', { subjectId: subjectId || null, topic: topic.trim() || undefined })
              setTopic('')
            })
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Subject" optional>
              {(p) => <SubjectPicker id={p.id} value={subjectId} onChange={setSubjectId} />}
            </Field>
            <Field label="Topic" optional>
              {(p) => <Input {...p} value={topic} maxLength={120} placeholder="e.g. Binary trees" onChange={(e) => setTopic(e.target.value)} />}
            </Field>
          </div>
          <Button type="submit" variant="primary" size="lg" icon={Play} loading={busy} block className="rounded-full!">
            Start studying
          </Button>
        </form>
      </Card>
    )
  }

  const running = !!timer.runningSince
  const startedDay = isoToLocalDate(timer.startedAt)
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <IconTile icon={BookOpen} tone={subject ? subjectTone(subject) : 3} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">{subject?.name ?? 'No subject'}</p>
          <p className="truncate text-xs text-muted">{timer.topic || (startedDay !== today() ? `Started ${formatDate(startedDay)}` : 'Study session')}</p>
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
            running ? 'bg-success-soft text-success' : 'bg-warn-soft text-warn',
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', running ? 'animate-pulse bg-success' : 'bg-warn')} aria-hidden />
          {running ? 'Studying' : 'Paused'}
        </span>
      </div>
      <div
        className="my-5 text-center font-display text-[52px] leading-none font-semibold tracking-tight tabular-nums"
        role="timer"
        aria-live="off"
        aria-label={`Elapsed ${formatDuration(elapsed / 1000)}`}
      >
        {formatClock(elapsed)}
      </div>
      <div className="flex gap-2">
        {running ? (
          <Button size="lg" icon={Pause} onClick={() => run(() => pauseTimer('study'))} disabled={busy} className="flex-1 rounded-full!">
            Pause
          </Button>
        ) : (
          <Button size="lg" variant="subtle" icon={Play} onClick={() => run(() => resumeTimer('study'))} disabled={busy} className="flex-1 rounded-full!">
            Resume
          </Button>
        )}
        <Button size="lg" variant="primary" icon={Square} onClick={() => run(endStudyTimer)} disabled={busy} className="flex-1 rounded-full!">
          End & save
        </Button>
        <NavSquare
          icon={X}
          label="Discard session"
          className="h-12 w-12 rounded-full!"
          onClick={() =>
            confirmDialog({
              title: 'Discard this session?',
              message: `${formatDuration(elapsed / 1000, { seconds: true })} of study will not be saved.`,
              confirmLabel: 'Discard',
              destructive: true,
              onConfirm: () => discardTimer('study'),
            })
          }
        />
      </div>
      <p className="mt-3 text-center text-xs text-faint">Paused time isn't counted. The timer keeps going if you close or refresh the page.</p>
    </Card>
  )
}
