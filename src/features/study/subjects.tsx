import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Plus, X } from 'lucide-react'
import { db } from '@/db/db'
import type { StudySubject } from '@/db/types'
import { nowISO, uid } from '@/lib/id'
import { normalize } from '@/lib/text'
import { SUBJECT_COLORS } from '@/domain/study'
import { IconButton, Input, Select } from '@/components/ui'

/** All subjects (archived last), live. */
export function useSubjects(): StudySubject[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.studySubjects.toArray()
    return all.sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name))
  }, [])
}

export function subjectMap(subjects: StudySubject[] | undefined): Map<string, StudySubject> {
  return new Map((subjects ?? []).map((s) => [s.id, s]))
}

/** Create a subject, or return the existing one with the same name. */
export async function createSubject(name: string, color?: string): Promise<StudySubject> {
  const clean = name.trim()
  const existing = (await db.studySubjects.toArray()).find((s) => normalize(s.name) === normalize(clean))
  if (existing) {
    if (existing.archived) await db.studySubjects.update(existing.id, { archived: false })
    return { ...existing, archived: false }
  }
  const count = await db.studySubjects.count()
  const subject: StudySubject = {
    id: uid(),
    name: clean,
    color: color ?? SUBJECT_COLORS[count % SUBJECT_COLORS.length],
    archived: false,
    createdAt: nowISO(),
  }
  await db.studySubjects.add(subject)
  return subject
}

export async function updateSubject(id: string, patch: Partial<StudySubject>): Promise<void> {
  await db.studySubjects.update(id, patch)
}

export function SubjectDot({ color, className = '' }: { color?: string; className?: string }) {
  return <span aria-hidden className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${className}`} style={{ background: color ?? 'var(--c-faint)' }} />
}

/**
 * Subject select with an inline "New subject…" option.
 * value '' means no subject.
 */
export function SubjectPicker({ id, value, onChange }: { id?: string; value: string; onChange: (id: string) => void }) {
  const subjects = useSubjects()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const active = (subjects ?? []).filter((s) => !s.archived || s.id === value)

  const add = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      const s = await createSubject(name)
      onChange(s.id)
      setAdding(false)
      setName('')
    } finally {
      setBusy(false)
    }
  }

  if (adding) {
    return (
      <div className="flex gap-2">
        <Input
          id={id}
          autoFocus
          value={name}
          maxLength={60}
          placeholder="Subject name, e.g. DSA"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.stopPropagation()
              add()
            } else if (e.key === 'Escape') {
              e.stopPropagation()
              setAdding(false)
            }
          }}
        />
        <IconButton icon={Check} label="Add subject" variant="primary" onClick={add} disabled={!name.trim() || busy} />
        <IconButton icon={X} label="Cancel new subject" variant="secondary" onClick={() => setAdding(false)} />
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <Select
        id={id}
        value={value}
        onChange={(e) => {
          if (e.target.value === '__new') setAdding(true)
          else onChange(e.target.value)
        }}
      >
        <option value="">No subject</option>
        {active.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.archived ? ' (archived)' : ''}
          </option>
        ))}
        <option value="__new">+ New subject…</option>
      </Select>
      {active.length === 0 && <IconButton icon={Plus} label="New subject" variant="secondary" onClick={() => setAdding(true)} />}
    </div>
  )
}
