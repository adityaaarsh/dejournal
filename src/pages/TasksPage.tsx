import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDown, ArrowUp, CalendarClock, ListChecks, Plus, Search, X } from 'lucide-react'
import { Button, IconButton, Input, Page, PageHeader, Segmented, Select, EmptyState, LoadingState } from '@/components/ui'
import { db } from '@/db/db'
import type { ISODate, Priority, Task } from '@/db/types'
import { moveTask, reorderTasks, sortTasks } from '@/db/tasks'
import { TaskItem } from '@/features/tasks/TaskItem'
import { taskStats } from '@/domain/taskStats'
import { addDays, isISODate, monthEnd, monthKey, relativeDayLabel, today, weekRange } from '@/lib/dates'
import { matchesQuery, plural } from '@/lib/text'
import { useSettings } from '@/stores/settings'
import { openDialog, toast } from '@/stores/ui'

type View = 'upcoming' | 'overdue' | 'completed' | 'all'
type Range = 'any' | 'today' | 'week' | 'month' | 'next7'

const VIEWS: Array<{ value: View; label: string }> = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'completed', label: 'Done' },
  { value: 'all', label: 'All' },
]

function MoveRow({ task, onDone }: { task: Task; onDone: () => void }) {
  const t = today()
  const go = async (d: ISODate) => {
    await moveTask(task.id, d)
    toast(`Moved to ${relativeDayLabel(d)}`)
    onDone()
  }
  return (
    <div className="mb-2 ml-8 flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-2">
      <span className="px-1 text-xs text-muted">Move to</span>
      {task.date !== t && (
        <Button size="sm" onClick={() => go(t)}>
          Today
        </Button>
      )}
      {task.date !== addDays(t, 1) && (
        <Button size="sm" onClick={() => go(addDays(t, 1))}>
          Tomorrow
        </Button>
      )}
      <label className="sr-only" htmlFor={`move-${task.id}`}>
        Pick a date
      </label>
      <input
        id={`move-${task.id}`}
        type="date"
        defaultValue={task.date}
        onChange={(e) => isISODate(e.target.value) && go(e.target.value)}
        className="h-8 rounded-lg border border-line bg-surface px-2 text-[13px]"
      />
      <IconButton icon={X} label="Cancel move" size="sm" onClick={onDone} className="ml-auto" />
    </div>
  )
}

