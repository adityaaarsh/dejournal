import type { ISODate, RecommendationFeedback } from '@/db/types'
import { diffDays } from '@/lib/dates'

/**
 * Deterministic, explainable recommendation engine.
 *
 * Each rule looks only at data the user actually recorded (ratings, tasks,
 * study sessions vs. their own goal, routines they chose to track). Rules that
 * match produce a candidate with a base priority; recent feedback adjusts it.
 * At most one recommendation is returned. With no history, a neutral planning
 * prompt is returned only when the user has planned nothing yet for today.
 */

export type RecActionKind = 'study' | 'task' | 'rate' | 'tasks'

export interface Recommendation {
  ruleId: string
  message: string
  /** Short explanation of which data produced it (shown on request). */
  reason: string
  action?: { label: string; kind: RecActionKind }
}

export interface RecContext {
  date: ISODate
  yesterday: {
    rating: number | null
    tasksTotal: number
    tasksDone: number
    studySec: number
  }
  /** User's daily study goal in seconds (0 = no goal). */
  studyGoalSec: number
  /** Names of tracked routines that applied yesterday but were not logged. */
  routinesMissedYesterday: string[]
  /** Incomplete tasks scheduled for today. */
  incompleteToday: number
  overdueCount: number
  feedback: RecommendationFeedback[]
  /** True if any rating, task, study session, or routine log exists before today. */
  hasAnyHistory: boolean
}

interface Candidate extends Recommendation {
  priority: number
}

function mins(sec: number): string {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h ${r}m` : `${h}h`
}

function candidates(ctx: RecContext): Candidate[] {
  const out: Candidate[] = []
  const y = ctx.yesterday
  const ratingPrefix = y.rating ? `Yesterday was a ${y.rating}/5. ` : ''

  // Scenario C — low rating: gentle, optional, no diagnosis.
  if (y.rating !== null && y.rating <= 2) {
    out.push({
      ruleId: 'low-rating',
      priority: 90,
      message: `${ratingPrefix}Consider planning a lighter day and leaving room for a break.`,
      reason: `You rated yesterday ${y.rating}/5.`,
      action: ctx.incompleteToday > 1 ? { label: 'Review tasks', kind: 'tasks' } : undefined,
    })
  }

  // Scenario A — low task completion yesterday.
  const open = y.tasksTotal - y.tasksDone
  if (y.tasksTotal >= 3 && open >= 2 && y.tasksDone / y.tasksTotal < 0.5) {
    out.push({
      ruleId: 'low-completion',
      priority: 80,
      message: `${ratingPrefix}${open} of ${y.tasksTotal} tasks stayed open yesterday. Pick one priority task to finish first today, before adding more.`,
      reason: `You completed ${y.tasksDone} of ${y.tasksTotal} tasks yesterday.`,
      action: { label: 'Choose a task', kind: 'tasks' },
    })
  } else if (ctx.overdueCount >= 3) {
    out.push({
      ruleId: 'overdue',
      priority: 60,
      message: `You have ${ctx.overdueCount} overdue tasks. Move the one that matters most to today and let the rest wait.`,
      reason: `${ctx.overdueCount} incomplete tasks are dated before today.`,
      action: { label: 'Review overdue', kind: 'tasks' },
    })
  }

  // Scenario B — missed study goal (only if the user set one and studied/planned before).
  if (ctx.studyGoalSec > 0 && ctx.hasAnyHistory && y.studySec < ctx.studyGoalSec) {
    const short = ctx.studyGoalSec - y.studySec
    const session = Math.min(25 * 60, short)
    out.push({
      ruleId: 'missed-study-goal',
      priority: y.studySec > 0 ? 65 : 55,
      message:
        y.studySec > 0
          ? `${ratingPrefix}You studied ${mins(y.studySec)} of your ${mins(ctx.studyGoalSec)} goal yesterday. A focused ${mins(session)} session today would be a good start.`
          : `${ratingPrefix}No study time was logged yesterday. A manageable ${mins(session)} session today keeps things moving.`,
      reason: `Daily study goal is ${mins(ctx.studyGoalSec)}; yesterday's total was ${mins(y.studySec)}.`,
      action: { label: 'Start studying', kind: 'study' },
    })
  }

  // Scenario D — missed tracked routine: neutral reminder.
  if (ctx.routinesMissedYesterday.length) {
    const names = ctx.routinesMissedYesterday
    const label = names.length === 1 ? `"${names[0]}"` : `"${names[0]}" and ${names.length - 1} other routine${names.length > 2 ? 's' : ''}`
    out.push({
      ruleId: 'missed-routine',
      priority: 50,
      message: `${ratingPrefix}${label} wasn't checked off yesterday. Today is a fresh chance if you'd like.`,
      reason: `Routines you track that weren't logged yesterday: ${names.join(', ')}.`,
    })
  }

  // Average day with a rating but nothing else stood out: invite a reflection-based plan.
  if (y.rating === 3 && out.length === 0) {
    out.push({
      ruleId: 'average-day',
      priority: 30,
      message: `Yesterday was a 3/5. What's one small thing that would make today a little better? Add it as a task.`,
      reason: 'You rated yesterday 3/5.',
      action: { label: 'Add a task', kind: 'task' },
    })
  }

  // Scenario E — no data: neutral planning prompt only if today is still empty.
  if (out.length === 0 && ctx.incompleteToday === 0 && !ctx.hasAnyHistory) {
    out.push({
      ruleId: 'plan-day',
      priority: 10,
      message: 'Start by adding one or two things you want to get done today.',
      reason: 'There is no earlier activity yet, so this is a general planning prompt.',
      action: { label: 'Add a task', kind: 'task' },
    })
  }

  return out
}

/** Adjust priority with feedback: unhelpful/dismissed recently → lower; helpful → slightly higher. */
function adjusted(c: Candidate, ctx: RecContext): number | null {
  let p = c.priority
  for (const f of ctx.feedback) {
    if (f.ruleId !== c.ruleId) continue
    const age = diffDays(ctx.date, f.date)
    if (age < 0) continue
    // Dismissed, acted on or rated today → don't show again today.
    if (age === 0 && (f.action === 'dismissed' || f.action === 'acted' || f.action === 'unhelpful')) return null
    if (age > 30) continue
    const weight = age <= 7 ? 1 : 0.5
    if (f.action === 'unhelpful') p -= 30 * weight
    else if (f.action === 'dismissed') p -= 10 * weight
    else if (f.action === 'helpful') p += 8 * weight
  }
  return p
}

export function recommend(ctx: RecContext): Recommendation | null {
  let best: { rec: Candidate; score: number } | null = null
  for (const c of candidates(ctx)) {
    const score = adjusted(c, ctx)
    if (score === null || score <= 0) continue
    if (!best || score > best.score) best = { rec: c, score }
  }
  if (!best) return null
  const { priority: _p, ...rec } = best.rec
  return rec
}
