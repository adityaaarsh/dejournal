import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { ISODate, Reminder } from '@/db/types'
import { dueOccurrences, setOccurrenceState, snoozeReminder } from '@/db/reminders'
import { mergeSettings, type Settings } from '@/stores/settings'
import { toast } from '@/stores/ui'
import { formatTime } from '@/lib/dates'
import { inQuietHours, showReminderNotification } from './notifications'
import { buildNativeAlarms } from './nativeSchedule'
import { isNativeApp, onNativeEvent, scheduleNativeReminders, takePendingActions } from '@/platform/native'

const CHECK_EVERY_MS = 20_000

/**
 * Atomically claim a due occurrence (marks it as notified). IndexedDB
 * transactions are serialized across tabs, so only one open tab notifies.
 */
async function claim(id: string, date: ISODate): Promise<Reminder | null> {
  return db.transaction('rw', db.reminders, async () => {
    const r = await db.reminders.get(id)
    if (!r) return null
    if (!dueOccurrences([r]).some((o) => o.date === date)) return null
    const wasSnoozed = r.snoozedFor === date && !!r.snoozedUntil
    await db.reminders.update(id, {
      firedFor: [...r.firedFor.filter((d) => d !== date), date].slice(-60),
      ...(wasSnoozed ? { snoozedUntil: null, snoozedFor: null } : {}),
    })
    return r
  })
}

async function runAction(action: string, id: string, date: string) {
  if (!id || !date) return
  if (action === 'snooze') {
    await snoozeReminder(id, date, 10)
    toast('Reminder snoozed for 10 minutes')
  } else if (action === 'done') {
    await setOccurrenceState(id, date, 'done')
    toast('Reminder marked done', { tone: 'success' })
  }
}

/** Background reminder checker, mounted once in the app shell. Renders nothing. */
export function ReminderScheduler() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const reminders = useLiveQuery(() => db.reminders.toArray(), [])
  // null = loaded but never saved (defaults); undefined = still loading.
  const settingsRow = useLiveQuery(async () => (await db.kv.get('settings')) ?? null, [])
  const settings: Settings | null = settingsRow === undefined ? null : mergeSettings(settingsRow?.value as Partial<Settings> | undefined)

  const latest = useRef({ reminders, settings })
  latest.current = { reminders, settings }
  const busy = useRef(false)
  const checkRef = useRef<() => void>(() => {})

  useEffect(() => {
    // In the Android app, alarms are scheduled natively (see effect below).
    if (isNativeApp()) return
    const check = async () => {
      const { reminders: all, settings: s } = latest.current
      if (busy.current || !all || !s) return
      if (!s.notificationsEnabled || inQuietHours(s.quietHours)) return
      const due = dueOccurrences(all)
      if (!due.length) return
      busy.current = true
      try {
        for (const { reminder, date } of due) {
          const r = await claim(reminder.id, date)
          if (!r) continue
          const body = [formatTime(r.time), r.description].filter(Boolean).join(' · ')
          const shown = await showReminderNotification({
            title: r.title,
            body,
            tag: `${r.id}:${date}`,
            data: { url: `/reminders?open=${r.id}`, id: r.id, date },
          })
          if (!shown) {
            toast(`Reminder: ${r.title}`, {
              duration: 20000,
              action: { label: 'Done', onClick: () => setOccurrenceState(r.id, date, 'done') },
            })
          }
        }
      } catch (e) {
        console.error('Reminder check failed', e)
      } finally {
        busy.current = false
      }
    }

    checkRef.current = check
    check()
    const timer = setInterval(check, CHECK_EVERY_MS)
    const onVis = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  // Android app: keep the native alarm schedule in sync with the data.
  useEffect(() => {
    if (!isNativeApp() || !reminders || !settings) return
    scheduleNativeReminders(buildNativeAlarms(reminders, settings))
  }, [reminders, settings?.notificationsEnabled, settings?.quietHours.enabled, settings?.quietHours.start, settings?.quietHours.end]) // eslint-disable-line react-hooks/exhaustive-deps

  // Android app: apply Snooze / Done presses made on notifications.
  useEffect(() => {
    if (!isNativeApp()) return
    const apply = async () => {
      for (const a of takePendingActions()) {
        if (a.action === 'done') await setOccurrenceState(a.id, a.date, 'done')
        else if (a.action === 'snooze' && a.until && a.until > Date.now()) {
          await snoozeReminder(a.id, a.date, Math.max(1, Math.round((a.until - Date.now()) / 60_000)))
        }
      }
    }
    apply().catch(console.error)
    return onNativeEvent((e) => {
      if (e.type === 'resume' || e.type === 'pending-actions') apply().catch(console.error)
    })
  }, [])

  // Re-check promptly when data or settings load / change.
  useEffect(() => {
    if (isNativeApp() || !reminders || !settings) return
    const t = setTimeout(() => checkRef.current(), 300)
    return () => clearTimeout(t)
  }, [reminders, settings?.notificationsEnabled]) // eslint-disable-line react-hooks/exhaustive-deps

  // Navigation requests (plain notification clicks; Android notification taps).
  useEffect(() => {
    const onNav = (e: Event) => navigate((e as CustomEvent<string>).detail)
    window.addEventListener('dj-navigate', onNav)
    return () => window.removeEventListener('dj-navigate', onNav)
  }, [navigate])

  // Messages from the service worker (notification buttons / clicks).
  useEffect(() => {
    if (isNativeApp() || !('serviceWorker' in navigator)) return
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; action?: string; id?: string; date?: string; url?: string }
      if (d?.type === 'reminder-action' && d.action && d.id && d.date) runAction(d.action, d.id, d.date)
      else if (d?.type === 'navigate' && d.url) navigate(d.url)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])

  // Notification action that opened a fresh window: /reminders?raction=…&rid=…&rdate=…
  useEffect(() => {
    const action = params.get('raction')
    if (!action) return
    const id = params.get('rid') ?? ''
    const date = params.get('rdate') ?? ''
    const next = new URLSearchParams(params)
    next.delete('raction')
    next.delete('rid')
    next.delete('rdate')
    setParams(next, { replace: true })
    runAction(action, id, date)
  }, [params, setParams])

  return null
}
