import { useState } from 'react'
import { Archive, ArchiveRestore, Plus } from 'lucide-react'
import type { ExpenseCategory } from '@/db/types'
import { Button, IconButton, Input, Sheet } from '@/components/ui'
import { cn } from '@/lib/text'
import { toast } from '@/stores/ui'
import { CategoryIcon, PICKABLE_ICONS } from './categoryIcons'
import { createCategory, updateCategory, useCategories } from './expenses'

function IconPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {PICKABLE_ICONS.map((name) => (
        <button
          key={name}
          type="button"
          role="radio"
          aria-checked={value === name}
          aria-label={name.replace('-', ' ')}
          onClick={() => onChange(name)}
          className={cn(
            'grid h-10 w-10 place-items-center rounded-xl border transition-colors',
            value === name ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface-2 text-muted hover:text-text',
          )}
        >
          <CategoryIcon name={name} size={17} />
        </button>
      ))}
    </div>
  )
}

function CategoryRow({ cat }: { cat: ExpenseCategory }) {
  const [name, setName] = useState(cat.name)
  const [editingIcon, setEditingIcon] = useState(false)
  const commit = async () => {
    const clean = name.trim()
    if (!clean) return setName(cat.name)
    if (clean !== cat.name) await updateCategory(cat.id, { name: clean })
  }
  return (
    <li className={cn('py-2.5', cat.archived && 'opacity-60')}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Change icon for ${cat.name}`}
          aria-expanded={editingIcon}
          onClick={() => setEditingIcon((v) => !v)}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted hover:text-text"
        >
          <CategoryIcon name={cat.icon} size={18} />
        </button>
        <Input
          aria-label={`Name for category ${cat.name}`}
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
        <IconButton
          icon={cat.archived ? ArchiveRestore : Archive}
          label={cat.archived ? `Restore ${cat.name}` : `Archive ${cat.name}`}
          onClick={async () => {
            await updateCategory(cat.id, { archived: !cat.archived })
            toast(cat.archived ? 'Category restored' : 'Category archived — past expenses keep it')
          }}
        />
      </div>
      {editingIcon && (
        <div className="mt-2 ml-13">
          <IconPicker
            label={`Icon for ${cat.name}`}
            value={cat.icon}
            onChange={async (icon) => {
              await updateCategory(cat.id, { icon })
              setEditingIcon(false)
            }}
          />
        </div>
      )}
    </li>
  )
}

export function CategoriesSheet({ onClose }: { onClose: () => void }) {
  const categories = useCategories()
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('coffee')
  const [busy, setBusy] = useState(false)
  const add = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      await createCategory(name, icon)
      setName('')
      toast('Category added', { tone: 'success' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet title="Expense categories" description="Archive a category to hide it when adding expenses. Past expenses keep their category." onClose={onClose}>
      <form
        className="mb-3 flex flex-col gap-2 rounded-2xl border border-line p-3"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <div className="flex gap-2">
          <Input aria-label="New category name" value={name} maxLength={40} placeholder="New category" onChange={(e) => setName(e.target.value)} />
          <Button type="submit" variant="primary" icon={Plus} disabled={!name.trim()} loading={busy}>
            Add
          </Button>
        </div>
        <IconPicker label="Icon for new category" value={icon} onChange={setIcon} />
      </form>
      <ul className="divide-y divide-line">
        {(categories ?? []).map((c) => (
          <CategoryRow key={c.id} cat={c} />
        ))}
      </ul>
    </Sheet>
  )
}
