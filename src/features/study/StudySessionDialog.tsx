import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Play, Timer, Trash } from 'lucide-react'
import { db } from '@/db/db'
import { startTimer, useTimer } from '@/db/timers'
import type { StudySession } from '@/db/types'
import { atTime, isISODate, isoToLocalDate, isoToLocalTime, today } from '@/lib/dates'
import { formatClock, formatDuration } from '@/lib/duration'
import { findOverlaps } from '@/domain/study'
import { Button, Field, Input, Notice, Segmented, Sheet, TagInput, Textarea, Toggle } from '@/components/ui'
import { toast } from '@/stores/ui'
import type { DialogProps } from '@/features/quick/DialogHost'
import { SubjectPicker, useSubjects } from './subjects'
import { createStudySession, deleteStudySession, updateStudySession } from './sessions'

type Mode = 'timer' | 'manual'
type Entry = 'duration' | 'times'

const MAX_SEC = 24 * 3600

export default function StudySessionDialog({ request, onClose }: DialogProps<'study'>) {
  const editing = request.session
  const [mode, setMode] = useState<Mode>(editing ? 'manual' : 'timer')
  const { timer } = useTimer('study')

  return (
    <Sheet
      title={editing ? 'Edit study session' : 'Study session'}
      onClose={onClose}
      description={editing ? undefined : 'Time a session live, or log one you already did.'}
    >
      {!editing && (
        <Segmented
          label="How to record"
          value={mode}
          onChange={setMode}
          className="mb-5 w-full"
          options={[
            { value: 'timer', label: 'Start timer', icon: <Play size={15} aria-hidden /> },
            { value: 'manual', label: 'Log manually', icon: <Timer size={15} aria-hidden /> },
          ]}
        />
      )}
      {mode === 'timer' && !editing ? (
        timer ? (
          <RunningTimerNotice onClose={onClose} />
        ) : (
          <StartTimerForm onClose={onClose} />
        )
      ) : (
        <ManualForm session={editing} defaultDate={request.date} onClose={onClose} />
      )}
    </Sheet>
  )
}

function RunningTimerNotice({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { timer, elapsed } = useTimer('study')
  const subjects = useSubjects()
  const subject = subjects?.find((s) => s.id === timer?.subjectId)
  return (
    <Notice
      icon={Timer}
      tone="accent"
      title="A study timer is already running"
      action={
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            onClose()
            navigate('/study')
          }}
        >
          Open Study
        </Button>
      }
    >
      <span className="tabular-nums">{formatClock(elapsed)}</span>
      {subject ? ` · ${subject.name}` : ''}
      {timer?.topic ? ` · ${timer.topic}` : ''}
      {timer && !timer.runningSince ? ' (paused)' : ''}
    </Notice>
  )
}

function StartTimerForm({ onClose }: { onClose: () => void }) {
  const [subjectId, setSubjectId] = useState('')
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState(false)
  const start = async () => {
    if (busy) return
    setBusy(true)
    try {
      await startTimer('study', { subjectId: subjectId || null, topic: topic.trim() || undefined })
      toast('Study timer started', { tone: 'success' })
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        start()
      }}
    >
      <Field label="Subject" optional>
        {(p) => <SubjectPicker id={p.id} value={subjectId} onChange={setSubjectId} />}
      </Field>
      <Field label="Topic" optional>
        {(p) => <Input {...p} value={topic} maxLength={120} placeholder="e.g. Dynamic programming" onChange={(e) => setTopic(e.target.value)} />}
      </Field>
      <Button type="submit" variant="primary" size="lg" icon={Play} loading={busy} block>
        Start timer
      </Button>
    </form>
  )
}

