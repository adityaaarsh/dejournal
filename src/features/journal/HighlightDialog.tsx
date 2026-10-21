import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ImagePlus, Trash } from 'lucide-react'
import { Button, Field, Input, Sheet, Spinner, TagInput, Textarea } from '@/components/ui'
import type { DialogProps } from '@/features/quick/DialogHost'
import { db } from '@/db/db'
import type { Photo } from '@/db/types'
import { deleteHighlight, saveHighlight } from '@/db/days'
import { savePhoto, useObjectUrl } from '@/db/photos'
import { relativeDayLabel } from '@/lib/dates'
import { cn } from '@/lib/text'
import { useSettings } from '@/stores/settings'
import { toast } from '@/stores/ui'

function PhotoChoice({ photo, selected, onClick }: { photo: Photo; selected: boolean; onClick: () => void }) {
  const url = useObjectUrl(photo.thumb)
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={photo.caption ? `Photo: ${photo.caption}` : 'Photo'}
      onClick={onClick}
      className={cn(
        'relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition-colors',
        selected ? 'border-accent' : 'border-transparent',
      )}
    >
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
      {selected && (
        <span className="absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-accent text-on-accent">
          <Check size={12} strokeWidth={3} aria-hidden />
        </span>
      )}
    </button>
  )
}

/** Create or edit the one primary highlight for a date. */
export default function HighlightDialog({ request, onClose }: DialogProps<'highlight'>) {
  const settings = useSettings()
  const date = request.date
  const current = useLiveQuery(async () => (await db.highlights.where('date').equals(date).first()) ?? null, [date])
  const photos = useLiveQuery(() => db.photos.where('date').equals(date).reverse().sortBy('createdAt'), [date])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [photoId, setPhotoId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (current === undefined || loaded) return
    const h = request.highlight ?? current
    if (h) {
      setTitle(h.title)
      setDescription(h.description ?? '')
      setTags(h.tags)
      setPhotoId(h.photoId ?? null)
    }
    setLoaded(true)
  }, [current, loaded, request.highlight])

  async function save() {
    if (!title.trim()) {
      setError('Write a short title for the highlight.')
      return
    }
    setBusy(true)
    try {
      await saveHighlight(date, { title, description, tags, photoId })
      toast('Highlight saved')
      onClose()
    } catch (e) {
      console.error(e)
      toast('Could not save the highlight.', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      const p = await savePhoto(file, { date, caption: title.trim() || undefined })
      setPhotoId(p.id)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not add the photo.', { tone: 'error' })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Sheet
      title={current ? 'Edit highlight' : 'Highlight of the day'}
      description={relativeDayLabel(date, settings.dateFormat)}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          {current && (
            <Button
              variant="danger"
              icon={Trash}
              className="mr-auto"
              onClick={async () => {
                await deleteHighlight(current.id)
                onClose()
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="What was the best part of the day?" error={error}>
          {(p) => (
            <Input
              {...p}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setError(null)
              }}
              placeholder="e.g. Finished the Flutter layout chapter"
              maxLength={160}
              autoFocus
            />
          )}
        </Field>
        <Field label="More about it" optional>
          {(p) => <Textarea {...p} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <Field label="Tags" optional>
          {(p) => <TagInput id={p.id} value={tags} onChange={setTags} />}
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">
            Photo <span className="font-normal text-faint">(optional)</span>
          </span>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {(photos ?? []).map((p) => (
              <PhotoChoice key={p.id} photo={p} selected={photoId === p.id} onClick={() => setPhotoId(photoId === p.id ? null : p.id)} />
            ))}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="grid h-16 w-16 shrink-0 place-items-center rounded-xl border border-dashed border-line-strong text-muted hover:text-text"
              aria-label="Upload a photo"
            >
              {uploading ? <Spinner /> : <ImagePlus size={20} aria-hidden />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
        </div>
      </div>
    </Sheet>
  )
}
