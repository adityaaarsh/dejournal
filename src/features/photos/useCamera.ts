import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Live camera via getUserMedia. Tracks are always stopped on stop()/unmount.
 * Errors are translated into friendly messages; callers should offer upload instead.
 */
export function cameraSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

function describeError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Camera access was denied. You can allow it in your browser settings, or upload a photo instead.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device. Upload a photo instead.'
  if (name === 'NotReadableError') return 'The camera is in use by another app. Close it and try again, or upload a photo.'
  return 'The camera could not be started. Upload a photo instead.'
}

export function useCamera(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const streamRef = useRef<MediaStream | null>(null)
  const [active, setActive] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setActive(false)
  }, [videoRef])

  const start = useCallback(
    async (facingMode: 'user' | 'environment') => {
      stop()
      setError(null)
      if (!cameraSupported()) {
        setError('This browser cannot access a camera. Upload a photo instead.')
        return false
      }
      setStarting(true)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        })
        streamRef.current = stream
        // The <video> may mount in the same render that started the camera.
        if (!videoRef.current) await new Promise((r) => requestAnimationFrame(() => r(null)))
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => undefined)
        }
        setActive(true)
        return true
      } catch (e) {
        setError(describeError(e))
        return false
      } finally {
        setStarting(false)
      }
    },
    [stop, videoRef],
  )

  /** Grab the current frame as a JPEG blob (mirrored for the front camera). */
  const capture = useCallback(
    async (mirror: boolean): Promise<Blob | null> => {
      const v = videoRef.current
      if (!v || !v.videoWidth) return null
      const canvas = document.createElement('canvas')
      canvas.width = v.videoWidth
      canvas.height = v.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      if (mirror) {
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
      }
      ctx.drawImage(v, 0, 0)
      return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92))
    },
    [videoRef],
  )

  useEffect(() => stop, [stop])

  return { start, stop, capture, active, starting, error, setError }
}
