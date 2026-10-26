import type { ReactNode } from 'react'
import { Check, Clock, Flag, Repeat } from 'lucide-react'
import type { Task } from '@/db/types'
import { toggleTask } from '@/db/tasks'
import { formatTime } from '@/lib/dates'
import { cn } from '@/lib/text'

/** Round checkbox used for tasks (matches the Today to-do card). */
export function TaskCheckbox({ task, size = 'md' }: { task: Task; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={task.completed}
      aria-label={task.completed ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
      onClick={(e) => {
        e.stopPropagation()
        toggleTask(task.id)
      }}
      className="-m-2.5 grid shrink-0 place-items-center p-2.5"
    >
      <span
        className={cn(
          'grid place-items-center rounded-full border-[1.5px] transition-colors',
          size === 'md' ? 'h-5 w-5' : 'h-4 w-4',
          task.completed ? 'border-accent bg-accent text-on-accent' : 'border-faint hover:border-accent',
        )}
      >
        {task.completed && <Check size={size === 'md' ? 13 : 11} strokeWidth={3} aria-hidden />}
      </span>
    </button>
  )
}

/**
 * Task row: checkbox, title (struck through when done), meta (time, repeat,
 * category, priority). Clicking the row opens the editor.
 */
export function TaskItem({
  task,
  onOpen,
  meta,
  actions,
  overdue,
}: {
  task: Task
  onOpen: () => void
  /** Extra meta text (e.g. date label). */
  meta?: ReactNode
  /** Trailing controls (reorder, move). */
  actions?: ReactNode
  overdue?: boolean
}) {
  const hasMeta = task.dueTime || task.seriesId || task.category || meta || overdue || task.priority !== 'normal'
  return (
    <div className="group flex min-h-[52px] items-center gap-3 py-1.5">
      <TaskCheckbox task={task} />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 py-1 text-left">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              'truncate text-[14px] leading-snug font-semibold transition-colors',
              task.completed ? 'font-normal text-faint line-through decoration-faint' : 'text-text',
            )}
          >
            {task.title}
          </span>
        </span>
        {hasMeta && (
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted">
            {overdue && <span className="font-semibold text-warn">Overdue</span>}
            {task.priority === 'high' && !task.completed && (
              <span className="inline-flex items-center gap-1 font-semibold text-danger">
                <Flag size={11} strokeWidth={2.5} aria-hidden /> High
              </span>
            )}
            {task.priority === 'low' && !task.completed && <span>Low priority</span>}
            {meta}
            {task.dueTime && (
              <span className="inline-flex items-center gap-1">
                <Clock size={11} aria-hidden />
                {formatTime(task.dueTime)}
              </span>
            )}
            {task.seriesId && (
              <span className="inline-flex items-center gap-1">
                <Repeat size={11} aria-hidden />
                <span className="sr-only">Repeats</span>
              </span>
            )}
            {task.category && <span>{task.category}</span>}
          </span>
        )}
      </button>
      {actions}
    </div>
  )
}
