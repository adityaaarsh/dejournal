/**
 * Notification helpers.
 *
 * Reminders are scheduled in the page (see ReminderScheduler) and displayed
 * through the service worker so they can carry Snooze / Done buttons. This
 * works while DeJournal is open in any tab, including background tabs. A web
 * app that is fully closed cannot be woken reliably without a push server,
 * which DeJournal (local-first, no backend) does not use.
 */

import { isNativeApp, nativeNotificationPermission, requestNativeNotificationPermission } from '@/platform/native'

export type PermissionState = NotificationPermission | 'unsupported'

export function notificationsSupported(): boolean {
  return isNativeApp() || (typeof window !== 'undefined' && 'Notification' in window)
}

export function permissionState(): PermissionState {
  if (isNativeApp()) return nativeNotificationPermission()
  return notificationsSupported() ? Notification.permission : 'unsupported'
}

/** Ask for permission. Only call from a user gesture after explaining why. */
export async function requestNotificationPermission(): Promise<PermissionState> {
  if (isNativeApp()) return requestNativeNotificationPermission()
  if (!notificationsSupported()) return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

export function registerServiceWorker(): void {
  // The Android app schedules notifications natively and needs no service worker.
  if (isNativeApp()) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const register = () => navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('Service worker registration failed', e))
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}

export interface ReminderNotification {
  title: string
  body?: string
  tag: string
  data: { url: string; id: string; date: string }
}

/**
 * Show a system notification. Returns true if one was shown, false if the
 * caller should fall back to an in-app message.
 */
export async function showReminderNotification(n: ReminderNotification): Promise<boolean> {
  if (permissionState() !== 'granted') return false
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (reg) {
      await reg.showNotification(n.title, {
        body: n.body,
        tag: n.tag,
        data: n.data,
        icon: '/icon.svg',
        badge: '/icon.svg',
        // `actions` is supported by Chromium-based browsers; others ignore it.
        actions: [
          { action: 'snooze', title: 'Snooze 10 min' },
          { action: 'done', title: 'Done' },
        ],
      } as NotificationOptions)
      return true
    }
    const plain = new Notification(n.title, { body: n.body, tag: n.tag, icon: '/icon.svg' })
    plain.onclick = () => {
      window.focus()
      window.dispatchEvent(new CustomEvent('dj-navigate', { detail: n.data.url }))
      plain.close()
    }
    return true
  } catch (e) {
    console.warn('Could not show notification', e)
    return false
  }
}

/** Is `now` inside quiet hours? Handles ranges that cross midnight (22:00–07:00). */
export function inQuietHours(q: { enabled: boolean; start: string; end: string }, now: Date = new Date()): boolean {
  if (!q.enabled || !q.start || !q.end || q.start === q.end) return false
  const cur = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  return q.start < q.end ? cur >= q.start && cur < q.end : cur >= q.start || cur < q.end
}

/**
 * If `at` falls inside quiet hours, move it to the moment quiet hours end
 * (matching the web scheduler, which holds alerts until then).
 */
export function deferPastQuietHours(at: Date, q: { enabled: boolean; start: string; end: string }): Date {
  if (!inQuietHours(q, at)) return at
  const [h, m] = q.end.split(':').map(Number)
  const end = new Date(at)
  end.setHours(h || 0, m || 0, 0, 0)
  if (end <= at) end.setDate(end.getDate() + 1)
  return end
}
