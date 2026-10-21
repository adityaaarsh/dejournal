import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { BackupError, base64ToBlob, blobToBase64, buildBackup, decodeValue, deleteAllData, encodeValue, importBackup, parseBackup } from './backup'
import { db } from '@/db/db'

describe('blob encoding', () => {
  it('round-trips binary data', async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128])
    const b64 = await blobToBase64(new Blob([bytes], { type: 'image/jpeg' }))
    const back = base64ToBlob(b64, 'image/jpeg')
    expect(back.type).toBe('image/jpeg')
    expect(Array.from(new Uint8Array(await back.arrayBuffer()))).toEqual(Array.from(bytes))
  })

  it('encodes nested blobs and decodes them back', async () => {
    const value = { id: 'p', thumb: new Blob(['hi'], { type: 'text/plain' }), tags: ['a'], n: 1, nested: { x: null } }
    const enc = (await encodeValue(value)) as Record<string, unknown>
    expect(enc.thumb).toMatchObject({ $blob: true, type: 'text/plain' })
    expect(JSON.parse(JSON.stringify(enc))).toEqual(enc)
    const dec = decodeValue(enc) as typeof value
    expect(dec.thumb).toBeInstanceOf(Blob)
    expect(await dec.thumb.text()).toBe('hi')
    expect(dec.tags).toEqual(['a'])
  })
})

describe('parseBackup', () => {
  it('rejects non-JSON and foreign files', () => {
    expect(() => parseBackup('nope')).toThrow(BackupError)
    expect(() => parseBackup('{"hello":1}')).toThrow('not a DeJournal backup')
  })

  it('rejects newer versions and unknown tables', () => {
    const base = { format: 'dejournal-backup', exportedAt: 'x', includesPhotos: false }
    expect(() => parseBackup(JSON.stringify({ ...base, version: 99, tables: {} }))).toThrow('newer version')
    expect(() => parseBackup(JSON.stringify({ ...base, version: 1, tables: { evil: [] } }))).toThrow('unknown data')
  })
})

describe('export / import round trip', () => {
  it('restores data and blobs, and delete-all reseeds categories', async () => {
    await db.open()
    await db.notes.add({ id: 'n1', title: 'Hello', content: 'World', tags: [], pinned: false, archived: false, createdAt: 'a', updatedAt: 'a' })
    await db.photoFiles.add({ id: 'p1', blob: new Blob(['img'], { type: 'image/png' }) })

    const env = parseBackup(JSON.stringify(await buildBackup({ includePhotos: true })))
    expect(env.tables.notes).toHaveLength(1)

    const noPhotos = await buildBackup({ includePhotos: false })
    expect(noPhotos.tables.photoFiles).toBeUndefined()

    await deleteAllData()
    expect(await db.notes.count()).toBe(0)
    expect(await db.expenseCategories.count()).toBe(8)

    await importBackup(env, 'replace')
    expect((await db.notes.get('n1'))?.title).toBe('Hello')
    const file = await db.photoFiles.get('p1')
    expect(await file!.blob.text()).toBe('img')

    await db.notes.update('n1', { title: 'Changed' })
    await db.notes.add({ id: 'n2', title: 'Keep', content: '', tags: [], pinned: false, archived: false, createdAt: 'a', updatedAt: 'a' })
    await importBackup(env, 'merge')
    expect((await db.notes.get('n1'))?.title).toBe('Hello')
    expect(await db.notes.get('n2')).toBeTruthy()
  })
})
