import type { Reminder } from '@/db/types'
import { fireTime, occurrenceState, reminderOccursOn } from '@/db/reminders'
import { addDays, formatTime, today } from '@/lib/dates'
import type { NativeAlarm } from '@/platform/native'
import type { Settings } from '@/stores/settings'
import { deferPastQuietHours } from './notifications'

/** How many days ahead the Android app gets alarms for (re-synced on every open). */
export const NATIVE_HORIZON_DAYS = 7

/**
 * Pure: the alarms the Android app should hold — every pending, notifying
 * reminder occurrence from today to the horizon, in the future, shifted out
 * of quiet hours. Keys change when a time changes, so stale alarms are dropped.
 */
export function buildNativeAlarms(
  reminders: Reminder[],
  settings: Pick<Settings, 'notificationsEnabled' | 'quietHours'>,
  now: Date = new Date(),
  horizonDays = NATIVE_HORIZON_DAYS,
): NativeAlarm[] {
  if (!settings.notificationsEnabled) return []
  const start = today()
  const out: NativeAlarm[] = []
  for (let i = 0; i <= horizonDays; i++) {
    const date = addDays(start, i)
    for (const r of reminders) {
      if (!r.notify || !reminderOccursOn(r, date) || occurrenceState(r, date) !== 'pending') continue
      const snoozed = !!r.snoozedUntil && r.snoozedFor === date
      if (r.firedFor.includes(date) && !snoozed) continue
      const at = deferPastQuietHours(fireTime(r, date), settings.quietHours)
      if (at.getTime() <= now.getTime()) continue
      out.push({
        key: `${r.id}:${date}:${at.getTime()}`,
        id: r.id,
        date,
        title: r.title,
        body: [formatTime(r.time), r.description].filter(Boolean).join(' · '),
        at: at.getTime(),
      })
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, 200)
}
