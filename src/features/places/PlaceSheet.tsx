import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, LocateFixed, Trash } from 'lucide-react'
import { Button, Field, Input, Notice, Sheet, Textarea } from '@/components/ui'
import { db } from '@/db/db'
import { useObjectUrl } from '@/db/photos'
import { createRecord, removeWithUndo, updateRecord } from '@/db/repo'
import type { Photo, SavedPlace } from '@/db/types'
import { isISODate, today } from '@/lib/dates'
import { cn } from '@/lib/text'
import { useSettings } from '@/stores/settings'
import { toast } from '@/stores/ui'

function parseCoord(v: string, min: number, max: number): number | null | 'invalid' {
  const t = v.trim()
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n < min || n > max) return 'invalid'
  return Math.round(n * 1e6) / 1e6
}

function PhotoOption({ photo, selected, onSelect }: { photo: Photo; selected: boolean; onSelect: () => void }) {
  const url = useObjectUrl(photo.thumb)
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={photo.caption || 'Photo'}
      className={cn('relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-2', selected && 'ring-2 ring-accent')}
    >
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
      {selected && (
        <span className="absolute inset-0 grid place-items-center bg-black/40 text-white">
          <Check size={18} />
        </span>
      )}
    </button>
  )
}

/** Add or edit a saved place. Location is only read when the user taps the button. */
export function PlaceSheet({ place, defaultDate, onClose }: { place?: SavedPlace; defaultDate?: string; onClose: () => void }) {
  const settings = useSettings()
  const [name, setName] = useState(place?.name ?? '')
  const [address, setAddress] = useState(place?.address ?? '')
  const [date, setDate] = useState(place?.date ?? defaultDate ?? today())
  const [time, setTime] = useState(place?.time ?? '')
  const [note, setNote] = useState(place?.note ?? '')
  const [lat, setLat] = useState(place?.lat != null ? String(place.lat) : '')
  const [lng, setLng] = useState(place?.lng != null ? String(place.lng) : '')
  const [photoId, setPhotoId] = useState<string | null>(place?.photoId ?? null)
  const [source, setSource] = useState<SavedPlace['source']>(place?.source ?? 'manual')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const dayPhotos = useLiveQuery(() => (isISODate(date) ? db.photos.where('date').equals(date).toArray() : []), [date])

  const useCurrent = () => {
    if (!navigator.geolocation) {
      setLocError('Location is not available in this browser.')
      return
    }
    setLocating(true)
    setLocError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(Math.round(pos.coords.latitude * 1e5) / 1e5))
        setLng(String(Math.round(pos.coords.longitude * 1e5) / 1e5))
        setSource('device')
        setLocating(false)
      },
      (e) => {
        setLocating(false)
        setLocError(e.code === e.PERMISSION_DENIED ? 'Location permission was denied.' : 'Could not get your location.')
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  const save = async () => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Give the place a name.'
    if (!isISODate(date)) errs.date = 'Choose a valid date.'
    const la = parseCoord(lat, -90, 90)
    const ln = parseCoord(lng, -180, 180)
    if (la === 'invalid') errs.lat = 'Latitude must be between -90 and 90.'
    if (ln === 'invalid') errs.lng = 'Longitude must be between -180 and 180.'
    if (la !== 'invalid' && ln !== 'invalid' && (la === null) !== (ln === null)) errs.lng = 'Enter both latitude and longitude, or neither.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    const data = {
      name: name.trim(),
      address: address.trim() || undefined,
      date,
      time: time || null,
      note: note.trim() || undefined,
      lat: la as number | null,
      lng: ln as number | null,
      photoId,
      source,
    }
    try {
      if (place) await updateRecord(db.places, place.id, data)
      else await createRecord(db.places, data)
      toast(place ? 'Place updated' : 'Place saved')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      title={place ? 'Edit place' : 'Add place'}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          {place && (
            <Button
              variant="danger"
              icon={Trash}
              className="mr-auto"
              onClick={async () => {
                await removeWithUndo(db.places, place.id, 'Place')
                onClose()
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" error={errors.name}>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lodhi Garden" maxLength={120} autoFocus={!place} />}
        </Field>
        <Field label="Address" optional>
          {(p) => <Input {...p} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={240} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" error={errors.date}>
            {(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
          <Field label="Time" optional>
            {(p) => <Input {...p} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}
          </Field>
        </div>
        <Field label="Note" optional>
          {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} />}
        </Field>

        <fieldset className="flex flex-col gap-3 rounded-2xl border border-line p-3.5">
          <legend className="px-1 text-[13px] font-medium text-muted">Coordinates (optional)</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude" error={errors.lat}>
              {(p) => <Input {...p} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="28.5933" />}
            </Field>
            <Field label="Longitude" error={errors.lng}>
              {(p) => <Input {...p} inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="77.2197" />}
            </Field>
          </div>
          {settings.locationEnabled ? (
            <Button icon={LocateFixed} loading={locating} onClick={useCurrent} size="sm" className="self-start">
              Use my current location
            </Button>
          ) : (
            <p className="text-xs text-faint">
              Device location is off. You can type coordinates, or enable location in{' '}
              <Link to="/settings#privacy" className="text-accent hover:underline" onClick={onClose}>
                Settings → Privacy
              </Link>
              .
            </p>
          )}
          {locError && <Notice tone="danger">{locError}</Notice>}
        </fieldset>

        {dayPhotos && dayPhotos.length > 0 && (
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-muted">Attach a photo from this day</p>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {dayPhotos.map((ph) => (
                <PhotoOption key={ph.id} photo={ph} selected={photoId === ph.id} onSelect={() => setPhotoId(photoId === ph.id ? null : ph.id)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  )
}
