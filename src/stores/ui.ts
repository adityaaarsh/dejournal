import { create } from 'zustand'
import type {
  CalendarEvent,
  Expense,
  Highlight,
  ISODate,
  Reminder,
  StudySession,
  Task,
} from '@/db/types'
import { uid } from '@/lib/id'

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

export interface Toast {
  id: string
  message: string
  tone?: 'default' | 'success' | 'error'
  action?: { label: string; onClick: () => void | Promise<void> }
  duration?: number
}

interface ToastState {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id'>) => string
  dismiss: (id: string) => void
}

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = uid()
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }))
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

/** Show a toast from anywhere (no hook needed). */
export function toast(message: string, opts: Omit<Toast, 'id' | 'message'> = {}) {
  return useToasts.getState().push({ message, ...opts })
}

/** Toast with an Undo button. */
export function undoToast(message: string, undo: () => void | Promise<void>) {
  return toast(message, { action: { label: 'Undo', onClick: undo }, duration: 6000 })
}

/* ------------------------------------------------------------------ */
/* Dialogs (quick actions + record editors)                           */
/* ------------------------------------------------------------------ */

/**
 * Every editor sheet in the app is opened through this store so any screen
 * (Today, Calendar, Search, quick-action menu…) can open any editor.
 * The matching components are registered in features/quick/DialogHost.tsx.
 */
export type DialogRequest =
  | { kind: 'task'; date?: ISODate; task?: Task }
  | { kind: 'reminder'; date?: ISODate; reminder?: Reminder; taskId?: string | null; title?: string }
  | { kind: 'event'; date?: ISODate; event?: CalendarEvent }
  | { kind: 'expense'; date?: ISODate; expense?: Expense }
  | { kind: 'study'; date?: ISODate; session?: StudySession }
  | { kind: 'photo'; date?: ISODate; selfie?: boolean }
  | { kind: 'highlight'; date: ISODate; highlight?: Highlight }
  | { kind: 'rating'; date: ISODate }
  | { kind: 'quick'; date?: ISODate }
  | {
      kind: 'confirm'
      title: string
      message?: string
      confirmLabel?: string
      destructive?: boolean
      onConfirm: () => void | Promise<void>
    }

interface DialogState {
  stack: Array<DialogRequest & { id: string }>
  open: (req: DialogRequest) => void
  close: (id?: string) => void
}

export const useDialogs = create<DialogState>((set) => ({
  stack: [],
  open: (req) => set((s) => ({ stack: [...s.stack, { ...req, id: uid() }] })),
  close: (id) =>
    set((s) => ({ stack: id ? s.stack.filter((d) => d.id !== id) : s.stack.slice(0, -1) })),
}))

export function openDialog(req: DialogRequest) {
  useDialogs.getState().open(req)
}

export function confirmDialog(opts: Omit<Extract<DialogRequest, { kind: 'confirm' }>, 'kind'>) {
  openDialog({ kind: 'confirm', ...opts })
}
