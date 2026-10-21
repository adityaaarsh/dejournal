import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { X } from 'lucide-react'
import { cn, parseTags } from '@/lib/text'

const control =
  'w-full rounded-xl border border-line bg-surface-2 px-3.5 text-[15px] text-text placeholder:text-faint ' +
  'transition-colors focus:border-accent focus:outline-none focus-visible:outline-none ' +
  'disabled:opacity-60 aria-[invalid=true]:border-danger'

/**
 * Labelled form field. Pass a render function to receive the generated id and
 * aria props, so the label and error are always associated with the control.
 */
export function Field({
  label,
  hint,
  error,
  optional,
  className,
  children,
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  optional?: boolean
  className?: string
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode
}) {
  const id = useId()
  const descId = `${id}-desc`
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-muted">
        {label}
        {optional && <span className="ml-1 font-normal text-faint">(optional)</span>}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': error || hint ? descId : undefined })}
      {error ? (
        <p id={descId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={descId} className="text-xs text-faint">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(control, 'h-11', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(control, 'resize-y py-2.5 leading-relaxed', className)} {...rest} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cn(control, 'h-11 appearance-none bg-[length:16px] pr-9', className)} style={selectArrow} {...rest}>
      {children}
    </select>
  )
})

const selectArrow = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239a9ca3' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
}

/** Accessible on/off switch. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: ReactNode
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className={cn('flex items-center justify-between gap-4 py-2', disabled && 'opacity-60')}>
      <div className="min-w-0">
        <label htmlFor={id} className="text-[15px]">
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs text-faint">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150',
          checked ? 'bg-accent' : 'bg-surface-3',
        )}
      >
        <span
          className={cn(
            'absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </div>
  )
}

/** Segmented control (radio group). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: ReactNode; icon?: ReactNode }>
  label: string
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-xl border border-line bg-surface-2 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex flex-1 items-center justify-center gap-1.5 rounded-[10px] font-medium whitespace-nowrap transition-colors',
            size === 'md' ? 'h-9 px-3 text-sm' : 'h-7 px-2.5 text-[13px]',
            value === o.value ? 'bg-surface-3 text-text shadow-sm' : 'text-muted hover:text-text',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Chip({
  children,
  active,
  onClick,
  className,
  tone = 'default',
}: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
  className?: string
  tone?: 'default' | 'accent' | 'warn' | 'success' | 'danger'
}) {
  const cls = cn(
    'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap transition-colors',
    active ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface-2 text-muted',
    tone === 'warn' && !active && 'border-warn-line bg-warn-soft text-warn',
    tone === 'success' && !active && 'border-transparent bg-success-soft text-success',
    tone === 'danger' && !active && 'border-transparent bg-danger-soft text-danger',
    tone === 'accent' && !active && 'border-transparent bg-accent-soft text-accent',
    onClick && 'hover:text-text',
    className,
  )
  if (onClick)
    return (
      <button type="button" aria-pressed={active} onClick={onClick} className={cls}>
        {children}
      </button>
    )
  return <span className={cls}>{children}</span>
}

/** Comma-separated tag entry with removable chips. */
export function TagInput({
  value,
  onChange,
  id,
  placeholder = 'Add tags, comma separated',
}: {
  value: string[]
  onChange: (tags: string[]) => void
  id?: string
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')
  const commit = () => {
    const tags = parseTags(draft)
    if (tags.length) onChange(Array.from(new Set([...value, ...tags])))
    setDraft('')
  }
  return (
    <div className={cn(control, 'flex min-h-11 flex-wrap items-center gap-1.5 py-1.5')}>
      {value.map((t) => (
        <span key={t} className="inline-flex h-7 items-center gap-1 rounded-full bg-surface-3 pr-1 pl-2.5 text-xs">
          #{t}
          <button
            type="button"
            aria-label={`Remove tag ${t}`}
            onClick={() => onChange(value.filter((x) => x !== t))}
            className="rounded-full p-0.5 text-muted hover:text-text"
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={commit}
        placeholder={value.length ? '' : placeholder}
        className="h-8 min-w-24 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
      />
    </div>
  )
}
