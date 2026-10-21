import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import type { ActiveTimer, FocusSession, StudySession } from './types'
import { isoToLocalDate, today } from '@/lib/dates'
import { nowISO, uid } from '@/lib/id'

/**
 * Persistent timers for Study and Focus.
 *
 * Elapsed time is derived from timestamps (accumulatedMs + now − runningSince),
 * so it stays accurate when the tab is hidden, throttled or refreshed. The
 * timer lives in IndexedDB (kv), and its id becomes the saved session id, so
 * pressing "End" twice can never create two records.
 */

export type TimerKind = ActiveTimer['kind']
const key = (kind: TimerKind) => (kind === 'study' ? 'activeStudyTimer' : 'activeFocusTimer')

export function elapsedMs(t: ActiveTimer, now: number = Date.now()): number {
  const running = t.runningSince ? Math.max(0, now - new Date(t.runningSince).getTime()) : 0
  return t.accumulatedMs + running
}

export async function getTimer(kind: TimerKind): Promise<ActiveTimer | undefined> {
  return (await db.kv.get(key(kind)))?.value as ActiveTimer | undefined
}

export async function startTimer(
  kind: TimerKind,
  opts: Partial<Pick<ActiveTimer, 'subjectId' | 'topic' | 'taskId' | 'label' | 'plannedSec'>> = {},
): Promise<ActiveTimer> {
  return db.transaction('rw', db.kv, async () => {
    const existing = await getTimer(kind)
    if (existing) return existing // never start two timers of the same kind
    const now = nowISO()
    const t: ActiveTimer = {
      id: uid(),
      kind,
      startedAt: now,
      accumulatedMs: 0,
      runningSince: now,
      date: today(),
      ...opts,
    }
    await db.kv.put({ key: key(kind), value: t })
    return t
  })
}

export async function pauseTimer(kind: TimerKind): Promise<void> {
  await db.transaction('rw', db.kv, async () => {
    const t = await getTimer(kind)
    if (!t || !t.runningSince) return
    await db.kv.put({ key: key(kind), value: { ...t, accumulatedMs: elapsedMs(t), runningSince: null } })
  })
}

export async function resumeTimer(kind: TimerKind): Promise<void> {
  await db.transaction('rw', db.kv, async () => {
    const t = await getTimer(kind)
    if (!t || t.runningSince) return
    await db.kv.put({ key: key(kind), value: { ...t, runningSince: nowISO() } })
  })
}

export async function updateTimer(kind: TimerKind, patch: Partial<ActiveTimer>): Promise<void> {
  await db.transaction('rw', db.kv, async () => {
    const t = await getTimer(kind)
    if (t) await db.kv.put({ key: key(kind), value: { ...t, ...patch } })
  })
}

export async function discardTimer(kind: TimerKind): Promise<void> {
  await db.kv.delete(key(kind))
}

/**
 * End the study timer and save a session. Returns null if nothing was running
 * or the session was shorter than `minSec` (discarded).
 */
export async function finishStudyTimer(extra: Partial<StudySession> = {}, minSec = 30): Promise<StudySession | null> {
  return db.transaction('rw', db.kv, db.studySessions, async () => {
    const t = await getTimer('study')
    if (!t) return null
    await db.kv.delete(key('study'))
    const durationSec = Math.round(elapsedMs(t) / 1000)
    if (durationSec < minSec) return null
    if (await db.studySessions.get(t.id)) return null // already saved
    const now = nowISO()
    const s: StudySession = {
      id: t.id,
      subjectId: t.subjectId ?? null,
      topic: t.topic,
      date: isoToLocalDate(t.startedAt),
      startedAt: t.startedAt,
      endedAt: now,
      durationSec,
      tags: [],
      completed: true,
      source: 'timer',
      createdAt: now,
      updatedAt: now,
      ...extra,
    }
    await db.studySessions.add(s)
    return s
  })
}

/** End the focus timer and record a focus session. */
export async function finishFocusTimer(minSec = 30): Promise<FocusSession | null> {
  return db.transaction('rw', db.kv, db.focusSessions, async () => {
    const t = await getTimer('focus')
    if (!t) return null
    await db.kv.delete(key('focus'))
    const durationSec = Math.round(elapsedMs(t) / 1000)
    if (durationSec < minSec) return null
    if (await db.focusSessions.get(t.id)) return null
    const now = nowISO()
    const f: FocusSession = {
      id: t.id,
      date: isoToLocalDate(t.startedAt),
      startedAt: t.startedAt,
      endedAt: now,
      plannedSec: t.plannedSec ?? null,
      durationSec,
      label: t.label,
      taskId: t.taskId ?? null,
      subjectId: t.subjectId ?? null,
      completed: t.plannedSec ? durationSec >= t.plannedSec : true,
      createdAt: now,
      updatedAt: now,
    }
    await db.focusSessions.add(f)
    return f
  })
}

/** Live timer + elapsed ms that ticks every `tickMs` while running. */
export function useTimer(kind: TimerKind, tickMs = 1000): { timer: ActiveTimer | undefined; elapsed: number; loaded: boolean } {
  const row = useLiveQuery(async () => (await db.kv.get(key(kind))) ?? null, [kind])
  const timer = (row?.value as ActiveTimer | undefined) ?? undefined
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!timer?.runningSince) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), tickMs)
    const onVis = () => setNow(Date.now())
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [timer?.runningSince, tickMs])
  return { timer, elapsed: timer ? elapsedMs(timer, now) : 0, loaded: row !== undefined }
}
