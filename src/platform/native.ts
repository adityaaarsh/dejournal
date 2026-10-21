/**
 * Bridge to the DeJournal Android app (android/ — Kotlin).
 *
 * When the web UI runs inside the Android app, the Kotlin side injects
 * `window.DeJournalNative` (a @JavascriptInterface object). Its methods are
 * synchronous and only take/return strings, numbers and booleans. Results of
 * slow operations (permission prompts, save dialogs) arrive later as
 * `dj-native` events on window.
 *
 * In a normal browser none of this exists and `isNativeApp()` is false, so
 * every caller keeps its web behaviour.
 */

interface NativeBridge {
  getInfo(): string
  notificationPermission(): string
  requestNotificationPermission(): void
  canScheduleExactAlarms(): boolean
  openExactAlarmSettings(): void
  scheduleReminders(json: string): void
  takePendingActions(): string
  usageAccessGranted(): boolean
  openUsageAccessSettings(): void
  getScreenTime(startDate: string, endDate: string): string
  saveFile(fileName: string, mime: string, base64: string): void
  setSystemBars(theme: string): void
  openExternal(url: string): void
  showNotification(title: string, body: string): void
}

declare global {
  interface Window {
    DeJournalNative?: NativeBridge
    /** Called by the Android back button. Return true if the UI handled it. */
    __djHandleBack?: () => boolean
  }
}

export type NativeEvent =
  | { type: 'notification-permission'; state: 'granted' | 'denied' | 'default' }
  | { type: 'file-saved'; ok: boolean; error?: string }
  | { type: 'resume' }
  | { type: 'pending-actions' }

function bridge(): NativeBridge | null {
  return typeof window !== 'undefined' && window.DeJournalNative ? window.DeJournalNative : null
}

export function isNativeApp(): boolean {
  return bridge() !== null
}

export interface NativeInfo {
  platform: 'android'
  appVersion: string
  sdkInt: number
}

export function nativeInfo(): NativeInfo | null {
  const b = bridge()
  if (!b) return null
  try {
    return JSON.parse(b.getInfo()) as NativeInfo
  } catch {
    return null
  }
}

/** Subscribe to events sent by the Android app. Returns an unsubscribe function. */
export function onNativeEvent(handler: (e: NativeEvent) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<NativeEvent>).detail)
  window.addEventListener('dj-native', listener)
  return () => window.removeEventListener('dj-native', listener)
}

function waitFor<T extends NativeEvent['type']>(type: T, timeoutMs: number): Promise<Extract<NativeEvent, { type: T }> | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      off()
      resolve(null)
    }, timeoutMs)
    const off = onNativeEvent((e) => {
      if (e.type !== type) return
      clearTimeout(timer)
      off()
      resolve(e as Extract<NativeEvent, { type: T }>)
    })
  })
}

/* ---------------- Notifications & reminders ---------------- */

export function nativeNotificationPermission(): 'granted' | 'denied' | 'default' {
  const s = bridge()?.notificationPermission()
  return s === 'granted' || s === 'denied' ? s : 'default'
}

export async function requestNativeNotificationPermission(): Promise<'granted' | 'denied' | 'default'> {
  const b = bridge()
  if (!b) return 'default'
  const result = waitFor('notification-permission', 120_000)
  b.requestNotificationPermission()
  return (await result)?.state ?? nativeNotificationPermission()
}

export function canScheduleExactAlarms(): boolean {
  return bridge()?.canScheduleExactAlarms() ?? true
}

export function openExactAlarmSettings(): void {
  bridge()?.openExactAlarmSettings()
}

/** One notification the Android app should show at `at` (epoch ms). */
export interface NativeAlarm {
  key: string
  id: string
  date: string
  title: string
  body: string
  at: number
}

/** Replace every scheduled reminder alarm with this list. */
export function scheduleNativeReminders(alarms: NativeAlarm[]): void {
  bridge()?.scheduleReminders(JSON.stringify(alarms))
}

export interface PendingAction {
  action: 'snooze' | 'done'
  id: string
  date: string
  /** For snooze: when the snoozed notification will fire (epoch ms). */
  until?: number
}

/** Notification button presses made while the UI wasn't running. */
export function takePendingActions(): PendingAction[] {
  const b = bridge()
  if (!b) return []
  try {
    return JSON.parse(b.takePendingActions()) as PendingAction[]
  } catch {
    return []
  }
}

export function showNativeNotification(title: string, body: string): boolean {
  const b = bridge()
  if (!b || nativeNotificationPermission() !== 'granted') return false
  b.showNotification(title, body)
  return true
}

/* ---------------- Screen time ---------------- */

export function usageAccessGranted(): boolean {
  return bridge()?.usageAccessGranted() ?? false
}

export function openUsageAccessSettings(): void {
  bridge()?.openUsageAccessSettings()
}

/** Minutes of app use per local date, read from Android's usage stats. */
export function readNativeScreenTime(startDate: string, endDate: string): Record<string, number> {
  const b = bridge()
  if (!b) return {}
  try {
    return JSON.parse(b.getScreenTime(startDate, endDate)) as Record<string, number>
  } catch {
    return {}
  }
}

/* ---------------- Files, system UI, links ---------------- */

/** Ask the user where to save a file (Android "Save as" dialog). */
export async function saveFileNative(fileName: string, mime: string, text: string): Promise<boolean> {
  const b = bridge()
  if (!b) return false
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  const result = waitFor('file-saved', 10 * 60_000)
  b.saveFile(fileName, mime, btoa(bin))
  const r = await result
  if (r && !r.ok && r.error) throw new Error(r.error)
  return !!r?.ok
}

export function setNativeSystemBars(theme: 'dark' | 'light'): void {
  bridge()?.setSystemBars(theme)
}

export function openExternal(url: string): void {
  const b = bridge()
  if (b) b.openExternal(url)
  else window.open(url, '_blank', 'noopener')
}
