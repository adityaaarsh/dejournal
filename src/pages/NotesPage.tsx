import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, NotebookPen, Pin, Plus, Search, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button, Card, Chip, IconTile, Input, NavSquare, Page, PageHeader, RECORD_TONE, Segmented, EmptyState, LoadingState } from '@/components/ui'
import { db } from '@/db/db'
import type { Note } from '@/db/types'
import { formatDate, isISODate, relativeDayLabel } from '@/lib/dates'
import { matchesQuery, snippet } from '@/lib/text'
import { useSettings } from '@/stores/settings'
import { stripMarkdown } from '@/features/notes/markdownParse'
import { formatDistanceToNowStrict } from 'date-fns'

type Tab = 'all' | 'dated' | 'archived'
type Sort = 'updated' | 'created'

function NoteCard({ note, query, dateFormat }: { note: Note; query: string; dateFormat: string }) {
  const text = stripMarkdown(note.content)
  const preview = query ? snippet(text, query, 60) : text.replace(/\s+/g, ' ').slice(0, 120)
  return (
    <li className="border-t border-line first:border-t-0">
      <Link to={`/notes/${note.id}`} className="flex min-h-[58px] items-center gap-3 rounded-xl py-2 transition-colors hover:bg-surface-2/60">
        <IconTile icon={note.pinned ? Pin : NotebookPen} tone={note.pinned ? 'accent' : RECORD_TONE.note} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{note.title || <span className="font-normal text-muted">Untitled</span>}</span>
          <span className="block truncate text-xs text-muted">
            {preview || (note.tags.length ? note.tags.map((t) => `#${t}`).join(' ') : 'Empty note')}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 text-[11px] text-faint">
          {note.date ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-muted">
              <CalendarDays size={11} aria-hidden />
              {relativeDayLabel(note.date, 'd MMM')}
            </span>
          ) : null}
          <span>{formatDistanceToNowStrict(new Date(note.updatedAt), { addSuffix: true })}</span>
        </span>
      </Link>
    </li>
  )
}

function NoteGroup({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="px-3 pt-1.5 pb-1">
      <div className="flex h-9 items-center gap-2">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        <span className="ml-auto">{action}</span>
      </div>
      <ul>{children}</ul>
    </Card>
  )
}

export default function NotesPage() {
  const settings = useSettings()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>('all')
  const [sort, setSort] = useState<Sort>('updated')
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const dateFilter = isISODate(params.get('date')) ? params.get('date')! : null

  const notes = useLiveQuery(() => db.notes.toArray(), [])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    notes?.forEach((n) => !n.archived && n.tags.forEach((t) => set.add(t)))
    return [...set].sort()
  }, [notes])

  const visible = useMemo(() => {
    if (!notes) return []
    const q = query.trim()
    return notes
      .filter((n) => (tab === 'archived' ? n.archived : !n.archived))
      .filter((n) => tab !== 'dated' || !!n.date)
      .filter((n) => !dateFilter || n.date === dateFilter)
      .filter((n) => !tag || n.tags.includes(tag))
      .filter((n) => !q || matchesQuery(`${n.title} ${n.content} ${n.tags.join(' ')}`, q))
      .sort((a, b) => (sort === 'updated' ? b.updatedAt.localeCompare(a.updatedAt) : b.createdAt.localeCompare(a.createdAt)))
  }, [notes, tab, dateFilter, tag, query, sort])

  const pinned = tab === 'all' ? visible.filter((n) => n.pinned) : []
  const rest = tab === 'all' ? visible.filter((n) => !n.pinned) : visible

  const byDate = useMemo(() => {
    if (tab !== 'dated') return []
    const map = new Map<string, Note[]>()
    for (const n of rest) map.set(n.date!, [...(map.get(n.date!) ?? []), n])
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [rest, tab])

  const newNote = () => navigate(dateFilter ? `/notes/new?date=${dateFilter}` : '/notes/new')
  const filtered = !!(query.trim() || tag || dateFilter)

  return (
    <Page>
      <PageHeader title="Notes" back="/more" subtitle="Ideas, lists and thoughts" actions={<NavSquare icon={Plus} label="New note" onClick={newNote} />}>
        <div className="mt-3 flex flex-col gap-2.5">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes"
              aria-label="Search notes"
              className="h-10 pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Segmented
              label="Notes view"
              className="flex-1"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'all', label: 'All' },
                { value: 'dated', label: 'By date' },
                { value: 'archived', label: 'Archived' },
              ]}
            />
            <select
              aria-label="Sort notes"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="h-11 min-w-0 shrink-0 rounded-full border border-line bg-surface px-3 text-[13px] font-semibold text-text focus:border-accent focus:outline-none"
            >
              <option value="updated">Edited</option>
              <option value="created">Created</option>
            </select>
          </div>
          {(allTags.length > 0 || dateFilter) && (
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0">
              {dateFilter && (
                <Chip active onClick={() => setParams({})}>
                  {formatDate(dateFilter, settings.dateFormat)} <X size={12} aria-hidden />
                  <span className="sr-only">Clear date filter</span>
                </Chip>
              )}
              {allTags.map((t) => (
                <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                  #{t}
                </Chip>
              ))}
            </div>
          )}
        </div>
      </PageHeader>

      {notes === undefined ? (
        <LoadingState />
      ) : visible.length === 0 ? (
        filtered ? (
          <EmptyState icon={Search} title="No matching notes" description="Try another search or filter." className="mt-2" />
        ) : tab === 'archived' ? (
          <EmptyState title="No archived notes" description="Archived notes are hidden from the main list but stay searchable." className="mt-2" />
        ) : tab === 'dated' ? (
          <EmptyState icon={CalendarDays} title="No dated notes" description="Link a note to a day to see it here and on that day's timeline." className="mt-2" />
        ) : (
          <EmptyState
            icon={NotebookPen}
            title="No notes yet"
            description="Capture ideas, lists and thoughts. Notes can stand alone or belong to a day."
            action={
              <Button variant="primary" icon={Plus} onClick={newNote}>
                New note
              </Button>
            }
            className="mt-2"
          />
        )
      ) : tab === 'dated' ? (
        <div className="flex flex-col gap-3">
          {byDate.map(([date, list]) => (
            <NoteGroup
              key={date}
              title={relativeDayLabel(date, 'EEEE, d MMM yyyy')}
              action={
                <Link to={`/?d=${date}`} className="text-[13px] font-semibold text-accent hover:underline">
                  Open day
                </Link>
              }
            >
              {list.map((n) => (
                <NoteCard key={n.id} note={n} query={query} dateFormat={settings.dateFormat} />
              ))}
            </NoteGroup>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pinned.length > 0 && (
            <NoteGroup title="Pinned">
              {pinned.map((n) => (
                <NoteCard key={n.id} note={n} query={query} dateFormat={settings.dateFormat} />
              ))}
            </NoteGroup>
          )}
          {rest.length > 0 && (
            <NoteGroup
              title={tab === 'archived' ? 'Archived' : pinned.length ? 'Others' : 'Notes'}
              action={
                tab !== 'archived' && (
                  <button type="button" onClick={newNote} className="text-[13px] font-semibold text-accent hover:underline">
                    + New
                  </button>
                )
              }
            >
              {rest.map((n) => (
                <NoteCard key={n.id} note={n} query={query} dateFormat={settings.dateFormat} />
              ))}
            </NoteGroup>
          )}
        </div>
      )}
    </Page>
  )
}
