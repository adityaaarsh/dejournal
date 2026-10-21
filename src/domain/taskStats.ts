import type { ISODate, Task } from '@/db/types'

export interface TaskStats {
  total: number
  done: number
  open: number
  /** 0–100, or null when there are no tasks (never a fabricated 0% / NaN). */
  percent: number | null
}

export function taskStats(tasks: Task[]): TaskStats {
  const total = tasks.length
  const done = tasks.filter((t) => t.completed).length
  return {
    total,
    done,
    open: total - done,
    percent: total > 0 ? Math.round((done / total) * 100) : null,
  }
}

/** Incomplete tasks dated before `ref`. */
export function overdueTasks(tasks: Task[], ref: ISODate): Task[] {
  return tasks.filter((t) => !t.completed && t.date < ref)
}

/** Count of tasks whose completion happened on the given local date. */
export function completedOn(tasks: Task[], date: ISODate, toLocalDate: (iso: string) => ISODate): number {
  return tasks.filter((t) => t.completed && t.completedAt && toLocalDate(t.completedAt) === date).length
}

/** Per-date completion stats, keyed by date. */
export function statsByDate(tasks: Task[]): Record<ISODate, TaskStats> {
  const groups: Record<ISODate, Task[]> = {}
  for (const t of tasks) (groups[t.date] ??= []).push(t)
  const out: Record<ISODate, TaskStats> = {}
  for (const [d, list] of Object.entries(groups)) out[d] = taskStats(list)
  return out
}

export function formatPercent(p: number | null): string {
  return p === null ? '—' : `${p}%`
}
