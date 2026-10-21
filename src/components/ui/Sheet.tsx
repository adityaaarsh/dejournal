import { useEffect, useRef, type FormEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/text'
import { IconButton } from './Button'
import { useBackHandler } from '@/platform/back'

/**
 * Modal sheet built on the native <dialog> element (focus trap, Esc, inert
 * background for free). Bottom sheet on mobile, centred panel on wider screens.
 * Rendered open; unmount (or call onClose) to close.
 */
export function Sheet({
  title,
  onClose,
  children,
  footer,
  onSubmit,
  size = 'md',
  description,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** If given, the body is a <form> and Enter submits. */
  onSubmit?: () => void
  size?: 'sm' | 'md' | 'lg'
  description?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useBackHandler(() => closeRef.current())

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (!d.open) d.showModal()
    const onCancel = (e: Event) => {
      e.preventDefault()
      closeRef.current()
    }
    d.addEventListener('cancel', onCancel)
    return () => d.removeEventListener('cancel', onCancel)
  }, [])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit?.()
  }

  const Body = onSubmit ? 'form' : 'div'

  return (
    <dialog
      ref={ref}
      className="dj-sheet"
      aria-label={title}
      onMouseDown={(e) => {
        // Click on backdrop area (the dialog itself, outside the panel) closes.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="flex h-full w-full items-end justify-center sm:items-center sm:p-6"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <Body
          onSubmit={onSubmit ? handleSubmit : undefined}
          noValidate
          className={cn(
            'dj-sheet-panel flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[22px] border border-line bg-surface shadow-2xl sm:rounded-[20px]',
            size === 'sm' && 'sm:max-w-sm',
            size === 'md' && 'sm:max-w-lg',
            size === 'lg' && 'sm:max-w-2xl',
          )}
        >
          <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
            <div className="min-w-0 pt-1.5">
              <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
              {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
            </div>
            <IconButton icon={X} label="Close" size="sm" onClick={onClose} className="-mr-2" />
          </div>
          <div className="flex-1 overflow-y-auto px-5 pt-2 pb-5">{children}</div>
          {footer && (
            <div className="pb-safe flex items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3">{footer}</div>
          )}
        </Body>
      </div>
    </dialog>
  )
}
