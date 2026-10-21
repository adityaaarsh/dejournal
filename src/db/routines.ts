import { db } from './db'
import type { ISODate, Routine, RoutineLog } from './types'
import { addDays, isoToLocalDate, weekday } from '@/lib/dates'
import { nowISO, uid } from '@/lib/id'
import { undoToast } from '@/stores/ui'

/** Routines: small habits the user explicitly chooses to track, logged per date. */

export function routineAppliesOn(r: Routine, date: ISODate): boolean {
  return r.active && (r.days.length === 0 || r.days.includes(weekday(date)))
}

export async function createRoutine(name: string, days: number[]): Promise<Routine> {
  const all = await db.routines.toArray()
  const now = nowISO()
  const r: Routine = {
    id: uid(),
    name: name.trim(),
    days,
    active: true,
    order: all.reduce((m, x) => Math.max(m, x.order), -1) + 1,
    createdAt: now,
    updatedAt: now,
  }
  await db.routines.add(r)
  return r
}

export async function updateRoutine(id: string, patch: Partial<Routine>): Promise<void> {
  await db.routines.update(id, { ...patch, updatedAt: nowISO() })
}

export async function deleteRoutine(id: string): Promise<void> {
  const r = await db.routines.get(id)
  if (!r) return
  const logs = await db.routineLogs.where('routineId').equals(id).toArray()
  await db.transaction('rw', db.routines, db.routineLogs, async () => {
    await db.routines.delete(id)
    await db.routineLogs.bulkDelete(logs.map((l) => l.id))
  })
  undoToast('Routine deleted', async () => {
    await db.transaction('rw', db.routines, db.routineLogs, async () => {
      await db.routines.put(r)
      await db.routineLogs.bulkPut(logs)
    })
  })
}

export async function moveRoutine(id: string, dir: -1 | 1): Promise<void> {
  const all = (await db.routines.toArray()).sort((a, b) => a.order - b.order)
  const i = all.findIndex((r) => r.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= all.length) return
  ;[all[i], all[j]] = [all[j], all[i]]
  await db.transaction('rw', db.routines, async () => {
    await Promise.all(all.map((r, idx) => db.routines.update(r.id, { order: idx })))
  })
}

const logId = (routineId: string, date: ISODate) => `${routineId}:${date}`

export async function toggleRoutineLog(routineId: string, date: ISODate): Promise<boolean> {
  const id = logId(routineId, date)
  let done = false
  await db.transaction('rw', db.routineLogs, async () => {
    if (await db.routineLogs.get(id)) {
      await db.routineLogs.delete(id)
      done = false
    } else {
      const log: RoutineLog = { id, routineId, date, createdAt: nowISO() }
      await db.routineLogs.put(log)
      done = true
    }
  })
  return done
}

/** Completion over the last `days` days (only days the routine applied). */
export function routineCompletion(r: Routine, logs: RoutineLog[], end: ISODate, days = 30): { applicable: number; done: number } {
  const logged = new Set(logs.filter((l) => l.routineId === r.id).map((l) => l.date))
  let applicable = 0
  let done = 0
  const created = isoToLocalDate(r.createdAt)
  for (let i = 0; i < days; i++) {
    const d = addDays(end, -i)
    if (d < created && !logged.has(d)) continue
    if (!(r.days.length === 0 || r.days.includes(weekday(d)))) continue
    applicable++
    if (logged.has(d)) done++
  }
  return { applicable, done }
}
