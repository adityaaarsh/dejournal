import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useToasts, type Toast } from '@/stores/ui'
import { cn } from '@/lib/text'

function ToastItem({ t }: { t: Toast }) {
  const dismiss = useToasts((s) => s.dismiss)
  useEffect(() => {
    const timer = setTimeout(() => dismiss(t.id), t.duration ?? 3500)
    return () => clearTimeout(timer)
  }, [t.id, t.duration, dismiss])
  return (
    <div
      role={t.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'dj-fade-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-line-strong bg-surface-3 py-2.5 pr-2 pl-4 text-sm shadow-xl',
        t.tone === 'error' && 'border-danger/40',
      )}
    >
      <span className={cn('flex-1', t.tone === 'error' && 'text-danger', t.tone === 'success' && 'text-success')}>{t.message}</span>
      {t.action && (
        <button
          type="button"
          className="rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-accent hover:bg-accent-soft"
          onClick={async () => {
            dismiss(t.id)
            await t.action!.onClick()
          }}
        >
          {t.action.label}
        </button>
      )}
      <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="rounded-lg p-1.5 text-muted hover:text-text">
        <X size={15} />
      </button>
    </div>
  )
}

export function ToastViewport() {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  )
}