function ManualForm({ session, defaultDate, onClose }: { session?: StudySession; defaultDate?: string; onClose: () => void }) {
  const hasTimes = !!(session?.startedAt && session?.endedAt)
  const [subjectId, setSubjectId] = useState(session?.subjectId ?? '')
  const [topic, setTopic] = useState(session?.topic ?? '')
  const [date, setDate] = useState(session?.date ?? defaultDate ?? today())
  const [entry, setEntry] = useState<Entry>(session?.source === 'manual' && hasTimes ? 'times' : 'duration')
  const [hours, setHours] = useState(session ? String(Math.floor(session.durationSec / 3600)) : '')
  const [minutes, setMinutes] = useState(session ? String(Math.round((session.durationSec % 3600) / 60)) : '')
  const [startTime, setStartTime] = useState(session?.startedAt ? isoToLocalTime(session.startedAt) : '')
  const [endTime, setEndTime] = useState(session?.endedAt ? isoToLocalTime(session.endedAt) : '')
  const [goal, setGoal] = useState(session?.goal ?? '')
  const [notes, setNotes] = useState(session?.notes ?? '')
  const [tags, setTags] = useState<string[]>(session?.tags ?? [])
  const [completed, setCompleted] = useState(session?.completed ?? true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [showMore, setShowMore] = useState(!!(session?.notes || session?.goal || session?.tags.length))

  const sameDay = useLiveQuery(() => (isISODate(date) ? db.studySessions.where('date').equals(date).toArray() : []), [date]) ?? []

  // Clear stale field errors as the user edits.
  useEffect(() => setErrors({}), [entry])

  const computed = useMemo(() => {
    if (entry === 'duration') {
      const h = hours.trim() === '' ? 0 : Number(hours)
      const m = minutes.trim() === '' ? 0 : Number(minutes)
      if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || m < 0 || !Number.isInteger(h) || !Number.isInteger(m)) return { error: 'Use whole numbers for hours and minutes.' }
      const sec = h * 3600 + m * 60
      if (sec <= 0) return { error: 'Enter how long you studied.' }
      if (sec > MAX_SEC) return { error: 'A session can be at most 24 hours.' }
      // Keep an existing timed session's clock times if its date is unchanged.
      const keep = session && hasTimes && session.date === date
      return {
        sec,
        startedAt: keep ? session!.startedAt! : null,
        endedAt: keep ? session!.endedAt! : null,
      }
    }
    if (!startTime || !endTime) return { error: 'Enter a start and end time.' }
    if (!isISODate(date)) return { error: 'Pick a valid date.' }
    const a = atTime(date, startTime)
    const b = atTime(date, endTime)
    if (b <= a) return { error: 'End time must be after start time (sessions past midnight: log them as a duration).' }
    const sec = Math.round((b.getTime() - a.getTime()) / 1000)
    return { sec, startedAt: a.toISOString(), endedAt: b.toISOString() }
  }, [entry, hours, minutes, startTime, endTime, date, session, hasTimes])

  const overlaps = 'sec' in computed && computed.startedAt && computed.endedAt ? findOverlaps({ startedAt: computed.startedAt, endedAt: computed.endedAt }, sameDay, session?.id) : []

  const save = async () => {
    if (saving) return
    const errs: Record<string, string> = {}
    if (!isISODate(date)) errs.date = 'Pick a valid date.'
    if ('error' in computed) errs.time = computed.error!
    else if (overlaps.length) errs.time = `This overlaps a session from ${isoToLocalTime(overlaps[0].startedAt!)} to ${isoToLocalTime(overlaps[0].endedAt!)}.`
    setErrors(errs)
    if (Object.keys(errs).length || 'error' in computed) return
    setSaving(true)
    try {
      const data = {
        subjectId: subjectId || null,
        topic: topic.trim() || undefined,
        date,
        durationSec: computed.sec!,
        startedAt: computed.startedAt ?? null,
        endedAt: computed.endedAt ?? null,
        goal: goal.trim() || undefined,
        notes: notes.trim() || undefined,
        tags,
        completed,
      }
      if (session) {
        await updateStudySession(session.id, data)
        toast('Session updated', { tone: 'success' })
      } else {
        await createStudySession({ ...data, source: 'manual' })
        toast(`Logged ${formatDuration(data.durationSec)} of study`, { tone: 'success' })
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Subject" optional>
          {(p) => <SubjectPicker id={p.id} value={subjectId} onChange={setSubjectId} />}
        </Field>
        <Field label="Topic" optional>
          {(p) => <Input {...p} value={topic} maxLength={120} placeholder="What did you study?" onChange={(e) => setTopic(e.target.value)} />}
        </Field>
      </div>
      <Field label="Date" error={errors.date}>
        {(p) => <Input {...p} type="date" value={date} max="2100-12-31" onChange={(e) => setDate(e.target.value)} />}
      </Field>

      <div className="flex flex-col gap-2">
        <Segmented
          label="Enter time as"
          size="sm"
          value={entry}
          onChange={setEntry}
          className="self-start"
          options={[
            { value: 'duration', label: 'Duration' },
            { value: 'times', label: 'Start & end' },
          ]}
        />
        {entry === 'duration' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hours">
              {(p) => (
                <Input
                  {...p}
                  aria-invalid={errors.time ? true : undefined}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={24}
                  value={hours}
                  placeholder="0"
                  autoFocus={!session}
                  onChange={(e) => setHours(e.target.value)}
                />
              )}
            </Field>
            <Field label="Minutes">
              {(p) => (
                <Input
                  {...p}
                  aria-invalid={errors.time ? true : undefined}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={59}
                  value={minutes}
                  placeholder="0"
                  onChange={(e) => setMinutes(e.target.value)}
                />
              )}
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              {(p) => <Input {...p} aria-invalid={errors.time ? true : undefined} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />}
            </Field>
            <Field label="End">
              {(p) => <Input {...p} aria-invalid={errors.time ? true : undefined} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />}
            </Field>
          </div>
        )}
        {errors.time ? (
          <p role="alert" className="text-xs text-danger">
            {errors.time}
          </p>
        ) : 'sec' in computed ? (
          <p className="text-xs text-faint">
            {formatDuration(computed.sec!)}
            {overlaps.length > 0 && <span className="text-warn"> · overlaps another session that day</span>}
          </p>
        ) : null}
        {session?.source === 'timer' && <p className="text-xs text-faint">Recorded with the timer{session.startedAt ? `, started ${isoToLocalTime(session.startedAt)} on ${isoToLocalDate(session.startedAt)}` : ''}.</p>}
      </div>

      {showMore ? (
        <>
          <Field label="Goal" optional>
            {(p) => <Input {...p} value={goal} maxLength={160} placeholder="e.g. Finish chapter 4" onChange={(e) => setGoal(e.target.value)} />}
          </Field>
          <Field label="Notes" optional>
            {(p) => <Textarea {...p} value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} />}
          </Field>
          <Field label="Tags" optional>
            {(p) => <TagInput id={p.id} value={tags} onChange={setTags} />}
          </Field>
          <Toggle label="Completed" description="Did you finish what you set out to do?" checked={completed} onChange={setCompleted} />
        </>
      ) : (
        <button type="button" className="self-start text-[13px] font-medium text-accent hover:underline" onClick={() => setShowMore(true)}>
          Add goal, notes or tags
        </button>
      )}

      <div className="flex items-center gap-2 pt-1">
        {session && (
          <Button
            variant="danger"
            icon={Trash}
            onClick={async () => {
              await deleteStudySession(session.id)
              onClose()
            }}
          >
            Delete
          </Button>
        )}
        <div className="flex-1" />
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={saving}>
          {session ? 'Save' : 'Log session'}
        </Button>
      </div>
    </form>
  )
}
