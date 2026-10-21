import { useEffect, useRef } from 'react'

/**
 * Back-button stack. Overlays (sheets, the photo viewer, focus full screen)
 * register a close handler while open; the Android back button closes the
 * top-most one before it navigates back. In browsers this is unused (Esc and
 * the browser's own back button behave as usual).
 */
const stack: Array<{ id: number; close: () => void }> = []
let nextId = 1

/** Close the top-most overlay. Returns true if one was closed. */
export function handleBack(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top.close()
  return true
}

/** Register `onBack` while `active` is true (defaults to while mounted). */
export function useBackHandler(onBack: () => void, active = true): void {
  const ref = useRef(onBack)
  ref.current = onBack
  useEffect(() => {
    if (!active) return
    const entry = { id: nextId++, close: () => ref.current() }
    stack.push(entry)
    return () => {
      const i = stack.findIndex((e) => e.id === entry.id)
      if (i >= 0) stack.splice(i, 1)
    }
  }, [active])
}

/** Install the global hook the Android app calls on back press. */
export function installBackHandler(): void {
  if (typeof window !== 'undefined') window.__djHandleBack = handleBack
}
