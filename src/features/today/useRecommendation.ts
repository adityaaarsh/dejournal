import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { ISODate } from '@/db/types'
import { routineAppliesOn } from '@/db/routines'
import { recommend, type Recommendation } from '@/domain/recommendations'
import { addDays, isoToLocalDate } from '@/lib/dates'
import { nowISO, uid } from '@/lib/id'
import type { RecFeedbackAction } from '@/db/types'

/** Gather the real data the recommendation engine needs for `date` and run it. */
export function useRecommendation(date: ISODate, studyGoalMin: number, enabled: boolean): Recommendation | null | undefined {
  return useLiveQuery(async () => {
    if (!enabled) return null
    const y = addDays(date, -1)
    const [yDay, yTasks, yStudy, routines, yLogs, todayTasks, overdueCount, feedback] = await Promise.all([
      db.days.get(y),
      db.tasks.where('date').equals(y).toArray(),
      db.studySessions.where('date').equals(y).toArray(),
      db.routines.toArray(),
      db.routineLogs.where('date').equals(y).toArray(),
      db.tasks.where('date').equals(date).toArray(),
      db.tasks.where('date').below(date).filter((t) => !t.completed).count(),
      db.recFeedback.where('date').aboveOrEqual(addDays(date, -31)).toArray(),
    ])
    const [priorRating, priorTask, priorStudy, priorLog] = await Promise.all([
      db.days.where('date').below(date).filter((d) => !!d.rating).count(),
      db.tasks.where('date').below(date).count(),
      db.studySessions.where('date').below(date).count(),
      db.routineLogs.where('date').below(date).count(),
    ])
    const logged = new Set(yLogs.map((l) => l.routineId))
    const missed = routines
      .filter((r) => routineAppliesOn(r, y) && isoToLocalDate(r.createdAt) <= y && !logged.has(r.id))
      .sort((a, b) => a.order - b.order)
      .map((r) => r.name)
    return recommend({
      date,
      yesterday: {
        rating: yDay?.rating ?? null,
        tasksTotal: yTasks.length,
        tasksDone: yTasks.filter((t) => t.completed).length,
        studySec: yStudy.reduce((s, x) => s + x.durationSec, 0),
      },
      studyGoalSec: studyGoalMin * 60,
      routinesMissedYesterday: missed,
      incompleteToday: todayTasks.filter((t) => !t.completed).length,
      overdueCount,
      feedback,
      hasAnyHistory: priorRating + priorTask + priorStudy + priorLog > 0,
    })
  }, [date, studyGoalMin, enabled])
}

export async function recordRecFeedback(ruleId: string, date: ISODate, action: RecFeedbackAction): Promise<void> {
  await db.recFeedback.add({ id: uid(), ruleId, date, action, createdAt: nowISO() })
}
