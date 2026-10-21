/**
 * Monthly recap (pure). Computes summary metrics for one month from actual
 * records only.
 *
 * Definitions
 * - Elapsed days: days of the month up to and including today (all days for a
 *   past month, 0 for a future month). Averages "per day" use elapsed days.
 * - Active day: a day with at least one thing the user recorded — rating,
 *   reflection, highlight, completed task, study session, expense, photo,
 *   note, place, focus session, routine check or screen-time log. Scheduled
 *   but untouched tasks and imported calendar events do not count.
 * - Missing data is `null`, never 0: e.g. average rating is null when no day
 *   was rated, completion rate is null when no task was scheduled.
 */
import type {
  DayEntry,
  Expense,
  ExpenseCategory,
  FocusSession,
  Highlight,
  ISODate,
  Note,
  Photo,
  Routine,
  RoutineLog,
  SavedPlace,
  ScreenTimeRecord,
  StudySession,
  StudySubject,
  Task,
} from '@/db/types'
import { addDays, addMonthsKey, dateRange, daysInMonth, isoToLocalDate, monthEnd, monthStart, today as todayFn, weekday } from '@/lib/dates'

export interface RecapData {
  tasks?: Task[]
  days?: DayEntry[]
  highlights?: Highlight[]
  studySessions?: StudySession[]
  subjects?: StudySubject[]
  expenses?: Expense[]
  categories?: ExpenseCategory[]
  photos?: Array<Pick<Photo, 'id' | 'date' | 'isSelfie'>>
  notes?: Array<Pick<Note, 'id' | 'date' | 'createdAt'>>
  places?: Array<Pick<SavedPlace, 'id' | 'date'>>
  focusSessions?: Array<Pick<FocusSession, 'id' | 'date' | 'durationSec'>>
  routines?: Routine[]
  routineLogs?: RoutineLog[]
  screenTime?: Array<Pick<ScreenTimeRecord, 'date' | 'minutes'>>
}

export interface RecapSettings {
  studyGoalDailyMin: number
  currency: string
}

export interface MonthRecap {
  month: string
  start: ISODate
  /** Last day included (today for the current month). */
  end: ISODate
  totalDays: number
  elapsedDays: number
  isCurrent: boolean
  isFuture: boolean
  /** True when there is no recorded activity at all. */
  empty: boolean
  daily: {
    activeDays: number
    ratedDays: number
    avgRating: number | null
    bestDay: { date: ISODate; rating: number } | null
    highlights: number
    reflections: number
    ratingByDate: Record<ISODate, number | null>
  }
  tasks: {
    scheduled: number
    completed: number
    completionRate: number | null
    outstanding: number
    mostActiveDays: Array<{ date: ISODate; completed: number }>
    completedByDate: Record<ISODate, number>
  }
  study: {
    totalSec: number
    sessions: number
    studyDays: number
    /** Average over days with at least one session. */
    avgPerStudyDaySec: number | null
    /** Average over all elapsed days of the month. */
    avgPerElapsedDaySec: number | null
    topSubjects: Array<{ id: string; name: string; sec: number }>
    goalMin: number
    /** Days that met the daily goal (null when no goal is set). */
    goalDaysMet: number | null
    secByDate: Record<ISODate, number>
  }
  expenses: {
    currency: string
    total: number
    count: number
    /** Records in other currencies (excluded from totals). */
    otherCurrencyCount: number
    avgPerElapsedDay: number | null
    highestDay: { date: ISODate; amount: number } | null
    byCategory: Array<{ id: string; name: string; amount: number }>
    totalByDate: Record<ISODate, number>
  }
  journal: {
    photos: number
    selfies: number
    notes: number
    highlights: number
    reflections: number
    places: number
    focusSec: number
  }
  consistency: {
    activeDays: number
    elapsedDays: number
    activeRate: number | null
    longestRun: number
    routines: Array<{ id: string; name: string; done: number; applicable: number }>
    screenTime: { loggedDays: number; avgMin: number | null }
  }
  /** Count of recorded items per date (heatmap). Dates with nothing are absent. */
  activityByDate: Record<ISODate, number>
}

export interface RecapOptions {
  today?: ISODate
  /** Only include the first N days of the month (for like-for-like comparisons). */
  limitDays?: number
}

const inRange = (d: ISODate | null | undefined, a: ISODate, b: ISODate) => !!d && d >= a && d <= b

