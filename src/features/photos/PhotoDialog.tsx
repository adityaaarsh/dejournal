import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, Images, MapPin, RefreshCw, SwitchCamera, Upload, X } from 'lucide-react'
import { Button, Field, Input, Notice, Sheet, TagInput, Toggle } from '@/components/ui'
import type { DialogProps } from '@/features/quick/DialogHost'
import { db } from '@/db/db'
import { savePhoto, useObjectUrl, usePhotoUrl } from '@/db/photos'
import { setSelfie } from '@/db/days'
import type { PhotoLocation } from '@/db/types'
import { isISODate, nowHHmm, relativeDayLabel, today } from '@/lib/dates'
import { useSettings } from '@/stores/settings'
import { toast, undoToast } from '@/stores/ui'
import { cameraSupported, useCamera } from './useCamera'

type Step = 'manage' | 'choose' | 'camera' | 'preview'

/**
 * Add a photo (or the day's selfie) to a date: camera capture or upload,
 * preview, caption/tags/date, optional location, then save locally.
 */
export default function PhotoDialog({ request, onClose }: DialogProps<'photo'>) {
  const navigate = useNavigate()
  const settings = useSettings()
  const initialDate = request.date ?? today()
  const [date, setDate] = useState(initialDate)
  const [asSelfie, setAsSelfie] = useState(!!request.selfie)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [fromCamera, setFromCamera] = useState(false)
  const [caption, setCaption] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [location, setLocation] = useState<PhotoLocation | null>(null)
  const [locating, setLocating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [facing, setFacing] = useState<'user' | 'environment'>(request.selfie ? 'user' : 'environment')

  const videoRef = useRef<HTMLVideoElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const captureRef = useRef<HTMLInputElement>(null)
  const cam = useCamera(videoRef)
  const previewUrl = useObjectUrl(blob)

  // The selected date's current selfie (if any).
  const day = useLiveQuery(() => db.days.get(date), [date])
  const existingSelfieId = day?.selfiePhotoId ?? null
  const existingSelfieUrl = usePhotoUrl(existingSelfieId)

  const [step, setStep] = useState<Step>('choose')
  const decided = useRef(false)
  useEffect(() => {
    // Opening the selfie action on a day that already has one → manage it first.
    if (decided.current || day === undefined) return
    decided.current = true
    if (request.selfie && day?.selfiePhotoId) setStep('manage')
  }, [day, request.selfie])

  const startCamera = async (mode = facing) => {
    setError(null)
    setStep('camera')
    const ok = await cam.start(mode)
    if (!ok) setStep('choose')
  }

  const onCapture = async () => {
    const b = await cam.capture(facing === 'user')
    cam.stop()
    if (!b) {
      setError('Could not capture a photo. Try again or upload one.')
      setStep('choose')
      return
    }
    setBlob(b)
    setFromCamera(true)
    setStep('preview')
  }

  const onFile = (file: File | undefined, camera = false) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('That file is not an image.')
      return
    }
    setError(null)
    setBlob(file)
    setFromCamera(camera)
    setStep('preview')
  }

  const retake = () => {
    setBlob(null)
    setStep('choose')
  }

  const addLocation = () => {
    if (!navigator.geolocation) {
      setError('Location is not available in this browser.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: Math.round(pos.coords.latitude * 1e5) / 1e5, lng: Math.round(pos.coords.longitude * 1e5) / 1e5 })
        setLocating(false)
      },
      (e) => {
        setLocating(false)
        setError(e.code === e.PERMISSION_DENIED ? 'Location permission was denied.' : 'Could not get your location.')
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    )
  }

  const save = async () => {
    if (!blob) return
    if (!isISODate(date)) {
      setError('Choose a valid date.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const previous = asSelfie ? (await db.days.get(date))?.selfiePhotoId : null
      await savePhoto(blob, {
        date,
        caption,
        tags,
        isSelfie: asSelfie,
        takenAt: fromCamera ? new Date().toISOString() : null,
        location,
      })
      // The replaced selfie stays in the gallery as a normal photo.
      if (previous) await db.photos.update(previous, { isSelfie: false })
      toast(asSelfie ? 'Selfie saved' : 'Photo saved', { tone: 'success' })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the photo.')
    } finally {
      setSaving(false)
    }
  }

  const removeFromDay = async () => {
    const id = existingSelfieId
    if (!id) return
    await setSelfie(date, null)
    await db.photos.update(id, { isSelfie: false })
    onClose()
    undoToast('Selfie removed from this day', async () => {
      await setSelfie(date, id)
      await db.photos.update(id, { isSelfie: true })
    })
  }

  const close = () => {
    cam.stop()
    onClose()
  }

  const title = request.selfie ? 'Daily selfie' : 'Add photo'
  const replacing = asSelfie && existingSelfieId && step === 'preview'

  return (
    <Sheet
      title={title}
      description={relativeDayLabel(date, settings.dateFormat)}
      onClose={close}
      onSubmit={step === 'preview' ? save : undefined}
      footer={
        step === 'preview' ? (
          <>
            <Button variant="ghost" onClick={retake} icon={RefreshCw}>
              Retake
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              Save
            </Button>
          </>
        ) : undefined
      }
    >
      {/* Hidden file inputs */}
      <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <input
        ref={captureRef}
        type="file"
        accept="image/*"
        capture={facing}
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0], true)}
      />

      {error && (
        <Notice tone="danger" className="mb-4">
          {error}
        </Notice>
      )}

      {step === 'manage' && existingSelfieId && (
        <div className="flex flex-col items-center gap-4">
          {existingSelfieUrl ? (
            <img src={existingSelfieUrl} alt="This day's selfie" className="h-48 w-48 rounded-full object-cover" />
          ) : (
            <div className="h-48 w-48 rounded-full bg-surface-2" />
          )}
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
            <Button icon={Camera} onClick={() => setStep('choose')}>
              Replace
            </Button>
            <Button
              icon={Images}
              onClick={() => {
                close()
                navigate(`/photos?open=${existingSelfieId}`)
              }}
            >
              View
            </Button>
            <Button variant="danger" icon={X} onClick={removeFromDay}>
              Remove from day
            </Button>
          </div>
          <p className="text-center text-xs text-faint">Removing keeps the photo in your gallery.</p>
        </div>
      )}

      {step === 'choose' && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => (cameraSupported() ? startCamera() : captureRef.current?.click())}
              className="flex h-28 flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2 text-sm font-medium hover:bg-surface-3"
            >
              <Camera size={24} className="text-accent" aria-hidden />
              Take photo
            </button>
            <button
              type="button"
              onClick={() => uploadRef.current?.click()}
              className="flex h-28 flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2 text-sm font-medium hover:bg-surface-3"
            >
              <Upload size={24} className="text-accent" aria-hidden />
              Upload
            </button>
          </div>
          <p className="text-center text-xs text-faint">Photos are stored only on this device.</p>
        </div>
      )}

      {step === 'camera' && (
        <div className="flex flex-col items-center gap-3">
          <div className="relative w-full overflow-hidden rounded-2xl bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              aria-label="Camera preview"
              className="aspect-[3/4] w-full object-cover sm:aspect-[4/3]"
              style={facing === 'user' ? { transform: 'scaleX(-1)' } : undefined}
            />
            {cam.starting && <div className="absolute inset-0 grid place-items-center text-sm text-white/80">Starting camera…</div>}
          </div>
          <div className="flex w-full items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => {
                cam.stop()
                setStep('choose')
              }}
            >
              Cancel
            </Button>
            <button
              type="button"
              aria-label="Capture photo"
              disabled={!cam.active}
              onClick={onCapture}
              className="grid h-16 w-16 place-items-center rounded-full border-4 border-white/80 bg-white/10 transition-transform active:scale-95 disabled:opacity-40"
            >
              <span className="h-11 w-11 rounded-full bg-white" />
            </button>
            <Button
              variant="ghost"
              icon={SwitchCamera}
              aria-label="Switch camera"
              onClick={() => {
                const next = facing === 'user' ? 'environment' : 'user'
                setFacing(next)
                startCamera(next)
              }}
            >
              <span className="sr-only sm:not-sr-only">Flip</span>
            </Button>
          </div>
        </div>
      )}

      {step === 'preview' && previewUrl && (
        <div className="flex flex-col gap-4">
          <img src={previewUrl} alt="Preview" className="max-h-[38dvh] w-full rounded-2xl bg-surface-2 object-contain" />
          {replacing && (
            <Notice tone="warn">This replaces the day's selfie. The previous photo stays in your gallery.</Notice>
          )}
          <Field label="Caption" optional>
            {(p) => <Input {...p} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="What's happening?" maxLength={500} />}
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Date">
              {(p) => <Input {...p} type="date" value={date} max="9999-12-31" onChange={(e) => setDate(e.target.value)} required />}
            </Field>
            <Field label="Tags" optional>
              {(p) => <TagInput id={p.id} value={tags} onChange={setTags} />}
            </Field>
          </div>
          <Toggle checked={asSelfie} onChange={setAsSelfie} label="Use as the day's selfie" />
          {settings.locationEnabled && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5">
              <div className="min-w-0 text-[13px]">
                {location ? (
                  <span className="tabular-nums">
                    <MapPin size={14} className="mr-1 inline text-accent" aria-hidden />
                    {location.lat}, {location.lng}
                  </span>
                ) : (
                  <span className="text-muted">Attach your current location (asked only when you tap).</span>
                )}
              </div>
              {location ? (
                <Button size="sm" variant="ghost" onClick={() => setLocation(null)}>
                  Remove
                </Button>
              ) : (
                <Button size="sm" icon={MapPin} loading={locating} onClick={addLocation}>
                  Add
                </Button>
              )}
            </div>
          )}
          <p className="text-xs text-faint">
            Saved privately on this device{fromCamera ? ` · captured ${nowHHmm()}` : ''}.
          </p>
        </div>
      )}
    </Sheet>
  )
}
