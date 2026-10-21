/**
 * Pure study analytics. All inputs are plain records; no DB access here.
 */
import type { ISODate, StudySession } from '@/db/types'
import { addDays, dateRange, diffDays } from '@/lib/dates'

export interface Period {
  start: ISODate
  end: ISODate
}

/** Total seconds per date for sessions within [start, end]. */
export function secondsByDay(sessions: StudySession[], start: ISODate, end: ISODate): Record<ISODate, number> {
  const out: Record<ISODate, number> = {}
  for (const d of dateRange(start, end)) out[d] = 0
  for (const s of sessions) {
    if (s.date >= start && s.date <= end) out[s.date] = (out[s.date] ?? 0) + s.durationSec
  }
  return out
}

export function totalSeconds(sessions: StudySession[], start?: ISODate, end?: ISODate): number {
  return sessions.reduce((sum, s) => {
    if (start && s.date < start) return sum
    if (end && s.date > end) return sum
    return sum + s.durationSec
  }, 0)
}

/** Seconds per subject id (null subject → key ''), sorted descending. */
export function secondsBySubject(sessions: StudySession[], start?: ISODate, end?: ISODate): Array<{ subjectId: string; seconds: number; count: number }> {
  const map = new Map<string, { seconds: number; count: number }>()
  for (const s of sessions) {
    if (start && s.date < start) continue
    if (end && s.date > end) continue
    const k = s.subjectId ?? ''
    const cur = map.get(k) ?? { seconds: 0, count: 0 }
    cur.seconds += s.durationSec
    cur.count += 1
    map.set(k, cur)
  }
  return Array.from(map, ([subjectId, v]) => ({ subjectId, ...v })).sort((a, b) => b.seconds - a.seconds)
}

/** The previous period of equal length immediately before `p`. */
export function previousPeriod(p: Period): Period {
  const len = diffDays(p.end, p.start) + 1
  return { start: addDays(p.start, -len), end: addDays(p.start, -1) }
}

/**
 * Percentage change from `previous` to `current`.
 * Returns null when there is no baseline (previous is 0) — callers should
 * then describe it in words instead of showing a misleading percentage.
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

/** Human text for a comparison, e.g. "+20% vs last week". */
export function describeChange(current: number, previous: number, periodLabel: string): string {
  if (current === 0 && previous === 0) return "No activity in either period"
  const pct = percentChange(current, previous)
  if (pct === null) return `Nothing recorded ${periodLabel}`
  if (pct === 0) return `Same as ${periodLabel}`
  return `${pct > 0 ? '+' : ''}${pct}% vs ${periodLabel}`
}

/**
 * Consistency: days with at least one session / days elapsed in the period
 * (future days are not counted against you).
 */
export function consistency(sessions: StudySession[], p: Period, todayDate: ISODate): { studied: number; elapsed: number } {
  const end = p.end < todayDate ? p.end : todayDate
  if (end < p.start) return { studied: 0, elapsed: 0 }
  const days = new Set(sessions.filter((s) => s.date >= p.start && s.date <= end && s.durationSec > 0).map((s) => s.date))
  return { studied: days.size, elapsed: diffDays(end, p.start) + 1 }
}

/** Days within the period (up to today) whose saved total met the daily goal. */
export function goalDaysMet(sessions: StudySession[], p: Period, goalMin: number, todayDate: ISODate): number {
  if (goalMin <= 0) return 0
  const end = p.end < todayDate ? p.end : todayDate
  if (end < p.start) return 0
  const byDay = secondsByDay(sessions, p.start, end)
  return Object.values(byDay).filter((s) => s >= goalMin * 60).length
}

/** Interval in epoch ms for a session that has real start/end times. */
function interval(s: Pick<StudySession, 'startedAt' | 'endedAt'>): [number, number] | null {
  if (!s.startedAt || !s.endedAt) return null
  const a = new Date(s.startedAt).getTime()
  const b = new Date(s.endedAt).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null
  return [a, b]
}

/** Existing timed sessions that overlap the candidate's start/end (excluding `ignoreId`). */
export function findOverlaps(
  candidate: Pick<StudySession, 'startedAt' | 'endedAt'>,
  existing: StudySession[],
  ignoreId?: string,
): StudySession[] {
  const c = interval(candidate)
  if (!c) return []
  return existing.filter((s) => {
    if (s.id === ignoreId) return false
    const i = interval(s)
    return !!i && i[0] < c[1] && c[0] < i[1]
  })
}

export const SUBJECT_COLORS = ['#5b9bff', '#4fc28b', '#f2b45a', '#f27a9b', '#9b8cff', '#3cc4b4', '#f07171', '#c3c2b7']
