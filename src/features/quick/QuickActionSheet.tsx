import { useNavigate } from 'react-router-dom'
import {
  Bell,
  BookOpen,
  CalendarPlus,
  Camera,
  CheckSquare,
  NotebookPen,
  Sparkles,
  Star,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Sheet } from '@/components/ui'
import { openDialog } from '@/stores/ui'
import { useSettings, type QuickActionId } from '@/stores/settings'
import { relativeDayLabel, today } from '@/lib/dates'
import type { DialogProps } from './DialogHost'

export const QUICK_ACTIONS: Record<QuickActionId, { label: string; icon: LucideIcon }> = {
  task: { label: 'Task', icon: CheckSquare },
  expense: { label: 'Expense', icon: Wallet },
  study: { label: 'Study session', icon: BookOpen },
  note: { label: 'Note', icon: NotebookPen },
  photo: { label: 'Photo', icon: Camera },
  highlight: { label: 'Highlight', icon: Sparkles },
  reminder: { label: 'Reminder', icon: Bell },
  rating: { label: 'Rate day', icon: Star },
  event: { label: 'Event', icon: CalendarPlus },
}

/** Open the editor for a quick action on a given date. */
export function runQuickAction(id: QuickActionId, date: string, navigate: (to: string) => void) {
  switch (id) {
    case 'note':
      navigate(`/notes/new?date=${date}`)
      break
    case 'highlight':
    case 'rating':
      openDialog({ kind: id, date })
      break
    default:
      openDialog({ kind: id, date })
  }
}

export function QuickActionSheet({ request, onClose }: DialogProps<'quick'>) {
  const navigate = useNavigate()
  const settings = useSettings()
  const date = request.date ?? today()
  return (
    <Sheet title="Add to your day" description={relativeDayLabel(date, settings.dateFormat)} onClose={onClose} size="sm">
      <ul className="grid grid-cols-3 gap-2">
        {settings.quickActions.map((id) => {
          const { label, icon: Icon } = QUICK_ACTIONS[id]
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  runQuickAction(id, date, navigate)
                }}
                className="flex h-22 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2 px-2 text-[13px] font-medium transition-colors hover:border-line-strong hover:bg-surface-3"
              >
                <Icon size={21} strokeWidth={1.8} className="text-accent" aria-hidden />
                {label}
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
