import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDown, ArrowUp, Pencil, Plus, Repeat, Trash } from 'lucide-react'
import { Button, Card, EmptyState, Field, IconButton, IconTile, Input, LoadingState, NavSquare, Page, PageHeader, RECORD_TONE, Sheet, Toggle } from '@/components/ui'
import { db } from '@/db/db'
import type { Routine, RoutineLog } from '@/db/types'
import { createRoutine, deleteRoutine, moveRoutine, routineCompletion, updateRoutine } from '@/db/routines'
import { WeekdayPicker } from '@/features/tasks/WeekdayPicker'
import { addDays, dateRange, formatDate, today, weekday } from '@/lib/dates'
import { cn } from '@/lib/text'
import { describeRecurrence } from '@/lib/recurrence'
import { useSettings } from '@/stores/settings'
import { toast } from '@/stores/ui'

function daysLabel(days: number[]): string {
  if (days.length === 0 || days.length === 7) return 'Every day'
  return describeRecurrence({ type: 'days', days })
}

function RoutineSheet({ routine, onClose }: { routine?: Routine; onClose: () => void }) {
  const settings = useSettings()
  const [name, setName] = useState(routine?.name ?? '')
  const [days, setDays] = useState<number[]>(routine?.days ?? [])
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!name.trim()) {
      setError('Name the routine.')
      return
    }
    if (routine) await updateRoutine(routine.id, { name: name.trim(), days })
    else await createRoutine(name, days)
    toast(routine ? 'Routine updated' : 'Routine added')
    onClose()
  }

  return (
    <Sheet
      title={routine ? 'Edit routine' : 'New routine'}
      onClose={onClose}
      onSubmit={save}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit">
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" error={error}>
          {(p) => (
            <Input
              {...p}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              placeholder="e.g. Drink 2L water"
              maxLength={80}
              autoFocus
            />
          )}
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Days</span>
          <WeekdayPicker value={days} onChange={setDays} weekStartsOn={settings.weekStartsOn} />
          <p className="text-xs text-faint">{days.length === 0 ? 'No days selected means every day.' : daysLabel(days)}</p>
        </div>
      </div>
    </Sheet>
  )
}

/** Last 30 days as small rounded squares: done, missed, or not scheduled. */
function ConsistencyStrip({ routine, logs, end }: { routine: Routine; logs: RoutineLog[]; end: string }) {
  const done = new Set(logs.filter((l) => l.routineId === routine.id).map((l) => l.date))
  const days = dateRange(addDays(end, -29), end)
  const scheduled = (d: string) => routine.days.length === 0 || routine.days.includes(weekday(d))
  return (
    <div className="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1" role="img" aria-label={`${routine.name}: done on ${days.filter((d) => done.has(d)).length} of the last 30 days`}>
      {days.map((d) => (
        <span
          key={d}
          title={formatDate(d, 'EEE d MMM')}
          className={cn(
            "block aspect-square rounded-[5px]",
            done.has(d) ? 'bg-success' : scheduled(d) ? 'bg-surface-3' : 'border border-line bg-transparent',
          )}
        />
      ))}
    </div>
  )
}

/** Manage tracked routines and see recent consistency. */
export default function RoutinesPage() {
  const routines = useLiveQuery(async () => (await db.routines.toArray()).sort((a, b) => a.order - b.order), [])
  const t = today()
  const logs = useLiveQuery(() => db.routineLogs.where('date').between(addDays(t, -29), t, true, true).toArray(), [t])
  const [editing, setEditing] = useState<Routine | 'new' | null>(null)

  return (
    <Page>
      <PageHeader
        title="Routines"
        back="/more"
        subtitle="Small habits you choose to track"
        actions={<NavSquare icon={Plus} label="New routine" onClick={() => setEditing('new')} />}
      />
      {routines === undefined ? (
        <LoadingState />
      ) : routines.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No routines yet"
          description="Add a routine like “Drink 2L water” or “Evening walk”. Check it off from the Today screen. Routines also help suggestions stay relevant."
          action={
            <Button variant="primary" size="sm" icon={Plus} onClick={() => setEditing('new')}>
              Add routine
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {routines.map((r, i) => {
            const c = routineCompletion(r, logs ?? [], t, 30)
            return (
              <li key={r.id}>
                <Card className={cn('px-3 pt-2.5 pb-1', !r.active && 'opacity-70')}>
                  <div className="flex items-center gap-3">
                    <IconTile icon={Repeat} tone={r.active ? RECORD_TONE.routine : 'muted'} />
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-[14px] font-semibold">{r.name}</h2>
                      <p className="truncate text-xs text-muted">
                        {daysLabel(r.days)} · {c.applicable ? `${c.done}/${c.applicable} days` : "no days yet"}
                      </p>
                    </div>
                    <div className="-mr-1.5 flex shrink-0 items-center">
                      <IconButton icon={ArrowUp} label={`Move ${r.name} up`} size="sm" disabled={i === 0} onClick={() => moveRoutine(r.id, -1)} />
                      <IconButton icon={ArrowDown} label={`Move ${r.name} down`} size="sm" disabled={i === routines.length - 1} onClick={() => moveRoutine(r.id, 1)} />
                      <IconButton icon={Pencil} label={`Edit ${r.name}`} size="sm" onClick={() => setEditing(r)} />
                      <IconButton icon={Trash} label={`Delete ${r.name}`} size="sm" variant="danger" onClick={() => deleteRoutine(r.id)} />
                    </div>
                  </div>
                  <div className="mt-2.5">
                    <div className="mb-1.5 flex justify-between text-[11px] text-faint">
                      <span>Last 30 days</span>
                      <span>Today</span>
                    </div>
                    <ConsistencyStrip routine={r} logs={logs ?? []} end={t} />
                  </div>
                  <div className="mt-2 border-t border-line">
                    <Toggle
                      checked={r.active}
                      onChange={(v) => updateRoutine(r.id, { active: v })}
                      label="Active"
                      description={r.active ? undefined : 'Paused routines are hidden from Today'}
                    />
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
      {editing && <RoutineSheet routine={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Page>
  )
}
