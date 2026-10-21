import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, NotebookPen, Pin, Plus, Search, X } from 'lucide-react'
import { Button, Chip, IconButton, Input, Page, PageHeader, Segmented, EmptyState, LoadingState } from '@/components/ui'
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
  const preview = query ? snippet(text, query, 70) : text.replace(/\s+/g, ' ').slice(0, 140)
  return (
    <li>
      <Link
        to={`/notes/${note.id}`}
        className="block rounded-[var(--radius-card)] border border-line bg-surface p-4 transition-colors hover:bg-surface-2"
      >
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[15px] font-medium">{note.title || <span className="text-muted">Untitled</span>}</h3>
          {note.pinned && <Pin size={14} className="mt-1 shrink-0 text-accent" aria-label="Pinned" />}
        </div>
        {preview && <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">{preview}</p>}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-faint">
          {note.date && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-muted">
              <CalendarDays size={11} aria-hidden />
              {relativeDayLabel(note.date, dateFormat)}
            </span>
          )}
          {note.tags.slice(0, 4).map((t) => (
            <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5">
              #{t}
            </span>
          ))}
          <span className="ml-auto">Edited {formatDistanceToNowStrict(new Date(note.updatedAt), { addSuffix: true })}</span>
        </div>
      </Link>
    </li>
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
      <PageHeader title="Notes" back="/more" actions={<IconButton icon={Plus} label="New note" variant="primary" onClick={newNote} />}>
        <div className="mt-3 flex flex-col gap-2.5">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes"
              aria-label="Search notes"
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Segmented
              label="Notes view"
              size="sm"
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
              className="ml-auto h-9 min-w-0 rounded-lg border border-line bg-surface-2 px-2 text-[13px] text-text focus:border-accent focus:outline-none"
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
        <div className="flex flex-col gap-5">
          {byDate.map(([date, list]) => (
            <section key={date}>
              <h2 className="mb-2 flex items-baseline justify-between px-1 text-[13px] font-medium text-muted">
                {relativeDayLabel(date, 'EEEE, d MMM yyyy')}
                <Link to={`/?d=${date}`} className="text-xs text-accent hover:underline">
                  Open day
                </Link>
              </h2>
              <ul className="flex flex-col gap-2">
                {list.map((n) => (
                  <NoteCard key={n.id} note={n} query={query} dateFormat={settings.dateFormat} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {pinned.length > 0 && (
            <section aria-label="Pinned notes">
              <h2 className="mb-2 px-1 text-xs font-semibold tracking-wider text-faint uppercase">Pinned</h2>
              <ul className="flex flex-col gap-2">
                {pinned.map((n) => (
                  <NoteCard key={n.id} note={n} query={query} dateFormat={settings.dateFormat} />
                ))}
              </ul>
            </section>
          )}
          {rest.length > 0 && (
            <section aria-label="Notes">
              {pinned.length > 0 && <h2 className="mb-2 px-1 text-xs font-semibold tracking-wider text-faint uppercase">Others</h2>}
              <ul className="flex flex-col gap-2">
                {rest.map((n) => (
                  <NoteCard key={n.id} note={n} query={query} dateFormat={settings.dateFormat} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Page>
  )
}