export function computeMonthRecap(month: string, data: RecapData, settings: RecapSettings, opts: RecapOptions = {}): MonthRecap {
  const todayDate = opts.today ?? todayFn()
  const start = monthStart(month)
  const lastOfMonth = monthEnd(month)
  const totalDays = daysInMonth(month)
  const isFuture = start > todayDate
  const isCurrent = !isFuture && todayDate <= lastOfMonth
  let end = isCurrent ? todayDate : lastOfMonth
  if (opts.limitDays !== undefined) {
    const limited = addDays(start, Math.max(0, opts.limitDays) - 1)
    if (limited < end) end = limited
  }
  const elapsedDays = isFuture ? 0 : dateRange(start, end).length

  const activity: Record<ISODate, number> = {}
  const bump = (d: ISODate, n = 1) => {
    if (inRange(d, start, end)) activity[d] = (activity[d] ?? 0) + n
  }

  // Daily life
  const ratingByDate: Record<ISODate, number | null> = {}
  for (const d of isFuture ? [] : dateRange(start, end)) ratingByDate[d] = null
  let ratedDays = 0
  let ratingSum = 0
  let bestDay: MonthRecap['daily']['bestDay'] = null
  let reflections = 0
  for (const d of data.days ?? []) {
    if (!inRange(d.date, start, end)) continue
    if (d.rating) {
      ratingByDate[d.date] = d.rating
      ratedDays++
      ratingSum += d.rating
      if (!bestDay || d.rating > bestDay.rating) bestDay = { date: d.date, rating: d.rating }
      bump(d.date)
    }
    if (d.reflection && Object.values(d.reflection).some((v) => typeof v === 'string' && v.trim())) {
      reflections++
      bump(d.date)
    }
  }
  const highlights = (data.highlights ?? []).filter((h) => inRange(h.date, start, end))
  highlights.forEach((h) => bump(h.date))

  // Tasks
  const monthTasks = (data.tasks ?? []).filter((t) => inRange(t.date, start, end))
  const completedByDate: Record<ISODate, number> = {}
  let completed = 0
  for (const t of monthTasks) {
    if (t.completed) {
      completed++
      completedByDate[t.date] = (completedByDate[t.date] ?? 0) + 1
      bump(t.date)
    }
  }
  const mostActiveDays = Object.entries(completedByDate)
    .map(([date, n]) => ({ date, completed: n }))
    .sort((a, b) => b.completed - a.completed || a.date.localeCompare(b.date))
    .slice(0, 3)

  // Study
  const subjName = new Map((data.subjects ?? []).map((s) => [s.id, s.name]))
  const secByDate: Record<ISODate, number> = {}
  const secBySubject = new Map<string, number>()
  let totalSec = 0
  let sessions = 0
  for (const s of data.studySessions ?? []) {
    if (!inRange(s.date, start, end) || s.durationSec <= 0) continue
    sessions++
    totalSec += s.durationSec
    secByDate[s.date] = (secByDate[s.date] ?? 0) + s.durationSec
    const key = s.subjectId ?? ''
    secBySubject.set(key, (secBySubject.get(key) ?? 0) + s.durationSec)
    bump(s.date)
  }
  const studyDays = Object.keys(secByDate).length
  const goalMin = settings.studyGoalDailyMin
  const goalDaysMet = goalMin > 0 ? Object.values(secByDate).filter((sec) => sec >= goalMin * 60).length : null
  const topSubjects = Array.from(secBySubject.entries())
    .map(([id, sec]) => ({ id, name: id ? subjName.get(id) ?? 'Deleted subject' : 'No subject', sec }))
    .sort((a, b) => b.sec - a.sec)
    .slice(0, 5)

  // Expenses
  const catName = new Map((data.categories ?? []).map((c) => [c.id, c.name]))
  const totalByDate: Record<ISODate, number> = {}
  const byCat = new Map<string, number>()
  let total = 0
  let count = 0
  let otherCurrencyCount = 0
  for (const x of data.expenses ?? []) {
    if (!inRange(x.date, start, end)) continue
    bump(x.date)
    if (x.currency !== settings.currency) {
      otherCurrencyCount++
      continue
    }
    count++
    total += x.amount
    totalByDate[x.date] = (totalByDate[x.date] ?? 0) + x.amount
    byCat.set(x.categoryId, (byCat.get(x.categoryId) ?? 0) + x.amount)
  }
  let highestDay: MonthRecap['expenses']['highestDay'] = null
  for (const [date, amount] of Object.entries(totalByDate)) {
    if (!highestDay || amount > highestDay.amount) highestDay = { date, amount }
  }
  const byCategory = Array.from(byCat.entries())
    .map(([id, amount]) => ({ id, name: catName.get(id) ?? 'Other', amount }))
    .sort((a, b) => b.amount - a.amount)

  // Journal & other records
  const photos = (data.photos ?? []).filter((p) => inRange(p.date, start, end))
  photos.forEach((p) => bump(p.date))
  const notes = (data.notes ?? []).filter((n) => inRange(n.date ?? isoToLocalDate(n.createdAt), start, end))
  notes.forEach((n) => bump(n.date ?? isoToLocalDate(n.createdAt)))
  const places = (data.places ?? []).filter((p) => inRange(p.date, start, end))
  places.forEach((p) => bump(p.date))
  let focusSec = 0
  for (const f of data.focusSessions ?? []) {
    if (!inRange(f.date, start, end)) continue
    focusSec += f.durationSec
    bump(f.date)
  }
  const logs = (data.routineLogs ?? []).filter((l) => inRange(l.date, start, end))
  logs.forEach((l) => bump(l.date))
  const screen = (data.screenTime ?? []).filter((s) => inRange(s.date, start, end))
  screen.forEach((s) => bump(s.date))

  // Consistency
  const activeDays = Object.keys(activity).length
  let longestRun = 0
  let run = 0
  for (const d of isFuture ? [] : dateRange(start, end)) {
    if (activity[d]) {
      run++
      longestRun = Math.max(longestRun, run)
    } else run = 0
  }
  const elapsedDates = isFuture ? [] : dateRange(start, end)
  const routines = (data.routines ?? [])
    .filter((r) => r.active || logs.some((l) => l.routineId === r.id))
    .map((r) => {
      const created = isoToLocalDate(r.createdAt)
      const applicable = elapsedDates.filter((d) => d >= created && (!r.days.length || r.days.includes(weekday(d)))).length
      const done = logs.filter((l) => l.routineId === r.id).length
      return { id: r.id, name: r.name, done, applicable }
    })
    .filter((r) => r.applicable > 0 || r.done > 0)

  return {
    month,
    start,
    end,
    totalDays,
    elapsedDays,
    isCurrent,
    isFuture,
    empty: activeDays === 0,
    daily: {
      activeDays,
      ratedDays,
      avgRating: ratedDays ? ratingSum / ratedDays : null,
      bestDay,
      highlights: highlights.length,
      reflections,
      ratingByDate,
    },
    tasks: {
      scheduled: monthTasks.length,
      completed,
      completionRate: monthTasks.length ? completed / monthTasks.length : null,
      outstanding: monthTasks.length - completed,
      mostActiveDays,
      completedByDate,
    },
    study: {
      totalSec,
      sessions,
      studyDays,
      avgPerStudyDaySec: studyDays ? totalSec / studyDays : null,
      avgPerElapsedDaySec: elapsedDays ? totalSec / elapsedDays : null,
      topSubjects,
      goalMin,
      goalDaysMet,
      secByDate,
    },
    expenses: {
      currency: settings.currency,
      total,
      count,
      otherCurrencyCount,
      avgPerElapsedDay: elapsedDays && count ? total / elapsedDays : elapsedDays ? 0 : null,
      highestDay,
      byCategory,
      totalByDate,
    },
    journal: {
      photos: photos.length,
      selfies: photos.filter((p) => p.isSelfie).length,
      notes: notes.length,
      highlights: highlights.length,
      reflections,
      places: places.length,
      focusSec,
    },
    consistency: {
      activeDays,
      elapsedDays,
      activeRate: elapsedDays ? activeDays / elapsedDays : null,
      longestRun,
      routines,
      screenTime: {
        loggedDays: screen.length,
        avgMin: screen.length ? screen.reduce((s, r) => s + r.minutes, 0) / screen.length : null,
      },
    },
    activityByDate: activity,
  }
}

