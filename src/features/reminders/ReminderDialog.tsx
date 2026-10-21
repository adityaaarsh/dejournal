import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Link2, Trash2, X } from 'lucide-react'
import { Button, Field, Input, Select, Sheet, Textarea, Toggle } from '@/components/ui'
import type { DialogProps } from '@/features/quick/DialogHost'
import { db } from '@/db/db'
import type { Recurrence } from '@/db/types'
import { createReminder, deleteReminder, occurrenceState, reminderOccursOn, setOccurrenceState, updateReminder } from '@/db/reminders'
import { formatDate, isISODate, nowHHmm, today, weekday } from '@/lib/dates'
import { describeRecurrence } from '@/lib/recurrence'
import { cn } from '@/lib/text'
import { toast } from '@/stores/ui'
import { NotificationInlinePrompt } from './NotificationStatus'

type RepeatKind = 'none' | 'daily' | 'weekly' | 'days'
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** A sensible default time: next full hour, or 09:00. */
function defaultTime(date: string): string {
  if (date !== today()) return '09:00'
  const [h] = nowHHmm().split(':').map(Number)
  return h >= 23 ? '23:30' : `${String(h + 1).padStart(2, '0')}:00`
}

export default function ReminderDialog({ request, onClose }: DialogProps<'reminder'>) {
  const r = request.reminder
  const initialDate = r?.date ?? request.date ?? today()
  const [title, setTitle] = useState(r?.title ?? request.title ?? '')
  const [date, setDate] = useState(initialDate)
  const [time, setTime] = useState(r?.time ?? defaultTime(initialDate))
  const [repeat, setRepeat] = useState<RepeatKind>(r?.recurrence?.type ?? 'none')
  const [days, setDays] = useState<number[]>(r?.recurrence?.days ?? [weekday(initialDate)])
  const [endDate, setEndDate] = useState(r?.endDate ?? '')
  const [notify, setNotify] = useState(r?.notify ?? true)
  const [description, setDescription] = useState(r?.description ?? '')
  const [taskId, setTaskId] = useState<string | null>(r?.taskId ?? request.taskId ?? null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const task = useLiveQuery(async () => (taskId ? ((await db.tasks.get(taskId)) ?? null) : null), [taskId])

  // Occurrence the dialog was opened for (from a day view), if it's a real one.
  const occDate = r && request.date && reminderOccursOn(r, request.date) ? request.date : r && !r.recurrence ? r.date : null
  const occState = r && occDate ? occurrenceState(r, occDate) : null

  const recurrence: Recurrence | null = repeat === 'none' ? null : repeat === 'days' ? { type: 'days', days: [...days].sort() } : { type: repeat }

  const submit = async () => {
    const e: Record<string, string> = {}
    if (!title.trim()) e.title = 'What should DeJournal remind you about?'
    if (!isISODate(date)) e.date = 'Choose a valid date.'
    if (!/^\d{2}:\d{2}$/.test(time)) e.time = 'Choose a time.'
    if (repeat === 'days' && days.length === 0) e.days = 'Pick at least one day.'
    if (repeat !== 'none' && endDate && endDate < date) e.endDate = 'End date must be after the start date.'
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      const input = {
        title,
        description,
        date,
        time,
        taskId,
        recurrence,
        endDate: repeat !== 'none' && endDate ? endDate : null,
        notify,
      }
      if (r) await updateReminder(r.id, input)
      else await createReminder(input)
      toast(r ? 'Reminder updated' : 'Reminder set', { tone: 'success' })
      onClose()
    } catch (err) {
      console.error(err)
      toast('Could not save the reminder.', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      title={r ? 'Edit reminder' : 'New reminder'}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          {r && (
            <Button
              variant="danger"
              icon={Trash2}
              className="mr-auto"
              onClick={async () => {
                await deleteReminder(r.id)
                onClose()
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {r && occDate && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
            <span className="text-[13px] text-muted">
              {formatDate(occDate, 'EEE, d MMM')}: <span className="text-text">{occState === 'pending' ? 'Pending' : occState === 'done' ? 'Done' : 'Dismissed'}</span>
            </span>
            {occState === 'pending' ? (
              <Button
                size="sm"
                variant="subtle"
                icon={Check}
                onClick={async () => {
                  await setOccurrenceState(r.id, occDate, 'done')
                  toast('Marked done', { tone: 'success' })
                  onClose()
                }}
              >
                Mark done
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setOccurrenceState(r.id, occDate, 'pending')}>
                Reopen
              </Button>
            )}
          </div>
        )}

        <Field label="Remind me to" error={errors.title}>
          {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Pay electricity bill" autoFocus={!r} maxLength={200} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={repeat === 'none' ? 'Date' : 'Starts'} error={errors.date}>
            {(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
          <Field label="Time" error={errors.time}>
            {(p) => <Input {...p} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}
          </Field>
        </div>
        <Field label="Repeat" hint={repeat !== 'none' ? describeRecurrence(recurrence, date) : undefined}>
          {(p) => (
            <Select {...p} value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatKind)}>
              <option value="none">Does not repeat</option>
              <option value="daily">Every day</option>
              <option value="weekly">Every week</option>
              <option value="days">On selected days</option>
            </Select>
          )}
        </Field>
        {repeat === 'days' && (
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium text-muted">Days</legend>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d, i) => {
                const on = days.includes(i)
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDays(on ? days.filter((x) => x !== i) : [...days, i])}
                    className={cn(
                      'h-10 min-w-11 rounded-xl border px-2 text-[13px] font-medium transition-colors',
                      on ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface-2 text-muted hover:text-text',
                    )}
                  >
                    {d}
                  </button>
                )
              })}
            </div>
            {errors.days && <p className="mt-1 text-xs text-danger">{errors.days}</p>}
          </fieldset>
        )}
        {repeat !== 'none' && (
          <Field label="Ends on" optional error={errors.endDate} hint="Leave empty to repeat indefinitely.">
            {(p) => <Input {...p} type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />}
          </Field>
        )}
        {taskId && (
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-[13px]">
            <Link2 size={15} className="shrink-0 text-muted" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              Linked task: <span className="text-text">{task === undefined ? '…' : task ? task.title : 'Task was deleted'}</span>
            </span>
            <button type="button" onClick={() => setTaskId(null)} className="rounded-md p-1 text-muted hover:text-text" aria-label="Unlink task">
              <X size={15} />
            </button>
          </div>
        )}
        <Field label="Details" optional>
          {(p) => <Textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />}
        </Field>
        <div className="-my-1">
          <Toggle label="Notify me" description="Show an alert at the reminder time." checked={notify} onChange={setNotify} />
        </div>
        {notify && <NotificationInlinePrompt />}
      </div>
    </Sheet>
  )
}
