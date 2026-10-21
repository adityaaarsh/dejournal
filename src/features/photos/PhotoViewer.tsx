import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, ChevronLeft, ChevronRight, PencilLine, Trash, UserRound, X } from 'lucide-react'
import { Button, Field, IconButton, Input, TagInput } from '@/components/ui'
import { db } from '@/db/db'
import { deletePhoto, updatePhoto, usePhotoUrl } from '@/db/photos'
import { formatDate, isISODate } from '@/lib/dates'
import { toast } from '@/stores/ui'
import { cn } from '@/lib/text'
import { useBackHandler } from '@/platform/back'

/**
 * Full-screen photo viewer. `ids` is the ordered list being browsed;
 * arrow keys / buttons move between them, Esc closes.
 */
export function PhotoViewer({
  ids,
  index,
  onIndexChange,
  onClose,
}: {
  ids: string[]
  index: number
  onIndexChange: (i: number) => void
  onClose: () => void
}) {
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const id = ids[index]
  const photo = useLiveQuery(() => (id ? db.photos.get(id) : undefined), [id])
  const fullUrl = usePhotoUrl(id, 'full')
  const thumbUrl = usePhotoUrl(id, 'thumb')
  const [editing, setEditing] = useState(false)
  const [caption, setCaption] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [date, setDate] = useState('')
  const [dateError, setDateError] = useState<string | null>(null)

  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // Fixed overlay rather than a modal <dialog> so the Undo toast stays clickable.
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
      prevFocus?.focus?.()
    }
  }, [])

  useEffect(() => setEditing(false), [id])
  useBackHandler(() => (editing ? setEditing(false) : closeRef.current()))

  const hasPrev = index > 0
  const hasNext = index < ids.length - 1

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editing) setEditing(false)
        else closeRef.current()
        return
      }
      if (editing) return
      if ((e.target as HTMLElement).closest('input, textarea')) return
      if (e.key === 'ArrowLeft' && hasPrev) onIndexChange(index - 1)
      if (e.key === 'ArrowRight' && hasNext) onIndexChange(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, hasPrev, hasNext, editing, onIndexChange])

  // Photo was deleted (or never existed).
  useEffect(() => {
    if (photo === undefined && id) {
      const t = setTimeout(async () => {
        if (!(await db.photos.get(id))) {
          if (ids.length <= 1) closeRef.current()
        }
      }, 50)
      return () => clearTimeout(t)
    }
  }, [photo, id, ids.length])

  const startEdit = () => {
    if (!photo) return
    setCaption(photo.caption ?? '')
    setTags(photo.tags)
    setDate(photo.date)
    setDateError(null)
    setEditing(true)
  }

  const saveEdit = async () => {
    if (!photo) return
    if (!isISODate(date)) {
      setDateError('Choose a valid date.')
      return
    }
    await updatePhoto(photo.id, { caption: caption.trim() || undefined, tags, date })
    setEditing(false)
    toast('Photo updated')
  }

  const remove = async () => {
    if (!photo) return
    const next = hasNext ? index : index - 1
    await deletePhoto(photo.id)
    if (ids.length <= 1) onClose()
    else onIndexChange(Math.max(0, next))
  }

  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label="Photo viewer" className="fixed inset-0 z-50">
      <div className="flex h-full w-full flex-col bg-black text-white">
        {/* Top bar */}
        <div className="flex items-center gap-1 px-2 pt-[max(env(safe-area-inset-top),8px)] pb-2">
          <IconButton icon={X} label="Close" onClick={onClose} className="text-white/80 hover:bg-white/10 hover:text-white" />
          <div className="min-w-0 flex-1 px-1">
            {photo && (
              <>
                <p className="truncate text-sm font-medium">{formatDate(photo.date, 'EEE, d MMM yyyy')}</p>
                <p className="text-xs text-white/60">
                  {index + 1} of {ids.length}
                  {photo.isSelfie && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[11px]">
                      <UserRound size={11} aria-hidden /> Selfie
                    </span>
                  )}
                </p>
              </>
            )}
          </div>
          {photo && (
            <>
              <IconButton
                icon={CalendarDays}
                label="Go to day"
                onClick={() => {
                  onClose()
                  navigate(`/?d=${photo.date}`)
                }}
                className="text-white/80 hover:bg-white/10 hover:text-white"
              />
              <IconButton icon={PencilLine} label="Edit details" onClick={startEdit} className="text-white/80 hover:bg-white/10 hover:text-white" />
              <IconButton icon={Trash} label="Delete photo" onClick={remove} className="text-white/80 hover:bg-white/10 hover:text-red-300" />
            </>
          )}
        </div>

        {/* Image */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
          {fullUrl || thumbUrl ? (
            <img
              src={fullUrl ?? thumbUrl ?? undefined}
              alt={photo?.caption || 'Photo'}
              className="max-h-full max-w-full rounded-lg object-contain select-none"
              draggable={false}
            />
          ) : (
            <div className="text-sm text-white/60">{photo === undefined ? 'Loading…' : 'Image not available'}</div>
          )}
          {hasPrev && (
            <button
              type="button"
              aria-label="Previous photo"
              onClick={() => onIndexChange(index - 1)}
              className="absolute top-1/2 left-2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70"
            >
              <ChevronLeft size={22} />
            </button>
          )}
          {hasNext && (
            <button
              type="button"
              aria-label="Next photo"
              onClick={() => onIndexChange(index + 1)}
              className="absolute top-1/2 right-2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70"
            >
              <ChevronRight size={22} />
            </button>
          )}
        </div>

        {/* Caption / edit panel */}
        <div className={cn('pb-safe px-4 pt-3 pb-4', editing && 'bg-surface text-text')}>
          {editing ? (
            <form
              className="mx-auto flex max-w-lg flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                saveEdit()
              }}
            >
              <Field label="Caption" optional>
                {(p) => <Input {...p} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={500} autoFocus />}
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Date" error={dateError}>
                  {(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
                </Field>
                <Field label="Tags" optional>
                  {(p) => <TagInput id={p.id} value={tags} onChange={setTags} />}
                </Field>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary">
                  Save
                </Button>
              </div>
            </form>
          ) : (
            photo && (
              <div className="mx-auto max-w-lg text-center">
                {photo.caption ? <p className="text-[15px]">{photo.caption}</p> : <p className="text-sm text-white/50">No caption</p>}
                {photo.tags.length > 0 && <p className="mt-1 text-xs text-white/60">{photo.tags.map((t) => `#${t}`).join(' ')}</p>}
                {photo.location && (
                  <p className="mt-1 text-xs text-white/50 tabular-nums">
                    {photo.location.label ?? `${photo.location.lat}, ${photo.location.lng}`}
                  </p>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
