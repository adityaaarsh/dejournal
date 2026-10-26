import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlarmClock, Ban, Bell, BellOff, Check, Link2, Pencil, Plus, Repeat, Trash2, Undo2 } from 'lucide-react'
import { db } from '@/db/db'
import type { ISODate, Reminder } from '@/db/types'
import { deleteReminder, occurrenceState, reminderOccursOn, remindersOn, setOccurrenceState, snoozeReminder } from '@/db/reminders'
import { Button, EmptyState, IconTile, LoadingState, NavSquare, Page, PageHeader, RECORD_TONE } from '@/components/ui'
import { addDays, formatDate, formatTime, relativeDayLabel, today } from '@/lib/dates'
import { describeRecurrence } from '@/lib/recurrence'
import { cn } from '@/lib/text'
import { openDialog, toast } from '@/stores/ui'
import { useSettings } from '@/stores/settings'
import { ActionMenu } from '@/features/reminders/ActionMenu'
import { NotificationStatusPanel } from '@/features/reminders/NotificationStatus'

const UPCOMING_DAYS = 14

function nextOccurrence(r: Reminder, from: ISODate): ISODate | null {
  let d = from
  for (let i = 0; i < 400; i++) {
    if (r.endDate && d > r.endDate) return null
    if (reminderOccursOn(r, d)) return d
    d = addDays(d, 1)
  }
  return null
}