export default function TasksPage() {
  const settings = useSettings()
  const [params, setParams] = useSearchParams()
  const initial = (params.get('filter') as View) || 'upcoming'
  const [view, setViewState] = useState<View>(VIEWS.some((v) => v.value === initial) ? initial : 'upcoming')
  const [query, setQuery] = useState('')
  const [priority, setPriority] = useState<'any' | Priority>('any')
  const [category, setCategory] = useState('any')
  const [range, setRange] = useState<Range>('any')
  const [movingId, setMovingId] = useState<string | null>(null)
  const [limit, setLimit] = useState(80)

  const all = useLiveQuery(() => db.tasks.toArray(), [])
  const t = today()

  const setView = (v: View) => {
    setViewState(v)
    setLimit(80)
    setParams(v === 'upcoming' ? {} : { filter: v }, { replace: true })
  }

  const categories = useMemo(
    () => Array.from(new Set((all ?? []).map((x) => x.category).filter(Boolean) as string[])).sort(),
    [all],
  )

  const [rStart, rEnd] = useMemo((): [ISODate | null, ISODate | null] => {
    switch (range) {
      case 'today':
        return [t, t]
      case 'week':
        return weekRange(t, settings.weekStartsOn)
      case 'month':
        return [`${monthKey(t)}-01`, monthEnd(monthKey(t))]
      case 'next7':
        return [t, addDays(t, 6)]
      default:
        return [null, null]
    }
  }, [range, t, settings.weekStartsOn])

  const filtered = useMemo(() => {
    let list = all ?? []
    if (view === 'upcoming') list = list.filter((x) => !x.completed && x.date >= t)
    if (view === 'overdue') list = list.filter((x) => !x.completed && x.date < t)
    if (view === 'completed') list = list.filter((x) => x.completed)
    if (priority !== 'any') list = list.filter((x) => x.priority === priority)
    if (category !== 'any') list = list.filter((x) => x.category === category)
    if (rStart && rEnd) list = list.filter((x) => x.date >= rStart && x.date <= rEnd)
    if (query.trim()) list = list.filter((x) => matchesQuery(`${x.title} ${x.description ?? ''} ${x.tags.join(' ')}`, query))
    return list
  }, [all, view, priority, category, rStart, rEnd, query, t])

  const desc = view === 'completed' || view === 'all'
  const groups = useMemo(() => {
    const byDate: Record<string, Task[]> = {}
    for (const x of filtered) (byDate[x.date] ??= []).push(x)
    const dates = Object.keys(byDate).sort()
    if (desc) dates.reverse()
    return dates.map((d) => ({ date: d, tasks: sortTasks(byDate[d]) }))
  }, [filtered, desc])

  // Paginate by task count so huge histories stay fast.
  const shownGroups: typeof groups = []
  let count = 0
  for (const g of groups) {
    if (count >= limit) break
    shownGroups.push(g)
    count += g.tasks.length
  }

  const todayStats = taskStats((all ?? []).filter((x) => x.date === t))
  const overdueCount = (all ?? []).filter((x) => !x.completed && x.date < t).length

  const reorder = async (task: Task, dir: -1 | 1) => {
    const dayAll = sortTasks((all ?? []).filter((x) => x.date === task.date))
    const i = dayAll.findIndex((x) => x.id === task.id)
    const j = i + dir
    if (j < 0 || j >= dayAll.length) return
    ;[dayAll[i], dayAll[j]] = [dayAll[j], dayAll[i]]
    await reorderTasks(dayAll.map((x) => x.id))
  }

  const filtersActive = priority !== 'any' || category !== 'any' || range !== 'any' || query.trim() !== ''

  return (
    <Page>
      <PageHeader
        title="Tasks"
        back="/more"
        subtitle={
          todayStats.total === 0
            ? 'No tasks scheduled today'
            : `Today: ${todayStats.done} of ${todayStats.total} done · ${todayStats.percent}%${overdueCount ? ` · ${overdueCount} overdue` : ''}`
        }
        actions={<IconButton icon={Plus} label="New task" variant="primary" size="sm" onClick={() => openDialog({ kind: 'task', date: t })} />}
      >
        <Segmented label="Task view" value={view} onChange={setView} options={VIEWS} className="mt-3 w-full" size="sm" />
      </PageHeader>

      <div className="mb-4 flex flex-col gap-2">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" aria-hidden />
          <Input
            type="search"
            aria-label="Search tasks"
            placeholder="Search tasks"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Select aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as 'any' | Priority)} className="h-10 text-sm">
            <option value="any">Priority</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </Select>
          <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 text-sm">
            <option value="any">Category</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select aria-label="Date range" value={range} onChange={(e) => setRange(e.target.value as Range)} className="h-10 text-sm">
            <option value="any">Any date</option>
            <option value="today">Today</option>
            <option value="next7">Next 7 days</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
          </Select>
        </div>
      </div>

      {all === undefined ? (
        <LoadingState />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={
            filtersActive
              ? 'No tasks match these filters'
              : view === 'overdue'
                ? 'Nothing overdue'
                : view === 'completed'
                  ? 'No completed tasks yet'
                  : view === 'upcoming'
                    ? 'No upcoming tasks'
                    : 'No tasks yet'
          }
          description={filtersActive ? 'Try clearing a filter or the search.' : undefined}
          action={
            filtersActive ? (
              <Button
                size="sm"
                onClick={() => {
                  setPriority('any')
                  setCategory('any')
                  setRange('any')
                  setQuery('')
                }}
              >
                Clear filters
              </Button>
            ) : view !== 'completed' && view !== 'overdue' ? (
              <Button size="sm" variant="primary" icon={Plus} onClick={() => openDialog({ kind: 'task', date: t })}>
                Add a task
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {shownGroups.map((g) => {
            const st = taskStats(g.tasks)
            return (
              <section key={g.date} aria-labelledby={`g-${g.date}`}>
                <div className="mb-1 flex items-baseline justify-between px-1">
                  <h2 id={`g-${g.date}`} className={g.date < t && view !== 'completed' ? 'text-[13px] font-semibold text-warn' : 'text-[13px] font-semibold text-muted'}>
                    {relativeDayLabel(g.date, settings.dateFormat)}
                  </h2>
                  <span className="text-xs text-faint tabular-nums">
                    {view === 'all' ? `${st.done}/${st.total} done` : plural(g.tasks.length, 'task')}
                  </span>
                </div>
                <ul className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-1">
                  {g.tasks.map((task, idx) => (
                    <li key={task.id} className={idx ? 'border-t border-line' : undefined}>
                      <TaskItem
                        task={task}
                        overdue={!task.completed && task.date < t}
                        onOpen={() => openDialog({ kind: 'task', task })}
                        actions={
                          <div className="flex shrink-0 items-center">
                            {g.tasks.length > 1 && !task.completed && (
                              <>
                                <IconButton icon={ArrowUp} label={`Move "${task.title}" up`} size="sm" disabled={idx === 0} onClick={() => reorder(task, -1)} />
                                <IconButton
                                  icon={ArrowDown}
                                  label={`Move "${task.title}" down`}
                                  size="sm"
                                  disabled={idx === g.tasks.length - 1 || g.tasks[idx + 1]?.completed}
                                  onClick={() => reorder(task, 1)}
                                />
                              </>
                            )}
                            {!task.completed && (
                              <IconButton
                                icon={CalendarClock}
                                label={`Move "${task.title}" to another date`}
                                size="sm"
                                active={movingId === task.id}
                                onClick={() => setMovingId(movingId === task.id ? null : task.id)}
                              />
                            )}
                          </div>
                        }
                      />
                      {movingId === task.id && <MoveRow task={task} onDone={() => setMovingId(null)} />}
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
          {count < filtered.length && (
            <Button onClick={() => setLimit((l) => l + 80)} className="self-center">
              Show more
            </Button>
          )}
        </div>
      )}
    </Page>
  )
}
