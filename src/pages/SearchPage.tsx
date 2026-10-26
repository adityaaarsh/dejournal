import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bell,
  BookHeart,
  BookOpen,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Image,
  List,
  MapPin,
  NotebookPen,
  Search as SearchIcon,
  SlidersHorizontal,
  Sparkles,
  SquareCheck,
  Wallet,
  X,
  ArrowUpRight,
  type LucideIcon,
} from 'lucide-react'
import { db } from '@/db/db'
import {
  buildEntries,
  groupByDate,
  groupByType,
  highlightSegments,
  searchEntries,
  sortByDate,
  SEARCH_TYPE_LABELS,
  SEARCH_TYPES,
  type SearchData,
  type SearchEntry,
  type SearchFilters,
  type SearchResult,
  type SearchType,
} from '@/domain/search'
import {
  Button,
  CenteredHeader,
  Chip,
  EmptyState,
  Field,
  IconButton,
  IconTile,
  Input,
  LoadingState,
  NavSquare,
  Page,
  RECORD_TONE,
  Segmented,
  TagInput,
  type Tone,
} from '@/components/ui'
import { kvGet, kvSet } from '@/db/repo'
import { MatchGrid } from '@/features/search/MatchGrid'
import { useSettings } from '@/stores/settings'
import { openDialog } from '@/stores/ui'
import {
  addMonthsKey,
  currentMonth,
  formatDate,
  formatMonth,
  isISODate,
  monthKey,
  relativeDayLabel,
  today,
} from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { cn, plural, snippet } from '@/lib/text'
import type { CalendarEvent, Expense, Highlight, MonthlyReflection, Reminder, StudySession, Task } from '@/db/types'

const TYPE_ICONS: Record<SearchType, LucideIcon> = {
  task: SquareCheck,
  reminder: Bell,
  event: CalendarClock,
  note: NotebookPen,
  highlight: Sparkles,
  photo: Image,
  expense: Wallet,
  study: BookOpen,
  place: MapPin,
  reflection: BookHeart,
  monthly: BookHeart,
}

/** Icon-tile colour per result type (same tones as the rest of the app). */
const TYPE_TONE: Record<SearchType, Tone> = {
  task: RECORD_TONE.task,
  reminder: RECORD_TONE.reminder,
  event: RECORD_TONE.event,
  note: RECORD_TONE.note,
  highlight: RECORD_TONE.highlight,
  photo: RECORD_TONE.photo,
  expense: RECORD_TONE.expense,
  study: RECORD_TONE.study,
  place: RECORD_TONE.place,
  reflection: RECORD_TONE.reflection,
  monthly: RECORD_TONE.reflection,
}

const RECENT_KEY = 'recentSearches'
const MAX_RECENT = 8
const PAGE_GROUP = 5