/** Timeline card: title + count on the left, optional action on the right. */
function Section({ title, count, action, children }: { title: string; count?: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-[var(--radius-card)] border border-line bg-surface px-3 pt-2.5 pb-1.5">
      <div className="flex items-center gap-2 pb-1">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        {count !== undefined && <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted tabular-nums">{count}</span>}
        <span className="ml-auto">{action}</span>
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  )
}

function ReminderRow({ r, date, meta, taskTitle, when }: { r: Reminder; date: ISODate | null; meta?: ReactNode; taskTitle?: string; when?: string }) {
  const state = date ? occurrenceState(r, date) : r.status
  const done = state === 'done'
  const missed = !r.recurrence && state === 'pending' && date !== null && date < today()
  const snoozed = date && r.snoozedFor === date && r.snoozedUntil && new Date(r.snoozedUntil) > new Date()

  const toggle = async () => {
    if (!date) return
    await setOccurrenceState(r.id, date, done ? 'pending' : 'done')
    if (!done) toast('Reminder done', { tone: 'success', action: { label: 'Undo', onClick: () => setOccurrenceState(r.id, date, 'pending') } })
  }

  const items = [
    { label: 'Edit', icon: Pencil, onSelect: () => openDialog({ kind: 'reminder', reminder: r, date: date ?? undefined }) },
    ...(date && state === 'pending'
      ? [
          {
            label: 'Snooze 10 minutes',
            icon: AlarmClock,
            onSelect: async () => {
              await snoozeReminder(r.id, date, 10)
              toast('Snoozed for 10 minutes')
            },
          },
          {
            label: 'Snooze 1 hour',
            icon: AlarmClock,
            onSelect: async () => {
              await snoozeReminder(r.id, date, 60)
              toast('Snoozed for 1 hour')
            },
          },
          { label: 'Dismiss', icon: Ban, onSelect: () => setOccurrenceState(r.id, date, 'dismissed') },
        ]
      : []),
    ...(date && state === 'dismissed' ? [{ label: 'Restore', icon: Undo2, onSelect: () => setOccurrenceState(r.id, date, 'pending') }] : []),
    { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => deleteReminder(r.id) },
  ]

  const inactive = done || state === 'dismissed'
  return (
    <div className="flex min-h-[54px] items-center gap-3 py-1">
      <span className="w-12 shrink-0 text-xs font-semibold text-muted tabular-nums">{when ?? r.time.slice(0, 5)}</span>
      <IconTile icon={date ? Bell : Repeat} tone={inactive ? 'muted' : RECORD_TONE.reminder} />
      <button
        type="button"
        onClick={() => openDialog({ kind: 'reminder', reminder: r, date: date ?? undefined })}
        className="min-w-0 flex-1 py-1 text-left"
      >
        <span className={cn('block truncate text-[14px] font-semibold', inactive && 'text-faint line-through')}>{r.title}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          {when && <span className="tabular-nums">{formatTime(r.time)}</span>}
          {meta}
          {r.recurrence && (
            <span className="inline-flex items-center gap-1">
              <Repeat size={11} aria-hidden />
              {describeRecurrence(r.recurrence, r.date)}
            </span>
          )}
          {snoozed && <span className="text-accent">Snoozed until {new Date(r.snoozedUntil!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
          {missed && <span className="text-warn">Missed</span>}
          {state === 'dismissed' && <span>Dismissed</span>}
          {!r.notify && (
            <span className="inline-flex items-center gap-1" title="Notifications off for this reminder">
              <BellOff size={11} aria-hidden /> Silent
            </span>
          )}
          {taskTitle && (
            <span className="inline-flex max-w-40 items-center gap-1 truncate">
              <Link2 size={11} aria-hidden /> {taskTitle}
            </span>
          )}
        </span>
      </button>
      {date && (
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={`Mark "${r.title}" ${done ? 'not done' : 'done'}`}
          onClick={toggle}
          className="grid h-11 w-8 shrink-0 place-items-center"
        >
          <span
            className={cn(
              'grid h-[19px] w-[19px] place-items-center rounded-full border-[1.5px] transition-colors',
              done ? 'border-success bg-success text-on-tile' : state === 'dismissed' ? 'border-line' : 'border-faint hover:border-accent',
            )}
          >
            {done && <Check size={12} strokeWidth={3.4} />}
          </span>
        </button>
      )}
      <ActionMenu items={items} label={`Actions for ${r.title}`} />
    </div>
  )
}

export default function RemindersPage() {
  const settings = useSettings()
  const [params, setParams] = useSearchParams()
  const reminders = useLiveQuery(() => db.reminders.toArray(), [])
  const taskTitles = useLiveQuery(async () => {
    const ids = (reminders ?? []).map((r) => r.taskId).filter((x): x is string => !!x)
    if (!ids.length) return {}
    const tasks = await db.tasks.bulkGet(ids)
    return Object.fromEntries(tasks.filter(Boolean).map((t) => [t!.id, t!.title]))
  }, [reminders])
  const [showAllPast, setShowAllPast] = useState(false)

  // Deep link from a notification: /reminders?open=ID
  const openId = params.get('open')
  useEffect(() => {
    if (!openId || !reminders) return
    const r = reminders.find((x) => x.id === openId)
    const next = new URLSearchParams(params)
    next.delete('open')
    setParams(next, { replace: true })
    if (r) openDialog({ kind: 'reminder', reminder: r, date: reminderOccursOn(r, today()) ? today() : undefined })
    else toast('That reminder no longer exists.')
  }, [openId, reminders]) // eslint-disable-line react-hooks/exhaustive-deps

  const t = today()
  const groups = useMemo(() => {
    if (!reminders) return null
    const todayList = remindersOn(reminders, t)
    // One-time reminders in the window, plus each repeating reminder once
    // (its next occurrence) so a daily reminder doesn't flood the list.
    const upcoming: Array<{ date: ISODate; items: Reminder[] }> = []
    const shownSeries = new Set<string>()
    for (let i = 1; i <= UPCOMING_DAYS; i++) {
      const d = addDays(t, i)
      const items = remindersOn(reminders, d).filter((r) => {
        if (!r.recurrence) return true
        if (shownSeries.has(r.id)) return false
        shownSeries.add(r.id)
        return true
      })
      if (items.length) upcoming.push({ date: d, items })
    }
    const repeating = reminders
      .filter((r) => r.recurrence)
      .map((r) => ({ r, next: nextOccurrence(r, t) }))
      .sort((a, b) => (a.next ?? '9999').localeCompare(b.next ?? '9999') || a.r.time.localeCompare(b.r.time))
    const past = reminders.filter((r) => !r.recurrence && r.date < t).sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
    return { todayList, upcoming, repeating, past }
  }, [reminders, t])

  const add = () => openDialog({ kind: 'reminder', date: t })

  return (
    <Page>
      <PageHeader title="Reminders" subtitle={groups ? `${groups.todayList.length} today · ${groups.repeating.length} repeating` : undefined} back="/more" actions={<NavSquare icon={Plus} label="New reminder" onClick={add} />} />
      <div className="flex flex-col gap-3">
        <NotificationStatusPanel />

        {!groups ? (
          <LoadingState />
        ) : reminders!.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No reminders yet"
            description="Set one-time or repeating reminders for bills, routines and anything you don't want to forget."
            action={
              <Button variant="primary" icon={Plus} onClick={add}>
                Add a reminder
              </Button>
            }
          />
        ) : (
          <>
            <Section
              title="Today"
              count={groups.todayList.length}
              action={
                <button type="button" onClick={add} className="inline-flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-[13px] font-semibold text-accent hover:bg-accent-soft">
                  <Plus size={14} strokeWidth={2.6} aria-hidden /> Add
                </button>
              }
            >
              {groups.todayList.length ? (
                groups.todayList.map((r) => <ReminderRow key={r.id} r={r} date={t} taskTitle={r.taskId ? taskTitles?.[r.taskId] : undefined} />)
              ) : (
                <p className="py-4 text-center text-[13px] text-muted">Nothing due today.</p>
              )}
            </Section>

            {groups.upcoming.length > 0 && (
              <Section title="Upcoming">
                {groups.upcoming.flatMap(({ date, items }) =>
                  items.map((r) => (
                    <ReminderRow
                      key={`${r.id}:${date}`}
                      r={r}
                      date={date}
                      when={formatDate(date, 'EEE d')}
                      meta={<span className="font-medium text-text">{relativeDayLabel(date, settings.dateFormat)}</span>}
                      taskTitle={r.taskId ? taskTitles?.[r.taskId] : undefined}
                    />
                  )),
                )}
              </Section>
            )}

            {groups.repeating.length > 0 && (
              <Section title="Repeating" count={groups.repeating.length}>
                {groups.repeating.map(({ r, next }) => (
                  <ReminderRow
                    key={r.id}
                    r={r}
                    date={null}
                    meta={<span>{next ? `Next: ${relativeDayLabel(next, settings.dateFormat)}` : 'Ended'}</span>}
                    taskTitle={r.taskId ? taskTitles?.[r.taskId] : undefined}
                  />
                ))}
              </Section>
            )}

            {groups.past.length > 0 && (
              <Section title="Past" count={groups.past.length}>
                {(showAllPast ? groups.past : groups.past.slice(0, 15)).map((r) => (
                  <ReminderRow
                    key={r.id}
                    r={r}
                    date={r.date}
                    when={formatDate(r.date, 'd MMM')}
                    meta={<span>{relativeDayLabel(r.date, settings.dateFormat)}</span>}
                    taskTitle={r.taskId ? taskTitles?.[r.taskId] : undefined}
                  />
                ))}
                {groups.past.length > 15 && !showAllPast && (
                  <div className="py-2 text-center">
                    <Button size="sm" variant="ghost" onClick={() => setShowAllPast(true)}>
                      Show all {groups.past.length}
                    </Button>
                  </div>
                )}
              </Section>
            )}
          </>
        )}
      </div>
    </Page>
  )
}
