import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { createSeries, deleteSeries, deleteTask, materializeSeries, seriesDatesBetween, toggleTask, updateSeries } from './tasks'
import { addDays, today } from '@/lib/dates'

// Undo toasts touch a zustand store only — harmless in node.

beforeEach(async () => {
  await db.tasks.clear()
  await db.taskSeries.clear()
})

describe('recurring tasks', () => {
  it('materializes one occurrence per day up to the horizon, idempotently', async () => {
    const start = today()
    const s = await createSeries({ title: 'Drink water', date: start, recurrence: { type: 'daily' } })
    const count1 = await db.tasks.where('seriesId').equals(s.id).count()
    expect(count1).toBe(15) // today + 14 days
    await materializeSeries()
    await materializeSeries(addDays(start, 14))
    expect(await db.tasks.where('seriesId').equals(s.id).count()).toBe(15)
  })

  it('treats each occurrence independently for completion', async () => {
    const start = today()
    const s = await createSeries({ title: 'Read', date: start, recurrence: { type: 'daily' } })
    const first = await db.tasks.where('[seriesId+date]').equals([s.id, start]).first()
    await toggleTask(first!.id)
    const done = await db.tasks.where('seriesId').equals(s.id).filter((t) => t.completed).count()
    expect(done).toBe(1)
  })

  it('does not regenerate an individually deleted occurrence', async () => {
    const start = today()
    const s = await createSeries({ title: 'Gym', date: start, recurrence: { type: 'daily' } })
    const second = await db.tasks.where('[seriesId+date]').equals([s.id, addDays(start, 1)]).first()
    await deleteTask(second!.id)
    await db.taskSeries.update(s.id, { materializedThrough: addDays(start, -1) })
    await materializeSeries(addDays(start, 14))
    expect(await db.tasks.where('[seriesId+date]').equals([s.id, addDays(start, 1)]).count()).toBe(0)
    expect((await db.taskSeries.get(s.id))!.exceptions).toContain(addDays(start, 1))
  })

  it('supports selected weekdays', () => {
    const dates = seriesDatesBetween(
      {
        id: 'x',
        title: 'x',
        priority: 'normal',
        tags: [],
        recurrence: { type: 'days', days: [1, 3] }, // Mon, Wed
        startDate: '2026-10-19', // Monday
        exceptions: [],
        createdAt: '',
        updatedAt: '',
      },
      '2026-10-19',
      '2026-10-25',
    )
    expect(dates).toEqual(['2026-10-19', '2026-10-21'])
  })

  it('applies metadata edits to future incomplete occurrences only', async () => {
    const start = today()
    const s = await createSeries({ title: 'Old', date: start, recurrence: { type: 'daily' } })
    const first = await db.tasks.where('[seriesId+date]').equals([s.id, start]).first()
    await toggleTask(first!.id)
    await updateSeries(s.id, { title: 'New' }, start)
    expect((await db.tasks.get(first!.id))!.title).toBe('Old')
    const later = await db.tasks.where('[seriesId+date]').equals([s.id, addDays(start, 3)]).first()
    expect(later!.title).toBe('New')
  })

  it('splits the series when the recurrence changes mid-way', async () => {
    const start = today()
    const s = await createSeries({ title: 'Run', date: start, recurrence: { type: 'daily' } })
    const from = addDays(start, 3)
    await updateSeries(s.id, { recurrence: { type: 'weekly' } }, from)
    const old = await db.taskSeries.get(s.id)
    expect(old!.endDate).toBe(addDays(from, -1))
    const all = await db.taskSeries.toArray()
    expect(all).toHaveLength(2)
    const fresh = all.find((x) => x.id !== s.id)!
    expect(fresh.startDate).toBe(from)
    // Old series keeps only its 3 days; new weekly series has from, from+7, from+14 (≤ horizon)
    expect(await db.tasks.where('seriesId').equals(s.id).count()).toBe(3)
    const freshDates = (await db.tasks.where('seriesId').equals(fresh.id).toArray()).map((t) => t.date).sort()
    expect(freshDates[0]).toBe(from)
    expect(freshDates.every((d, i) => i === 0 || d === addDays(freshDates[i - 1], 7))).toBe(true)
  })

  it('stopping a series keeps completed history', async () => {
    vi.useRealTimers()
    const start = today()
    const s = await createSeries({ title: 'Walk', date: start, recurrence: { type: 'daily' } })
    const first = await db.tasks.where('[seriesId+date]').equals([s.id, start]).first()
    await toggleTask(first!.id)
    await deleteSeries(s.id, start)
    expect(await db.taskSeries.get(s.id)).toBeUndefined()
    const remaining = await db.tasks.where('seriesId').equals(s.id).toArray()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].completed).toBe(true)
  })

  it('stopping from a later date ends the series the day before', async () => {
    const start = today()
    const s = await createSeries({ title: 'Walk', date: start, recurrence: { type: 'daily' } })
    await deleteSeries(s.id, addDays(start, 2))
    expect((await db.taskSeries.get(s.id))!.endDate).toBe(addDays(start, 1))
    expect(await db.tasks.where('seriesId').equals(s.id).count()).toBe(2)
  })
})
