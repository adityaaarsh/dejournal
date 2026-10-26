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

/** Theme tile tone (1–5) for a subject, derived from its stored colour slot. */
export type SubjectTone = 1 | 2 | 3 | 4 | 5
const TONE_BG: Record<SubjectTone, string> = { 1: 'bg-tile-1', 2: 'bg-tile-2', 3: 'bg-tile-3', 4: 'bg-tile-4', 5: 'bg-tile-5' }

export function subjectTone(subject?: Pick<StudySubject, 'color' | 'id'> | { color?: string; id?: string } | null): SubjectTone {
  if (!subject) return 3
  const i = subject.color ? SUBJECT_COLORS.indexOf(subject.color) : -1
  if (i >= 0) return ((i % 5) + 1) as SubjectTone
  let h = 0
  for (const ch of subject.id ?? subject.color ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return ((h % 5) + 1) as SubjectTone
}

/** Stored colour that maps to a tone (keeps the existing storage format). */
export function colorForTone(tone: SubjectTone): string {
  return SUBJECT_COLORS[tone - 1]
}

export function SubjectDot({ color, className = '' }: { color?: string; className?: string }) {
  const bg = color ? TONE_BG[subjectTone({ color })] : 'bg-faint'
  return <span aria-hidden className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${bg} ${className}`} />
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
