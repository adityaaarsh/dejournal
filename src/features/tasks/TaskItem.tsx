import type { ReactNode } from 'react'
import { Check, Clock, Repeat } from 'lucide-react'
import type { Task } from '@/db/types'
import { toggleTask } from '@/db/tasks'
import { formatTime } from '@/lib/dates'
import { cn } from '@/lib/text'

const PRIORITY_DOT: Record<Task['priority'], string | null> = {
  high: 'bg-danger',
  normal: null,
  low: 'bg-faint',
}

/** Round-cornered checkbox used for tasks. */
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
          'grid place-items-center rounded-[6px] border-[1.5px] transition-colors',
          size === 'md' ? 'h-[19px] w-[19px]' : 'h-4 w-4',
          task.completed ? 'border-accent bg-accent text-on-accent' : 'border-line-strong hover:border-muted',
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
  const dot = PRIORITY_DOT[task.priority]
  const hasMeta = task.dueTime || task.seriesId || task.category || meta || overdue
  return (
    <div className="group flex min-h-11 items-center gap-3 py-1.5">
      <TaskCheckbox task={task} />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 py-1 text-left">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              'truncate text-[15px] leading-snug transition-colors',
              task.completed ? 'text-faint line-through decoration-faint' : 'text-text',
            )}
          >
            {task.title}
          </span>
          {dot && !task.completed && (
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot)} aria-label={`${task.priority} priority`} role="img" />
          )}
        </span>
        {hasMeta && (
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-faint">
            {overdue && <span className="text-warn">Overdue</span>}
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
