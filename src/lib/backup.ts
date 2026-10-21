/**
 * Backup: export all data to a JSON file, import it back, delete everything.
 *
 * Blobs (photos, thumbnails) are encoded as { $blob: true, type, data } with
 * base64 data, so a backup is a single portable JSON file.
 */
import { toISODate } from '@/lib/dates'
import { z } from 'zod'
import { ALL_TABLES, DEFAULT_EXPENSE_CATEGORIES, db, type TableName } from '@/db/db'
import { isNativeApp, saveFileNative } from '@/platform/native'

export const BACKUP_FORMAT = 'dejournal-backup'
export const BACKUP_VERSION = 1

interface EncodedBlob {
  $blob: true
  type: string
  data: string
}

function isEncodedBlob(v: unknown): v is EncodedBlob {
  return !!v && typeof v === 'object' && (v as EncodedBlob).$blob === true && typeof (v as EncodedBlob).data === 'string'
}

/* ---------- base64 helpers (browser + node) ---------- */

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

export function base64ToBlob(data: string, type: string): Blob {
  const bin = atob(data)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}

/** Deep-copy a value, replacing Blobs with encoded objects. */
export async function encodeValue(v: unknown): Promise<unknown> {
  if (v instanceof Blob) return { $blob: true, type: v.type, data: await blobToBase64(v) } satisfies EncodedBlob
  if (Array.isArray(v)) return Promise.all(v.map(encodeValue))
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) out[k] = await encodeValue(val)
    return out
  }
  return v
}

/** Deep-copy a value, turning encoded blobs back into Blobs. */
export function decodeValue(v: unknown): unknown {
  if (isEncodedBlob(v)) return base64ToBlob(v.data, v.type)
  if (Array.isArray(v)) return v.map(decodeValue)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) out[k] = decodeValue(val)
    return out
  }
  return v
}

/* ---------- envelope ---------- */

const envelopeSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().min(1),
  exportedAt: z.string(),
  includesPhotos: z.boolean(),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
})

export type BackupEnvelope = z.infer<typeof envelopeSchema>

const PHOTO_TABLES: TableName[] = ['photos', 'photoFiles']

export async function buildBackup(opts: { includePhotos: boolean }): Promise<BackupEnvelope> {
  const tables: Record<string, Record<string, unknown>[]> = {}
  for (const name of ALL_TABLES) {
    if (!opts.includePhotos && PHOTO_TABLES.includes(name)) continue
    const rows = await db.table(name).toArray()
    tables[name] = (await encodeValue(rows)) as Record<string, unknown>[]
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), includesPhotos: opts.includePhotos, tables }
}

/** Build a backup and trigger a file download (browser only). */
export async function downloadBackup(opts: { includePhotos: boolean }): Promise<{ bytes: number; rows: number }> {
  const env = await buildBackup(opts)
  const json = JSON.stringify(env)
  const blob = new Blob([json], { type: 'application/json' })
  const rows = Object.values(env.tables).reduce((s, r) => s + r.length, 0)
  const fileName = `dejournal-backup-${toISODate(new Date(env.exportedAt))}.json`
  if (isNativeApp()) {
    // Android app: let the user choose where to save (Downloads, Drive…).
    const saved = await saveFileNative(fileName, 'application/json', json)
    if (!saved) throw new BackupError('Export cancelled.')
    return { bytes: blob.size, rows }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { bytes: blob.size, rows }
}

export class BackupError extends Error {}

/** Parse and validate a backup file's text. Throws BackupError with a friendly message. */
export function parseBackup(text: string): BackupEnvelope {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError('This file is not valid JSON.')
  }
  const parsed = envelopeSchema.safeParse(raw)
  if (!parsed.success) throw new BackupError('This file is not a DeJournal backup.')
  if (parsed.data.version > BACKUP_VERSION) throw new BackupError('This backup was made by a newer version of DeJournal.')
  const unknown = Object.keys(parsed.data.tables).filter((t) => !(ALL_TABLES as readonly string[]).includes(t))
  if (unknown.length) throw new BackupError(`Backup contains unknown data: ${unknown.join(', ')}.`)
  return parsed.data
}

export function backupCounts(env: BackupEnvelope): Record<string, number> {
  return Object.fromEntries(Object.entries(env.tables).map(([k, v]) => [k, v.length]))
}

/**
 * Restore a backup. "replace" clears every table first; "merge" upserts rows
 * (records with the same id are overwritten by the backup copy).
 */
export async function importBackup(env: BackupEnvelope, mode: 'replace' | 'merge'): Promise<number> {
  let count = 0
  const tables = ALL_TABLES.map((n) => db.table(n))
  await db.transaction('rw', tables, async () => {
    if (mode === 'replace') {
      for (const t of tables) await t.clear()
    }
    for (const [name, rows] of Object.entries(env.tables)) {
      const decoded = rows.map((r) => decodeValue(r))
      await db.table(name).bulkPut(decoded)
      count += decoded.length
    }
    if (mode === 'replace' && !(env.tables.expenseCategories?.length)) {
      await db.expenseCategories.bulkPut(DEFAULT_EXPENSE_CATEGORIES)
    }
  })
  return count
}

/** Permanently delete all data and restore the built-in expense categories. */
export async function deleteAllData(): Promise<void> {
  const tables = ALL_TABLES.map((n) => db.table(n))
  await db.transaction('rw', tables, async () => {
    for (const t of tables) await t.clear()
    await db.expenseCategories.bulkAdd(DEFAULT_EXPENSE_CATEGORIES)
  })
}
