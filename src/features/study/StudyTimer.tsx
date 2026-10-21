import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pause, Play, Square, X } from 'lucide-react'
import { db } from '@/db/db'
import { discardTimer, elapsedMs, finishStudyTimer, pauseTimer, resumeTimer, startTimer, useTimer } from '@/db/timers'
import { formatClock, formatDuration } from '@/lib/duration'
import { formatDate, isoToLocalDate, today } from '@/lib/dates'
import { Button, Card, Field, Input } from '@/components/ui'
import { confirmDialog, toast } from '@/stores/ui'
import { SubjectDot, SubjectPicker } from './subjects'

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
      <Card className="p-5">
        <h2 className="mb-3 text-[13px] font-medium text-muted">Study timer</h2>
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
          <Button type="submit" variant="primary" size="lg" icon={Play} loading={busy} block>
            Start studying
          </Button>
        </form>
      </Card>
    )
  }

  const running = !!timer.runningSince
  const startedDay = isoToLocalDate(timer.startedAt)
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[13px] text-muted">
          <span className={running ? 'h-2 w-2 animate-pulse rounded-full bg-success' : 'h-2 w-2 rounded-full bg-warn'} aria-hidden />
          {running ? 'Studying' : 'Paused'}
          {startedDay !== today() && <span className="text-faint">· started {formatDate(startedDay)}</span>}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[15px]">
        {subject && <SubjectDot color={subject.color} />}
        <span className="truncate font-medium">{subject?.name ?? 'No subject'}</span>
        {timer.topic && <span className="truncate text-muted">· {timer.topic}</span>}
      </div>
      <div className="my-4 text-center text-6xl font-semibold tracking-tight tabular-nums" role="timer" aria-live="off" aria-label={`Elapsed ${formatDuration(elapsed / 1000)}`}>
        {formatClock(elapsed)}
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        {running ? (
          <Button size="lg" icon={Pause} onClick={() => run(() => pauseTimer('study'))} disabled={busy}>
            Pause
          </Button>
        ) : (
          <Button size="lg" variant="subtle" icon={Play} onClick={() => run(() => resumeTimer('study'))} disabled={busy}>
            Resume
          </Button>
        )}
        <Button size="lg" variant="primary" icon={Square} onClick={() => run(endStudyTimer)} disabled={busy}>
          End & save
        </Button>
        <Button
          size="lg"
          variant="ghost"
          icon={X}
          aria-label="Discard session"
          title="Discard session"
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
