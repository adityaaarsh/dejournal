/**
 * Builders for the minimal, aggregated payloads sent to the AI provider.
 *
 * Only counts, ratings, short titles and totals are included. Never photos,
 * locations, full note bodies, reflections text or expense notes. The server
 * adds the instructions (ground strictly in data, no diagnosis).
 */
import type { MonthRecap } from '@/domain/recap'
import type { Highlight, Task } from '@/db/types'
import { formatMonth } from '@/lib/dates'

const clip = (s: string, n = 80) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

export function monthSummaryInput(recap: MonthRecap, highlights: Highlight[], formatMoney: (m: number) => string) {
  return {
    month: formatMonth(recap.month),
    inProgress: recap.isCurrent,
    daysElapsed: recap.elapsedDays,
    daysWithRecords: recap.daily.activeDays,
    daysRated: recap.daily.ratedDays,
    averageRating: recap.daily.avgRating === null ? 'not recorded' : Math.round(recap.daily.avgRating * 10) / 10,
    ratings: Object.entries(recap.daily.ratingByDate)
      .filter(([, v]) => v !== null)
      .map(([date, rating]) => ({ date, rating })),
    highlights: highlights.slice(0, 15).map((h) => ({ date: h.date, title: clip(h.title) })),
    tasks: {
      scheduled: recap.tasks.scheduled,
      completed: recap.tasks.completed,
      outstanding: recap.tasks.outstanding,
    },
    study: {
      totalHours: Math.round((recap.study.totalSec / 3600) * 10) / 10,
      sessions: recap.study.sessions,
      daysStudied: recap.study.studyDays,
      dailyGoalMinutes: recap.study.goalMin || 'none',
      daysGoalMet: recap.study.goalDaysMet ?? 'no goal set',
      topSubjects: recap.study.topSubjects.slice(0, 3).map((s) => ({ name: s.name, hours: Math.round((s.sec / 3600) * 10) / 10 })),
    },
    spending: {
      total: formatMoney(recap.expenses.total),
      entries: recap.expenses.count,
      byCategory: recap.expenses.byCategory.slice(0, 6).map((c) => ({ category: c.name, total: formatMoney(c.amount) })),
    },
    counts: {
      photos: recap.journal.photos,
      notes: recap.journal.notes,
      reflections: recap.journal.reflections,
    },
  }
}

export function planTomorrowInput(args: {
  openTasks: Task[]
  recentRatings: Array<{ date: string; rating: number | null }>
  studyTodayMin: number
  studyGoalMin: number
}) {
  return {
    openTasks: args.openTasks.slice(0, 15).map((t) => ({ title: clip(t.title), priority: t.priority, date: t.date })),
    recentRatings: args.recentRatings.map((r) => ({ date: r.date, rating: r.rating ?? 'not recorded' })),
    studyTodayMinutes: args.studyTodayMin,
    studyDailyGoalMinutes: args.studyGoalMin || 'none',
  }
}
