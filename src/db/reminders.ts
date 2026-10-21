import { db } from './db'
import type { ISODate, Recurrence, Reminder } from './types'
import { atTime, today } from '@/lib/dates'
import { nowISO, uid } from '@/lib/id'
import { occursOn } from '@/lib/recurrence'
import { undoToast } from '@/stores/ui'

/**
 * Reminders. A recurring reminder is a single row; its occurrences are
 * computed with `reminderOccursOn` and per-occurrence state is kept in
 * doneDates / dismissedDates / firedFor.
 */

export interface ReminderInput {
  title: string
  description?: string
  date: ISODate
  time: string
  taskId?: string | null
  recurrence?: Recurrence | null
  endDate?: ISODate | null
  notify?: boolean
}

export async function createReminder(input: ReminderInput): Promise<Reminder> {
  const now = nowISO()
  const r: Reminder = {
    id: uid(),
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    date: input.date,
    time: input.time,
    taskId: input.taskId ?? null,
    recurrence: input.recurrence ?? null,
    endDate: input.endDate ?? null,
    notify: input.notify ?? true,
    status: 'pending',
    doneDates: [],
    dismissedDates: [],
    firedFor: [],
    snoozedUntil: null,
    snoozedFor: null,
    createdAt: now,
    updatedAt: now,
  }
  await db.reminders.add(r)
  return r
}

export async function updateReminder(id: string, patch: Partial<Reminder>): Promise<void> {
  const r = await db.reminders.get(id)
  if (!r) return
  const changes: Partial<Reminder> = { ...patch, updatedAt: nowISO() }
  // Rescheduling re-arms the notification.
  if ((patch.date && patch.date !== r.date) || (patch.time && patch.time !== r.time)) {
    changes.firedFor = []
    changes.snoozedUntil = null
    changes.snoozedFor = null
    if (!r.recurrence) changes.status = 'pending'
  }
  await db.reminders.update(id, changes)
}

export function reminderOccursOn(r: Reminder, date: ISODate): boolean {
  if (!r.recurrence) return r.date === date
  return occursOn(r.recurrence, r.date, date, r.endDate)
}

export type OccurrenceState = 'pending' | 'done' | 'dismissed'

export function occurrenceState(r: Reminder, date: ISODate): OccurrenceState {
  if (!r.recurrence) return r.status
  if (r.doneDates.includes(date)) return 'done'
  if (r.dismissedDates.includes(date)) return 'dismissed'
  return 'pending'
}

/** Reminders that occur on `date`, sorted by time. */
export function remindersOn(all: Reminder[], date: ISODate): Reminder[] {
  return all.filter((r) => reminderOccursOn(r, date)).sort((a, b) => a.time.localeCompare(b.time))
}

export async function setOccurrenceState(id: string, date: ISODate, state: OccurrenceState): Promise<void> {
  const r = await db.reminders.get(id)
  if (!r) return
  if (!r.recurrence) {
    await db.reminders.update(id, { status: state, snoozedUntil: null, snoozedFor: null, updatedAt: nowISO() })
    return
  }
  const doneDates = r.doneDates.filter((d) => d !== date)
  const dismissedDates = r.dismissedDates.filter((d) => d !== date)
  if (state === 'done') doneDates.push(date)
  if (state === 'dismissed') dismissedDates.push(date)
  await db.reminders.update(id, {
    doneDates,
    dismissedDates,
    ...(r.snoozedFor === date ? { snoozedUntil: null, snoozedFor: null } : {}),
    updatedAt: nowISO(),
  })
}

export async function snoozeReminder(id: string, date: ISODate, minutes = 10): Promise<void> {
  const until = new Date(Date.now() + minutes * 60_000).toISOString()
  await db.reminders.update(id, { snoozedUntil: until, snoozedFor: date, updatedAt: nowISO() })
}

export async function deleteReminder(id: string): Promise<void> {
  const r = await db.reminders.get(id)
  if (!r) return
  await db.reminders.delete(id)
  undoToast('Reminder deleted', async () => {
    await db.reminders.put(r)
  })
}

/** When the given occurrence should fire (Date), accounting for snooze. */
export function fireTime(r: Reminder, date: ISODate): Date {
  if (r.snoozedUntil && r.snoozedFor === date) return new Date(r.snoozedUntil)
  return atTime(date, r.time)
}

/** Pending occurrences (today and earlier today) that are due and not yet notified. */
export function dueOccurrences(all: Reminder[], now: Date = new Date()): Array<{ reminder: Reminder; date: ISODate }> {
  const d = today()
  const out: Array<{ reminder: Reminder; date: ISODate }> = []
  for (const r of all) {
    if (!r.notify || !reminderOccursOn(r, d)) continue
    if (occurrenceState(r, d) !== 'pending') continue
    const when = fireTime(r, d)
    const snoozed = r.snoozedUntil && r.snoozedFor === d
    const alreadyFired = r.firedFor.includes(d) && !snoozed
    if (when <= now && !alreadyFired) out.push({ reminder: r, date: d })
  }
  return out
}