export interface MetricDelta {
  current: number | null
  previous: number | null
  /** current − previous, null when either side is missing. */
  delta: number | null
}

export interface MonthComparison {
  previousMonth: string
  /** True when the current month is incomplete and we compare the same number of days. */
  partial: boolean
  comparedDays: number
  /** Previous month had no recorded activity in the compared window. */
  previousEmpty: boolean
  activeDays: MetricDelta
  avgRating: MetricDelta
  tasksCompleted: MetricDelta
  completionRate: MetricDelta
  studySec: MetricDelta
  spending: MetricDelta
}

function delta(current: number | null, previous: number | null): MetricDelta {
  return { current, previous, delta: current === null || previous === null ? null : current - previous }
}

/**
 * Compare a month with the one before. For the current month, only the same
 * number of elapsed days of the previous month are used, so a half-finished
 * month is not compared with a full one.
 */
export function compareWithPrevious(recap: MonthRecap, data: RecapData, settings: RecapSettings, opts: { today?: ISODate } = {}): MonthComparison {
  const previousMonth = addMonthsKey(recap.month, -1)
  const partial = recap.isCurrent && recap.elapsedDays < recap.totalDays
  const prev = computeMonthRecap(previousMonth, data, settings, {
    today: opts.today,
    limitDays: partial ? recap.elapsedDays : undefined,
  })
  // When the previous month had nothing recorded, comparisons are meaningless.
  const p = prev.empty
  return {
    previousMonth,
    partial,
    comparedDays: partial ? recap.elapsedDays : prev.elapsedDays,
    previousEmpty: p,
    activeDays: delta(recap.daily.activeDays, p ? null : prev.daily.activeDays),
    avgRating: delta(recap.daily.avgRating, p ? null : prev.daily.avgRating),
    tasksCompleted: delta(recap.tasks.completed, p ? null : prev.tasks.completed),
    completionRate: delta(recap.tasks.completionRate, p ? null : prev.tasks.completionRate),
    studySec: delta(recap.study.totalSec, p ? null : prev.study.totalSec),
    spending: delta(recap.expenses.total, p ? null : prev.expenses.total),
  }
}
