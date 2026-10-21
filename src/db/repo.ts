import type { Table } from 'dexie'
import { db } from './db'
import { nowISO, uid } from '@/lib/id'
import { undoToast } from '@/stores/ui'

/**
 * Generic helpers for simple entities that extend BaseRecord
 * ({ id, createdAt, updatedAt }). Feature-specific logic lives in
 * db/tasks.ts, db/reminders.ts, db/photos.ts, db/timers.ts, db/days.ts.
 */

type WithBase = { id: string; createdAt: string; updatedAt: string }
type NewRecord<T extends WithBase> = Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }

export async function createRecord<T extends WithBase>(table: Table<T, string, any>, // eslint-disable-line @typescript-eslint/no-explicit-any
   data: NewRecord<T>): Promise<T> {
  const now = nowISO()
  const rec = { ...data, id: data.id ?? uid(), createdAt: now, updatedAt: now } as T
  await table.add(rec)
  return rec
}

export async function updateRecord<T extends WithBase>(table: Table<T, string, any>, // eslint-disable-line @typescript-eslint/no-explicit-any
   id: string, patch: Partial<T>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await table.update(id, { ...patch, updatedAt: nowISO() } as any)
}

/**
 * Delete a record and show an Undo toast that restores it exactly.
 * `extra` lets callers snapshot/restore related rows (e.g. a photo's file).
 */
export async function removeWithUndo<T>(
  table: Table<T, string>,
  id: string,
  label: string,
  extra?: { snapshot: () => Promise<() => Promise<void>> },
): Promise<void> {
  const rec = await table.get(id)
  if (!rec) return
  const restoreExtra = extra ? await extra.snapshot() : null
  await table.delete(id)
  undoToast(`${label} deleted`, async () => {
    await table.put(rec)
    if (restoreExtra) await restoreExtra()
  })
}

/* Key–value helpers (settings, timers, recent searches…) */

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await db.kv.get(key))?.value as T | undefined
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  await db.kv.put({ key, value })
}

export async function kvDelete(key: string): Promise<void> {
  await db.kv.delete(key)
}