/** Load every searchable table. Photo thumbnails are dropped to keep memory low. */
async function loadSearchData(): Promise<SearchData> {
  const [tasks, reminders, events, notes, highlights, photos, expenses, categories, studySessions, subjects, places, days, monthlyReflections] =
    await Promise.all([
      db.tasks.toArray(),
      db.reminders.toArray(),
      db.events.toArray(),
      db.notes.toArray(),
      db.highlights.toArray(),
      db.photos.toArray(),
      db.expenses.toArray(),
      db.expenseCategories.toArray(),
      db.studySessions.toArray(),
      db.studySubjects.toArray(),
      db.places.toArray(),
      db.days.toArray(),
      db.monthlyReflections.toArray(),
    ])
  return {
    tasks,
    reminders,
    events,
    notes,
    highlights,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    photos: photos.map(({ thumb, ...rest }) => ({ ...rest, thumb: undefined as unknown as Blob })),
    expenses,
    categories,
    studySessions,
    subjects,
    places,
    days,
    monthlyReflections,
    formatMoney,
  }
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** Render text with query matches emphasised (no HTML injection, no regex). */
function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightSegments(text, query).map((s, i) =>
        s.match ? (
          <mark key={i} className="rounded-[3px] bg-accent-soft px-px text-accent">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  )
}

function useOpenRecord() {
  const navigate = useNavigate()
  return (e: SearchEntry) => {
    switch (e.type) {
      case 'task':
        return openDialog({ kind: 'task', task: e.record as Task, date: e.date ?? undefined })
      case 'reminder':
        return openDialog({ kind: 'reminder', reminder: e.record as Reminder, date: e.date ?? undefined })
      case 'event':
        return openDialog({ kind: 'event', event: e.record as CalendarEvent, date: e.date ?? undefined })
      case 'expense':
        return openDialog({ kind: 'expense', expense: e.record as Expense, date: e.date ?? undefined })
      case 'study':
        return openDialog({ kind: 'study', session: e.record as StudySession, date: e.date ?? undefined })
      case 'highlight':
        return openDialog({ kind: 'highlight', date: e.date ?? today(), highlight: e.record as Highlight })
      case 'reflection':
        return openDialog({ kind: 'rating', date: e.id })
      case 'note':
        return navigate(`/notes/${e.id}`)
      case 'photo':
        return navigate(`/photos?open=${e.id}`)
      case 'place':
        return navigate(`/places?open=${e.id}`)
      case 'monthly':
        return navigate(`/recap?m=${(e.record as MonthlyReflection).month}#reflection`)
    }
  }
}

function ResultItem({ r, query, onOpen, dateFormat }: { r: SearchResult; query: string; onOpen: (e: SearchEntry) => void; dateFormat: string }) {
  const navigate = useNavigate()
  const e = r.entry
  const Icon = TYPE_ICONS[e.type]
  const snip = e.text ? snippet(e.text, query, 56) : ''
  const done = e.status === 'done'
  return (
    <li className="flex items-center gap-1 border-t border-line first:border-t-0">
      <button
        type="button"
        onClick={() => onOpen(e)}
        className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 rounded-xl py-2 text-left transition-colors hover:bg-surface-2/60"
        aria-label={`${SEARCH_TYPE_LABELS[e.type].one}: ${e.title}${e.date ? `, ${relativeDayLabel(e.date, dateFormat)}` : ''}`}
      >
        <span className="w-12 shrink-0 text-xs font-semibold text-muted tabular-nums">{e.date ? formatDate(e.date, 'd MMM') : '—'}</span>
        <IconTile icon={Icon} tone={done ? 'muted' : TYPE_TONE[e.type]} />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[14px] font-semibold', done && 'text-faint line-through decoration-faint')}>
            <Highlighted text={e.title} query={query} />
          </span>
          <span className="block truncate text-xs text-muted">
            {snip ? (
              <Highlighted text={snip} query={query} />
            ) : (
              <>
                {SEARCH_TYPE_LABELS[e.type].one}
                {done && ' · done'}
                {e.tags.slice(0, 3).map((t) => ` #${t}`)}
              </>
            )}
          </span>
        </span>
      </button>
      {e.date && (
        <IconButton icon={ArrowUpRight} size="sm" label={`Open ${formatDate(e.date, 'd MMM yyyy')}`} onClick={() => navigate(`/?d=${e.date}`)} />
      )}
    </li>
  )
}

function Group({ title, count, children, more }: { title: string; count: number; children: ReactNode; more?: ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface px-3 pt-2.5 pb-1.5">
      <h2 className="flex items-center justify-between pb-1 text-[14px] font-semibold">
        {title}
        <span className="text-xs font-semibold text-muted tabular-nums">{count}</span>
      </h2>
      <ul>{children}</ul>
      {more}
    </section>
  )
}

function ListResults({ results, query, onOpen, sort, dateFormat }: { results: SearchResult[]; query: string; onOpen: (e: SearchEntry) => void; sort: 'relevance' | 'newest'; dateFormat: string }) {
  const [expanded, setExpanded] = useState<Set<SearchType>>(new Set())
  if (sort === 'newest') {
    const sorted = sortByDate(results)
    return (
      <Group title="Newest first" count={sorted.length}>
        {sorted.slice(0, 200).map((r) => (
          <ResultItem key={`${r.entry.type}:${r.entry.id}`} r={r} query={query} onOpen={onOpen} dateFormat={dateFormat} />
        ))}
      </Group>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {groupByType(results).map(({ type, results: rs }) => {
        const open = expanded.has(type)
        const shown = open ? rs : rs.slice(0, PAGE_GROUP)
        return (
          <Group
            key={type}
            title={SEARCH_TYPE_LABELS[type].many}
            count={rs.length}
            more={
              rs.length > PAGE_GROUP && (
                <button
                  type="button"
                  className="h-10 w-full rounded-xl border-t border-line text-[13px] font-semibold text-accent hover:bg-surface-2/60"
                  onClick={() =>
                    setExpanded((s) => {
                      const n = new Set(s)
                      if (open) n.delete(type)
                      else n.add(type)
                      return n
                    })
                  }
                >
                  {open ? 'Show fewer' : `Show all ${rs.length}`}
                </button>
              )
            }
          >
            {shown.map((r) => (
              <ResultItem key={`${r.entry.type}:${r.entry.id}`} r={r} query={query} onOpen={onOpen} dateFormat={dateFormat} />
            ))}
          </Group>
        )
      })}
    </div>
  )
}

function CalendarResults({ results, query, onOpen, dateFormat }: { results: SearchResult[]; query: string; onOpen: (e: SearchEntry) => void; dateFormat: string }) {
  const settings = useSettings()
  const byDate = useMemo(() => groupByDate(results), [results])
  const latest = useMemo(() => {
    let max = ''
    for (const d of byDate.keys()) if (d > max) max = d
    return max
  }, [byDate])
  const [month, setMonth] = useState(() => (latest ? monthKey(latest) : currentMonth()))
  const [selected, setSelected] = useState<string | null>(null)

  // Jump to the newest match whenever the result set changes.
  useEffect(() => {
    setMonth(latest ? monthKey(latest) : currentMonth())
    setSelected(null)
  }, [latest])

  const counts = new Map<string, number>()
  for (const [d, rs] of byDate) if (d.startsWith(month)) counts.set(d, rs.length)
  const monthCount = Array.from(byDate.entries()).filter(([d]) => d.startsWith(month)).reduce((s, [, v]) => s + v.length, 0)
  const undated = results.filter((r) => !r.entry.date).length
  const selectedResults = selected ? byDate.get(selected) ?? [] : []

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <NavSquare icon={ChevronLeft} label="Previous month" onClick={() => setMonth((m) => addMonthsKey(m, -1))} />
        <div className="min-w-0 flex-1 text-center">
          <h2 className="font-display text-[16px] font-semibold tracking-tight">{formatMonth(month)}</h2>
          <p className="text-xs text-muted">{monthCount ? `${plural(monthCount, 'match', 'matches')} this month` : 'No matches this month'}</p>
        </div>
        <NavSquare icon={ChevronRight} label="Next month" onClick={() => setMonth((m) => addMonthsKey(m, 1))} />
      </div>
      <MatchGrid
        month={month}
        weekStartsOn={settings.weekStartsOn}
        today={today()}
        selected={selected}
        counts={counts}
        onSelect={(d) => setSelected(selected === d ? null : d)}
      />
      {selected ? (
        selectedResults.length ? (
          <Group title={formatDate(selected, 'EEEE d')} count={selectedResults.length}>
            {selectedResults.map((r) => (
              <ResultItem key={`${r.entry.type}:${r.entry.id}`} r={r} query={query} onOpen={onOpen} dateFormat={dateFormat} />
            ))}
          </Group>
        ) : (
          <p className="px-1 text-center text-[13px] text-muted">No matches on {formatDate(selected, 'd MMMM')}.</p>
        )
      ) : (
        <p className="px-1 text-center text-[13px] text-muted">
          {byDate.size ? 'Highlighted days have matches. Select one to see them.' : 'None of the matches have a date.'}
          {undated > 0 && ` ${plural(undated, 'match')} without a date ${undated === 1 ? 'is' : 'are'} shown in List mode.`}
        </p>
      )}
    </div>
  )
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const settings = useSettings()
  const openRecord = useOpenRecord()
  const inputRef = useRef<HTMLInputElement>(null)

  const q = params.get('q') ?? ''
  const mode = params.get('mode') === 'calendar' ? 'calendar' : 'list'
  const types = (params.get('types') ?? '').split(',').filter((t): t is SearchType => (SEARCH_TYPES as string[]).includes(t))
  const from = isISODate(params.get('from')) ? params.get('from')! : ''
  const to = isISODate(params.get('to')) ? params.get('to')! : ''
  const tags = (params.get('tags') ?? '').split(',').filter(Boolean)
  const statusParam = params.get('status')
  const status: SearchFilters['status'] = statusParam === 'open' || statusParam === 'done' ? statusParam : 'any'

  const [draft, setDraft] = useState(q)
  const [showFilters, setShowFilters] = useState(false)
  const [sort, setSort] = useState<'relevance' | 'newest'>('relevance')
  const debounced = useDebounced(draft, 200)

  const update = (patch: Record<string, string | null>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v)
          else next.delete(k)
        }
        return next
      },
      { replace: true },
    )
  }

  // Debounced query → URL (preserved across mode switches).
  useEffect(() => {
    if (debounced.trim() !== q.trim()) update({ q: debounced.trim() || null })
  }, [debounced]) // eslint-disable-line react-hooks/exhaustive-deps

  // Back/forward navigation updates the input.
  useEffect(() => {
    if (q !== draft.trim()) setDraft(q)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const data = useLiveQuery(loadSearchData, [])
  const recent = useLiveQuery(async () => (await kvGet<string[]>(RECENT_KEY)) ?? [], [])
  const entries = useMemo(() => (data ? buildEntries(data) : []), [data])
  const filters: SearchFilters = { types, from: from || null, to: to || null, tags, status }
  const filterCount = (types.length ? 1 : 0) + (from || to ? 1 : 0) + (tags.length ? 1 : 0) + (status !== 'any' ? 1 : 0)
  const results = useMemo(
    () => searchEntries(entries, q, filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, q, params.get('types'), from, to, params.get('tags'), status],
  )
  const active = q.trim().length > 0 || filterCount > 0
  const pending = draft.trim() !== q.trim()

  const saveRecent = async (term: string) => {
    const t = term.trim()
    if (!settings.recentSearchesEnabled || t.length < 2) return
    const list = ((await kvGet<string[]>(RECENT_KEY)) ?? []).filter((x) => x.toLowerCase() !== t.toLowerCase())
    await kvSet(RECENT_KEY, [t, ...list].slice(0, MAX_RECENT))
  }

  const onOpen = (e: SearchEntry) => {
    void saveRecent(q)
    openRecord(e)
  }

  const toggleType = (t: SearchType) => {
    const next = types.includes(t) ? types.filter((x) => x !== t) : [...types, t]
    update({ types: next.join(',') || null })
  }

  return (
    <Page>
      <CenteredHeader
        title="Search"
        subtitle={data ? `${plural(entries.length, 'record')} in your journal` : 'Loading…'}
        right={
          <NavSquare
            icon={SlidersHorizontal}
            label={showFilters ? 'Hide filters' : `Filters${filterCount ? ` (${filterCount} active)` : ''}`}
            active={showFilters || filterCount > 0}
            onClick={() => setShowFilters((s) => !s)}
          />
        }
      />
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          update({ q: draft.trim() || null })
          void saveRecent(draft)
          inputRef.current?.blur()
        }}
      >
        <div className="relative">
          <SearchIcon size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && draft) {
                e.preventDefault()
                setDraft('')
                update({ q: null })
              }
            }}
            placeholder="Search tasks, notes, memories…"
            aria-label="Search all records"
            className="h-[52px] w-full rounded-[18px] border border-line bg-surface pr-12 pl-11 text-[15px] placeholder:text-faint focus:border-accent focus:outline-none focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {draft && (
            <IconButton
              icon={X}
              size="sm"
              label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2"
              onClick={() => {
                setDraft('')
                update({ q: null })
                inputRef.current?.focus()
              }}
            />
          )}
        </div>
      </form>
      <Segmented
        label="Result view"
        className="mt-3 w-full"
        value={mode}
        onChange={(m) => update({ mode: m === 'list' ? null : m })}
        options={[
          { value: 'list', label: 'List', icon: <List size={14} aria-hidden /> },
          { value: 'calendar', label: 'Calendar', icon: <CalendarDays size={14} aria-hidden /> },
        ]}
      />
      <div className="scrollbar-none -mx-4 mt-3 mb-3 flex gap-1.5 overflow-x-auto px-4 sm:-mx-6 sm:px-6" role="group" aria-label="Record types">
        {SEARCH_TYPES.filter((t) => t !== 'monthly').map((t) => {
          const Icon = TYPE_ICONS[t]
          return (
            <Chip key={t} active={types.includes(t)} onClick={() => toggleType(t)} className="h-8 shrink-0 px-3">
              <Icon size={13} aria-hidden /> {SEARCH_TYPE_LABELS[t].many}
            </Chip>
          )
        })}
      </div>

      {showFilters && (
        <section id="search-filters" aria-label="Search filters" className="dj-fade-in mb-3 flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">{(p) => <Input type="date" {...p} value={from} max={to || undefined} onChange={(e) => update({ from: e.target.value || null })} />}</Field>
            <Field label="To">{(p) => <Input type="date" {...p} value={to} min={from || undefined} onChange={(e) => update({ to: e.target.value || null })} />}</Field>
          </div>
          <Field label="Tags">{(p) => <TagInput id={p.id} value={tags} onChange={(t) => update({ tags: t.join(',') || null })} placeholder="Filter by tags" />}</Field>
          <div>
            <p className="mb-2 text-[13px] font-medium text-muted">Status (tasks & reminders)</p>
            <Segmented
              label="Completion status"
              size="sm"
              value={status ?? 'any'}
              onChange={(s) => update({ status: s === 'any' ? null : s })}
              options={[
                { value: 'any', label: 'Any' },
                { value: 'open', label: 'Open' },
                { value: 'done', label: 'Done' },
              ]}
            />
          </div>
          {filterCount > 0 && (
            <Button size="sm" variant="ghost" className="self-start" onClick={() => update({ types: null, from: null, to: null, tags: null, status: null })}>
              Clear filters
            </Button>
          )}
        </section>
      )}

      {!data ? (
        <LoadingState label="Loading your records…" />
      ) : !active ? (
        <div className="flex flex-col gap-5">
          {settings.recentSearchesEnabled && recent && recent.length > 0 && (
            <section aria-labelledby="recent-h">
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 id="recent-h" className="text-[13px] font-semibold text-muted">
                  Recent searches
                </h2>
                <button type="button" className="text-[13px] text-accent hover:underline" onClick={() => kvSet(RECENT_KEY, [])}>
                  Clear
                </button>
              </div>
              <ul className="rounded-[var(--radius-card)] border border-line bg-surface px-3 py-1">
                {recent.map((t) => (
                  <li key={t} className="border-t border-line first:border-t-0">
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(t)
                        update({ q: t })
                      }}
                      className="flex min-h-[52px] w-full items-center gap-3 text-left"
                    >
                      <IconTile icon={Clock} tone="muted" />
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{t}</span>
                      <ArrowUpRight size={15} className="text-faint" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <EmptyState
            compact
            icon={SearchIcon}
            title="Search everything in DeJournal"
            description="Tasks, reminders, notes, highlights, photo captions, expenses, study sessions, events, places and reflections. Use several words to narrow results."
          />
        </div>
      ) : results.length === 0 ? (
        pending ? (
          <LoadingState label="Searching…" />
        ) : (
          <EmptyState
            icon={SearchIcon}
            title="No matches"
            description={
              filterCount
                ? 'Nothing matches this search with the current filters. Try removing a filter.'
                : 'Try a shorter word or a different spelling. Search looks for every word you type.'
            }
            action={
              filterCount > 0 && (
                <Button size="sm" onClick={() => update({ types: null, from: null, to: null, tags: null, status: null })}>
                  Clear filters
                </Button>
              )
            }
          />
        )
      ) : (
        <div className={cn('flex flex-col gap-3', pending && 'opacity-70 transition-opacity')}>
          <div className="flex items-center justify-between px-1">
            <p className="text-[13px] text-muted" aria-live="polite">
              {plural(results.length, 'result')}
            </p>
            {mode === 'list' && (
              <Segmented
                label="Sort results"
                size="sm"
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'relevance', label: 'Best match' },
                  { value: 'newest', label: 'Newest' },
                ]}
              />
            )}
          </div>
          {mode === 'list' ? (
            <ListResults results={results} query={q} onOpen={onOpen} sort={sort} dateFormat={settings.dateFormat} />
          ) : (
            <CalendarResults results={results} query={q} onOpen={onOpen} dateFormat={settings.dateFormat} />
          )}
        </div>
      )}
    </Page>
  )
}
