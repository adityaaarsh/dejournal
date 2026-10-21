import { useEffect, useId, useRef, useState } from 'react'
import { EllipsisVertical, type LucideIcon } from 'lucide-react'
import { IconButton } from '@/components/ui'
import { cn } from '@/lib/text'

export interface MenuItem {
  label: string
  icon?: LucideIcon
  onSelect: () => void
  destructive?: boolean
}

/** Small accessible overflow menu (button + list). Closes on outside click / Escape. */
export function ActionMenu({ items, label = 'More actions' }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const els = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    const i = els.indexOf(document.activeElement as HTMLButtonElement)
    els[(i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length]?.focus()
  }

  return (
    <div ref={ref} className="relative">
      <IconButton icon={EllipsisVertical} label={label} size="sm" aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} />
      {open && (
        <div
          id={id}
          role="menu"
          onKeyDown={onMenuKey}
          className="dj-fade-in absolute top-full right-0 z-30 mt-1 min-w-44 overflow-hidden rounded-xl border border-line-strong bg-surface-3 py-1 shadow-xl"
        >
          {items.map(({ label: l, icon: Icon, onSelect, destructive }) => (
            <button
              key={l}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onSelect()
              }}
              className={cn(
                'flex h-10 w-full items-center gap-2.5 px-3 text-left text-sm hover:bg-surface-2 focus:bg-surface-2 focus:outline-none',
                destructive && 'text-danger',
              )}
            >
              {Icon && <Icon size={16} strokeWidth={1.8} aria-hidden />}
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
