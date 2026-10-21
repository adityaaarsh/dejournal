import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import type { ISODate, Photo, PhotoLocation } from './types'
import { nowISO, uid } from '@/lib/id'
import { processImage } from '@/lib/image'
import { undoToast } from '@/stores/ui'
import { setSelfie } from './days'

/**
 * Photos are stored privately in IndexedDB as Blobs (never uploaded, never
 * given a public URL). Metadata + thumbnail in `photos`, full image in
 * `photoFiles` so listing a gallery doesn't load every full-size image.
 */

export interface PhotoInput {
  date: ISODate
  caption?: string
  tags?: string[]
  isSelfie?: boolean
  takenAt?: string | null
  location?: PhotoLocation | null
}

export async function savePhoto(file: Blob, input: PhotoInput): Promise<Photo> {
  const img = await processImage(file)
  const now = nowISO()
  const photo: Photo = {
    id: uid(),
    date: input.date,
    caption: input.caption?.trim() || undefined,
    tags: input.tags ?? [],
    isSelfie: !!input.isSelfie,
    takenAt: input.takenAt ?? null,
    location: input.location ?? null,
    width: img.width,
    height: img.height,
    mime: img.mime,
    thumb: img.thumb,
    createdAt: now,
    updatedAt: now,
  }
  await db.transaction('rw', db.photos, db.photoFiles, async () => {
    await db.photos.add(photo)
    await db.photoFiles.add({ id: photo.id, blob: img.blob })
  })
  if (photo.isSelfie) await setSelfie(photo.date, photo.id)
  return photo
}

export async function updatePhoto(id: string, patch: Partial<Pick<Photo, 'caption' | 'tags' | 'date' | 'location'>>): Promise<void> {
  const p = await db.photos.get(id)
  if (!p) return
  await db.photos.update(id, { ...patch, updatedAt: nowISO() })
  // Keep the selfie link on the right day if the date changes.
  if (p.isSelfie && patch.date && patch.date !== p.date) {
    const old = await db.days.get(p.date)
    if (old?.selfiePhotoId === id) await setSelfie(p.date, null)
    await setSelfie(patch.date, id)
  }
}

/**
 * Delete a photo. Records that referenced it (selfie, highlight, place) are
 * unlinked, never deleted. Undo restores the photo and the links.
 */
export async function deletePhoto(id: string): Promise<void> {
  const photo = await db.photos.get(id)
  if (!photo) return
  const file = await db.photoFiles.get(id)
  const days = await db.days.filter((d) => d.selfiePhotoId === id).toArray()
  const highlights = await db.highlights.filter((h) => h.photoId === id).toArray()
  const places = await db.places.filter((p) => p.photoId === id).toArray()
  await db.transaction('rw', [db.photos, db.photoFiles, db.days, db.highlights, db.places], async () => {
    await db.photos.delete(id)
    await db.photoFiles.delete(id)
    for (const d of days) await db.days.update(d.date, { selfiePhotoId: null })
    for (const h of highlights) await db.highlights.update(h.id, { photoId: null })
    for (const p of places) await db.places.update(p.id, { photoId: null })
  })
  undoToast('Photo deleted', async () => {
    await db.transaction('rw', [db.photos, db.photoFiles, db.days, db.highlights, db.places], async () => {
      await db.photos.put(photo)
      if (file) await db.photoFiles.put(file)
      for (const d of days) await db.days.put(d)
      for (const h of highlights) await db.highlights.put(h)
      for (const p of places) await db.places.put(p)
    })
  })
}

/** Object URL for a Blob, revoked automatically. */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

/** Thumbnail (default) or full-size image URL for a photo id. */
export function usePhotoUrl(id: string | null | undefined, variant: 'thumb' | 'full' = 'thumb'): string | null {
  const blob = useLiveQuery(async () => {
    if (!id) return null
    if (variant === 'full') return (await db.photoFiles.get(id))?.blob ?? null
    return (await db.photos.get(id))?.thumb ?? null
  }, [id, variant])
  return useObjectUrl(blob)
}
