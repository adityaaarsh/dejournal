/** Browser image helpers: downscale and re-encode photos before storing them. */

export interface ProcessedImage {
  blob: Blob
  thumb: Blob
  width: number
  height: number
  mime: string
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
const MAX_EDGE = 2048
const THUMB_EDGE = 400

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      // imageOrientation honours EXIF rotation from phone cameras.
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function draw(src: ImageBitmap | HTMLImageElement, maxEdge: number, type: string, quality: number): Promise<{ blob: Blob; w: number; h: number }> {
  const sw = 'naturalWidth' in src ? src.naturalWidth : src.width
  const sh = 'naturalHeight' in src ? src.naturalHeight : src.height
  const scale = Math.min(1, maxEdge / Math.max(sw, sh))
  const w = Math.max(1, Math.round(sw * scale))
  const h = Math.max(1, Math.round(sh * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.drawImage(src, 0, 0, w, h)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve({ blob: b, w, h }) : reject(new Error('Could not encode image'))), type, quality),
  )
}

/** Validate, downscale to ≤2048px (JPEG) and make a ≤400px thumbnail. */
export async function processImage(file: Blob): Promise<ProcessedImage> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image.')
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Image is larger than 25 MB.')
  const src = await loadBitmap(file)
  const keepPng = file.type === 'image/png' && file.size < 1.5 * 1024 * 1024
  const mime = keepPng ? 'image/png' : 'image/jpeg'
  const full = await draw(src, MAX_EDGE, mime, 0.86)
  const thumb = await draw(src, THUMB_EDGE, 'image/jpeg', 0.78)
  if ('close' in src) src.close()
  return { blob: full.blob, thumb: thumb.blob, width: full.w, height: full.h, mime }
}
