import { useState } from 'react'
import { Archive, ArchiveRestore, Plus } from 'lucide-react'
import type { StudySubject } from '@/db/types'
import { Button, EmptyState, IconButton, Input, Sheet } from '@/components/ui'
import { toast } from '@/stores/ui'
import { cn } from '@/lib/text'
import { colorForTone, createSubject, subjectTone, updateSubject, useSubjects, type SubjectTone } from './subjects'

const TILE: Record<SubjectTone, string> = { 1: 'bg-tile-1', 2: 'bg-tile-2', 3: 'bg-tile-3', 4: 'bg-tile-4', 5: 'bg-tile-5' }

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
          <span className={cn('h-5 w-5 rounded-md', TILE[subjectTone(subject)])} />
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
          {([1, 2, 3, 4, 5] as SubjectTone[]).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={subjectTone(subject) === t}
              aria-label={`Colour ${t}`}
              onClick={async () => {
                await updateSubject(subject.id, { color: colorForTone(t) })
                setPicking(false)
              }}
              className={cn('h-9 w-9 rounded-xl ring-offset-2 ring-offset-surface', TILE[t], subjectTone(subject) === t && 'ring-2 ring-text')}
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
