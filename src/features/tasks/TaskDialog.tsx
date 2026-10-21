import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Repeat, Trash } from 'lucide-react'
import { Button, Field, Input, Segmented, Select, Sheet, TagInput, Textarea, Toggle } from '@/components/ui'
import type { DialogProps } from '@/features/quick/DialogHost'
import { db } from '@/db/db'
import type { Priority, Recurrence, Reminder, Task } from '@/db/types'
import { createSeries, createTask, deleteSeries, deleteTask, setTaskCompleted, updateSeries, updateTask } from '@/db/tasks'
import { createReminder, updateReminder } from '@/db/reminders'
import { addDays, isISODate, today, weekday } from '@/lib/dates'
import { describeRecurrence } from '@/lib/recurrence'
import { useSettings } from '@/stores/settings'
import { toast } from '@/stores/ui'
import { WeekdayPicker } from './WeekdayPicker'

type RepeatKind = 'none' | 'daily' | 'weekly' | 'days'
type Scope = 'one' | 'following'

const PRIORITIES: Array<{ value: Priority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
]

function toRecurrence(kind: RepeatKind, days: number[]): Recurrence | null {
  if (kind === 'none') return null
  if (kind === 'days') return { type: 'days', days }
  return { type: kind }
}

export default function TaskDialog({ request, onClose }: DialogProps<'task'>) {
  const settings = useSettings()
  const existing = request.task
  const isEdit = !!existing

  // Fresh copy of the task (it may have changed since the dialog was opened).
  const live = useLiveQuery(() => (existing ? db.tasks.get(existing.id) : undefined), [existing?.id])
  const task: Task | undefined = live ?? existing
  const series = useLiveQuery(() => (task?.seriesId ? db.taskSeries.get(task.seriesId) : undefined), [task?.seriesId])
  const linkedReminder = useLiveQuery(
    async () => (existing ? ((await db.reminders.where('taskId').equals(existing.id).first()) ?? null) : null),
    [existing?.id],
  )
  const categories = useLiveQuery(async () => {
    const all = await db.tasks.toArray()
    return Array.from(new Set(all.map((t) => t.category).filter(Boolean) as string[])).sort()
  }, [])

  const [title, setTitle] = useState(existing?.title ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [date, setDate] = useState(existing?.date ?? request.date ?? today())
  const [dueTime, setDueTime] = useState(existing?.dueTime ?? '')
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? 'normal')
  const [category, setCategory] = useState(existing?.category ?? '')
  const [tags, setTags] = useState<string[]>(existing?.tags ?? [])
  const [repeat, setRepeat] = useState<RepeatKind>('none')
  const [repeatDays, setRepeatDays] = useState<number[]>([weekday(existing?.date ?? request.date ?? today())])
  const [endDate, setEndDate] = useState('')
  const [remind, setRemind] = useState(false)
  const [remindTime, setRemindTime] = useState(existing?.dueTime || '09:00')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [scopeFor, setScopeFor] = useState<null | 'save' | 'delete'>(null)
  const [busy, setBusy] = useState(false)

  // Load series rule and linked reminder into the form once available.
  useEffect(() => {
    if (!series) return
    const r = series.recurrence
    setRepeat(r.type)
    if (r.type === 'days' && r.days) setRepeatDays(r.days)
    setEndDate(series.endDate ?? '')
  }, [series])
  useEffect(() => {
    if (linkedReminder) {
      setRemind(true)
      setRemindTime(linkedReminder.time)
    }
  }, [linkedReminder])

  const recurrence = toRecurrence(repeat, repeatDays)
  const repeatChanged = useMemo(() => {
    const before = series ? JSON.stringify(series.recurrence) : 'null'
    return JSON.stringify(recurrence) !== before || (series ? (series.endDate ?? '') !== endDate : false)
  }, [series, recurrence, endDate])

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!title.trim()) e.title = 'Give the task a title.'
    else if (title.trim().length > 200) e.title = 'Keep the title under 200 characters.'
    if (!isISODate(date)) e.date = 'Choose a valid date.'
    if (repeat === 'days' && repeatDays.length === 0) e.repeat = 'Pick at least one day.'
    if (repeat !== 'none' && endDate && endDate < date) e.endDate = 'End date must be on or after the start date.'
    if (remind && !/^\d{2}:\d{2}$/.test(remindTime)) e.remindTime = 'Choose a reminder time.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function syncReminder(taskId: string | null, rec: Recurrence | null) {
    const existingRem: Reminder | null | undefined = linkedReminder
    if (remind) {
      if (existingRem) {
        await updateReminder(existingRem.id, { title: title.trim(), time: remindTime, date })
      } else {
        await createReminder({ title: title.trim(), date, time: remindTime, taskId, recurrence: rec, endDate: endDate || null })
      }
    } else if (existingRem) {
      await db.reminders.delete(existingRem.id)
    }
  }

  const fields = () => ({
    title: title.trim(),
    description: description.trim() || undefined,
    dueTime: dueTime || null,
    priority,
    category: category.trim() || undefined,
    tags,
  })

  async function save(scope?: Scope) {
    if (!validate()) return
    // A repeating occurrence needs a scope choice first.
    if (task?.seriesId && !scope) {
      setScopeFor('save')
      return
    }
    setBusy(true)
    try {
      if (!task) {
        if (recurrence) {
          await createSeries({ ...fields(), date, recurrence, endDate: endDate || null })
          if (remind) await createReminder({ title: title.trim(), date, time: remindTime, recurrence, endDate: endDate || null })
          toast('Repeating task added')
        } else {
          const t = await createTask({ ...fields(), date })
          await syncReminder(t.id, null)
        }
      } else if (task.seriesId && scope === 'following') {
        await updateSeries(
          task.seriesId,
          {
            ...fields(),
            ...(repeatChanged && recurrence ? { recurrence, endDate: endDate || null } : {}),
            ...(repeat === 'none' ? { endDate: task.date } : {}),
          },
          task.date,
        )
        // Date moves apply to this occurrence only.
        if (date !== task.date) await updateTask(task.id, { date })
        await syncReminder(task.id, null)
      } else if (!task.seriesId && recurrence) {
        // Turn a one-off task into a repeating one starting on its date.
        if (task.completed) await updateTask(task.id, fields())
        else await db.tasks.delete(task.id)
        await createSeries({ ...fields(), date: task.completed ? addDays(date, 1) : date, recurrence, endDate: endDate || null })
        if (linkedReminder) await db.reminders.delete(linkedReminder.id)
        if (remind) await createReminder({ title: title.trim(), date, time: remindTime, recurrence, endDate: endDate || null })
        toast('Task now repeats')
      } else {
        await updateTask(task.id, { ...fields(), date })
        await syncReminder(task.id, null)
      }
      onClose()
    } catch (err) {
      console.error(err)
      toast('Could not save the task.', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function remove(scope?: Scope) {
    if (!task) return
    if (task.seriesId && !scope) {
      setScopeFor('delete')
      return
    }
    if (task.seriesId && scope === 'following') await deleteSeries(task.seriesId, task.date)
    else await deleteTask(task.id)
    if (linkedReminder) await db.reminders.delete(linkedReminder.id)
    onClose()
  }

  if (scopeFor) {
    const isDelete = scopeFor === 'delete'
    return (
      <Sheet
        title={isDelete ? 'Delete repeating task' : 'Save repeating task'}
        description={isDelete ? 'This task is part of a repeating series.' : 'Apply your changes to:'}
        onClose={() => setScopeFor(null)}
        size="sm"
      >
        <div className="flex flex-col gap-2">
          <Button
            block
            size="lg"
            variant={isDelete ? 'danger' : 'secondary'}
            onClick={() => (isDelete ? remove('one') : save('one'))}
            disabled={!isDelete && repeatChanged}
          >
            Only this task
          </Button>
          <Button
            block
            size="lg"
            variant={isDelete ? 'danger' : 'primary'}
            onClick={() => (isDelete ? remove('following') : save('following'))}
          >
            {isDelete ? 'This and all following' : 'This and following tasks'}
          </Button>
          {!isDelete && repeatChanged && <p className="text-xs text-faint">Changing how a task repeats applies to this and following tasks.</p>}
          {isDelete && <p className="text-xs text-faint">Completed tasks in the past are always kept.</p>}
          <Button block variant="ghost" onClick={() => setScopeFor(null)}>
            Cancel
          </Button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet
      title={isEdit ? 'Edit task' : 'New task'}
      onClose={onClose}
      onSubmit={() => save()}
      footer={
        <>
          {isEdit && (
            <Button variant="danger" icon={Trash} onClick={() => remove()} className="mr-auto">
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={busy}>
            {isEdit ? 'Save' : 'Add task'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Title" error={errors.title}>
          {(p) => (
            <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Pay electricity bill" autoFocus={!isEdit} maxLength={240} />
          )}
        </Field>

        {task && (
          <Toggle checked={task.completed} onChange={(v) => setTaskCompleted(task.id, v)} label="Completed" />
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" error={errors.date}>
            {(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
          <Field label="Due time" optional>
            {(p) => <Input {...p} type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />}
          </Field>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Priority</span>
          <Segmented label="Priority" value={priority} onChange={setPriority} options={PRIORITIES} className="w-full" />
        </div>

        <Field label="Notes" optional>
          {(p) => <Textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Details, links, steps…" />}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" optional>
            {(p) => (
              <>
                <Input {...p} value={category} onChange={(e) => setCategory(e.target.value)} list="task-categories" placeholder="e.g. Home" />
                <datalist id="task-categories">
                  {(categories ?? []).map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field label="Repeat" error={errors.repeat}>
            {(p) => (
              <Select {...p} value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatKind)}>
                <option value="none">Never</option>
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
                <option value="days">Selected days</option>
              </Select>
            )}
          </Field>
        </div>

        {repeat !== 'none' && (
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-2/50 p-3">
            {repeat === 'days' && <WeekdayPicker value={repeatDays} onChange={setRepeatDays} weekStartsOn={settings.weekStartsOn} />}
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Repeat size={13} aria-hidden />
              {describeRecurrence(recurrence, date)} · each day is tracked separately
            </p>
            <Field label="Ends on" optional error={errors.endDate}>
              {(p) => <Input {...p} type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />}
            </Field>
          </div>
        )}

        <Field label="Tags" optional>
          {(p) => <TagInput id={p.id} value={tags} onChange={setTags} />}
        </Field>

        <div className="rounded-2xl border border-line px-3">
          <Toggle checked={remind} onChange={setRemind} label="Remind me" description={remind ? undefined : 'Get a notification on the task date'} />
          {remind && (
            <div className="pb-3">
              <Field label="Reminder time" error={errors.remindTime}>
                {(p) => <Input {...p} type="time" value={remindTime} onChange={(e) => setRemindTime(e.target.value)} />}
              </Field>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  )
}

