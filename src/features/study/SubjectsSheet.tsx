import { useState } from 'react'
import { Archive, ArchiveRestore, Plus } from 'lucide-react'
import type { StudySubject } from '@/db/types'
import { SUBJECT_COLORS } from '@/domain/study'
import { Button, EmptyState, IconButton, Input, Sheet } from '@/components/ui'
import { toast } from '@/stores/ui'
import { cn } from '@/lib/text'
import { createSubject, updateSubject, useSubjects } from './subjects'

function SubjectRow({ subject }: { subject: StudySubject }) {
  const [name, setName] = useState(subject.name)
  const [picking, setPicking] = useState(false)
  const commit = async () => {
    const clean = name.trim()
    if (!clean) {
      setName(subject.name)
      return
    }
    if (clean !== subject.name) await updateSubject(subject.id, { name: clean })
  }
  return (
    <li className={cn('py-2.5', subject.archived && 'opacity-60')}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Change colour for ${subject.name}`}
          aria-expanded={picking}
          onClick={() => setPicking((p) => !p)}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl hover:bg-surface-2"
        >
          <span className="h-4 w-4 rounded-full" style={{ background: subject.color }} />
        </button>
        <Input
          aria-label={`Name for subject ${subject.name}`}
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
        <IconButton
          icon={subject.archived ? ArchiveRestore : Archive}
          label={subject.archived ? `Restore ${subject.name}` : `Archive ${subject.name}`}
          onClick={async () => {
            await updateSubject(subject.id, { archived: !subject.archived })
            toast(subject.archived ? 'Subject restored' : 'Subject archived — past sessions are kept')
          }}
        />
      </div>
      {picking && (
        <div role="radiogroup" aria-label="Subject colour" className="mt-2 ml-13 flex flex-wrap gap-2">
          {SUBJECT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={subject.color === c}
              aria-label={`Colour ${c}`}
              onClick={async () => {
                await updateSubject(subject.id, { color: c })
                setPicking(false)
              }}
              className={cn('h-8 w-8 rounded-full border-2', subject.color === c ? 'border-text' : 'border-transparent')}
              style={{ background: c }}
            />
          ))}
        </div>
      )}
    </li>
  )
}

export function SubjectsSheet({ onClose }: { onClose: () => void }) {
  const subjects = useSubjects()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const add = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      await createSubject(name)
      setName('')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet title="Subjects" description="Archived subjects are hidden from pickers but keep their history." onClose={onClose}>
      <form
        className="mb-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <Input aria-label="New subject name" value={name} maxLength={60} placeholder="New subject" onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="primary" icon={Plus} disabled={!name.trim()} loading={busy}>
          Add
        </Button>
      </form>
      {subjects && subjects.length === 0 ? (
        <EmptyState compact title="No subjects yet" description="Add the subjects or courses you study." />
      ) : (
        <ul className="divide-y divide-line">
          {(subjects ?? []).map((s) => (
            <SubjectRow key={s.id} subject={s} />
          ))}
        </ul>
      )}
    </Sheet>
  )
}
