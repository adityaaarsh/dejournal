import { lazy, Suspense, type ComponentType } from 'react'
import { useDialogs, type DialogRequest } from '@/stores/ui'
import { ConfirmDialog } from './ConfirmDialog'
import { QuickActionSheet } from './QuickActionSheet'

/**
 * Renders the open dialog stack. Each editor receives
 * `{ request, onClose }` where `request` is its DialogRequest variant.
 */
export interface DialogProps<K extends DialogRequest['kind']> {
  request: Extract<DialogRequest, { kind: K }>
  onClose: () => void
}

const TaskDialog = lazy(() => import('@/features/tasks/TaskDialog'))
const RatingDialog = lazy(() => import('@/features/journal/RatingDialog'))
const HighlightDialog = lazy(() => import('@/features/journal/HighlightDialog'))
const ReminderDialog = lazy(() => import('@/features/reminders/ReminderDialog'))
const EventDialog = lazy(() => import('@/features/calendar/EventDialog'))
const ExpenseDialog = lazy(() => import('@/features/expenses/ExpenseDialog'))
const StudySessionDialog = lazy(() => import('@/features/study/StudySessionDialog'))
const PhotoDialog = lazy(() => import('@/features/photos/PhotoDialog'))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REGISTRY: Record<DialogRequest['kind'], ComponentType<any>> = {
  task: TaskDialog,
  rating: RatingDialog,
  highlight: HighlightDialog,
  reminder: ReminderDialog,
  event: EventDialog,
  expense: ExpenseDialog,
  study: StudySessionDialog,
  photo: PhotoDialog,
  quick: QuickActionSheet,
  confirm: ConfirmDialog,
}

export function DialogHost() {
  const stack = useDialogs((s) => s.stack)
  const close = useDialogs((s) => s.close)
  return (
    <>
      {stack.map((req) => {
        const C = REGISTRY[req.kind]
        return (
          <Suspense key={req.id} fallback={null}>
            <C request={req} onClose={() => close(req.id)} />
          </Suspense>
        )
      })}
    </>
  )
}
