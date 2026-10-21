import { db } from './db'
import type { DayEntry, Highlight, ISODate, ReflectionAnswers } from './types'
import { nowISO, uid } from '@/lib/id'
import { undoToast } from '@/stores/ui'

/** Day-level data: rating, reflection answers, selfie link. One row per date. */

async function patchDay(date: ISODate, patch: Partial<DayEntry>): Promise<void> {
  await db.transaction('rw', db.days, async () => {
    const cur = await db.days.get(date)
    await db.days.put({ ...(cur ?? { date }), ...patch, date, updatedAt: nowISO() })
  })
}

export async function setRating(date: ISODate, rating: DayEntry['rating']): Promise<void> {
  await patchDay(date, { rating: rating ?? null })
}

export async function setReflection(date: ISODate, reflection: ReflectionAnswers): Promise<void> {
  await patchDay(date, { reflection })
}

export async function setSelfie(date: ISODate, photoId: string | null): Promise<void> {
  await patchDay(date, { selfiePhotoId: photoId })
}

export function hasReflection(r: ReflectionAnswers | undefined): boolean {
  return !!r && Object.values(r).some((v) => typeof v === 'string' && v.trim().length > 0)
}

/* Highlights (one primary highlight per date) */

export interface HighlightInput {
  title: string
  description?: string
  photoId?: string | null
  tags?: string[]
}

export async function saveHighlight(date: ISODate, input: HighlightInput): Promise<Highlight> {
  let result!: Highlight
  await db.transaction('rw', db.highlights, async () => {
    const existing = await db.highlights.where('date').equals(date).first()
    const now = nowISO()
    result = {
      id: existing?.id ?? uid(),
      date,
      title: input.title.trim(),
      description: input.description?.trim() || undefined,
      photoId: input.photoId ?? existing?.photoId ?? null,
      tags: input.tags ?? existing?.tags ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await db.highlights.put(result)
  })
  return result
}

export async function deleteHighlight(id: string): Promise<void> {
  const h = await db.highlights.get(id)
  if (!h) return
  await db.highlights.delete(id)
  undoToast('Highlight deleted', async () => {
    await db.highlights.put(h)
  })
}
