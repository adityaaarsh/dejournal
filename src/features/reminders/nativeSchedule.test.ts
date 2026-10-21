import { describe, expect, it } from 'vitest'
import type { Reminder } from '@/db/types'
import { addDays, atTime, today } from '@/lib/dates'
import { buildNativeAlarms } from './nativeSchedule'
import { deferPastQuietHours } from './notifications'

function reminder(p: Partial<Reminder>): Reminder {
  return {
    id: 'r1',
    title: 'Pay bill',
    date: today(),
    time: '23:59',
    notify: true,
    status: 'pending',
    doneDates: [],
    dismissedDates: [],
    firedFor: [],
    createdAt: '',
    updatedAt: '',
    ...p,
  }
}

const on = { notificationsEnabled: true, quietHours: { enabled: false, start: '22:00', end: '07:00' } }

describe('deferPastQuietHours', () => {
  const q = { enabled: true, start: '22:00', end: '07:00' }
  it('moves late-night alarms to the end of quiet hours', () => {
    const at = new Date(2026, 9, 22, 23, 30)
    const d = deferPastQuietHours(at, q)
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([23, 7, 0])
  })
  it('moves early-morning alarms to the same morning', () => {
    const d = deferPastQuietHours(new Date(2026, 9, 22, 5, 0), q)
    expect([d.getDate(), d.getHours()]).toEqual([22, 7])
  })
  it('leaves other times alone', () => {
    const at = new Date(2026, 9, 22, 12, 0)
    expect(deferPastQuietHours(at, q)).toBe(at)
  })
})

describe('buildNativeAlarms', () => {
  const morning = atTime(today(), '00:00')

  it('schedules future occurrences of daily reminders across the horizon', () => {
    const alarms = buildNativeAlarms([reminder({ recurrence: { type: 'daily' }, time: '09:00' })], on, morning, 3)
    expect(alarms.map((a) => a.date)).toEqual([today(), addDays(today(), 1), addDays(today(), 2), addDays(today(), 3)])
    expect(new Set(alarms.map((a) => a.key)).size).toBe(alarms.length)
  })

  it('skips past, done, muted and already-fired occurrences', () => {
    const now = atTime(today(), '10:00')
    const list = [
      reminder({ id: 'past', time: '09:00' }),
      reminder({ id: 'done', status: 'done' }),
      reminder({ id: 'muted', notify: false }),
      reminder({ id: 'fired', firedFor: [today()] }),
      reminder({ id: 'ok' }),
    ]
    expect(buildNativeAlarms(list, on, now, 0).map((a) => a.id)).toEqual(['ok'])
  })

  it('uses the snooze time and nothing when notifications are off', () => {
    const until = new Date(atTime(today(), '10:30').getTime()).toISOString()
    const r = reminder({ time: '10:00', firedFor: [today()], snoozedUntil: until, snoozedFor: today() })
    const alarms = buildNativeAlarms([r], on, atTime(today(), '10:05'), 0)
    expect(alarms).toHaveLength(1)
    expect(alarms[0].at).toBe(Date.parse(until))
    expect(buildNativeAlarms([r], { ...on, notificationsEnabled: false }, atTime(today(), '10:05'), 0)).toEqual([])
  })
})
