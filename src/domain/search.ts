/**
 * Universal search (pure, no DB access).
 *
 * `buildEntries` flattens rows from every module into SearchEntry objects;
 * `searchEntries` filters and ranks them. Matching is case- and
 * diacritic-insensitive, partial (substring), multi-term (all terms must
 * appear), and never builds a RegExp from user input.
 */
import type {
  CalendarEvent,
  DayEntry,
  Expense,
  ExpenseCategory,
  Highlight,
  ISODate,
  MonthlyReflection,
  Note,
  Photo,
  Reminder,
  SavedPlace,
  StudySession,
  StudySubject,
  Task,
} from '@/db/types'
import { normalize, queryTerms } from '@/lib/text'
import { formatMonth } from '@/lib/dates'

export type SearchType =
  | 'task'
  | 'reminder'
  | 'event'
  | 'note'
  | 'highlight'
  | 'photo'
  | 'expense'
  | 'study'
  | 'place'
  | 'reflection'
  | 'monthly'

export const SEARCH_TYPES: SearchType[] = [
  'task',
  'reminder',
  'event',
  'note',
  'highlight',
  'photo',
  'expense',
  'study',
  'place',
  'reflection',
  'monthly',
]

export const SEARCH_TYPE_LABELS: Record<SearchType, { one: string; many: string }> = {
  task: { one: 'Task', many: 'Tasks' },
  reminder: { one: 'Reminder', many: 'Reminders' },
  event: { one: 'Event', many: 'Events' },
  note: { one: 'Note', many: 'Notes' },
  highlight: { one: 'Highlight', many: 'Highlights' },
  photo: { one: 'Photo', many: 'Photos' },
  expense: { one: 'Expense', many: 'Expenses' },
  study: { one: 'Study session', many: 'Study sessions' },
  place: { one: 'Place', many: 'Places' },
  reflection: { one: 'Reflection', many: 'Reflections' },
  monthly: { one: 'Monthly reflection', many: 'Monthly reflections' },
}

export type SearchStatus = 'open' | 'done'

export interface SearchEntry {
  type: SearchType
  /** Record id (date for day reflections, month for monthly reflections). */
  id: string
  date: ISODate | null
  title: string
  /** Secondary searchable text (descriptions, notes, captions…). */
  text: string
  tags: string[]
  status?: SearchStatus
  /** Extra non-displayed searchable words (category, subject names). */
  keywords?: string
  record: unknown
}

export interface SearchData {
  tasks?: Task[]
  reminders?: Reminder[]
  events?: CalendarEvent[]
  notes?: Note[]
  highlights?: Highlight[]
  photos?: Photo[]
  expenses?: Expense[]
  categories?: ExpenseCategory[]
  studySessions?: StudySession[]
  subjects?: StudySubject[]
  places?: SavedPlace[]
  days?: DayEntry[]
  monthlyReflections?: MonthlyReflection[]
  /** Used to render money in expense titles. */
  formatMoney?: (minor: number, currency: string) => string
}

const REFLECTION_LABELS: Record<string, string> = {
  wentWell: 'Went well',
  difficult: 'Difficult',
  learned: 'Learned',
  differently: 'Do differently',
}

export function buildEntries(data: SearchData): SearchEntry[] {
  const out: SearchEntry[] = []
  const catName = new Map((data.categories ?? []).map((c) => [c.id, c.name]))
  const subjName = new Map((data.subjects ?? []).map((s) => [s.id, s.name]))
  const money = data.formatMoney ?? ((m: number, c: string) => `${c} ${(m / 100).toFixed(2)}`)

  for (const t of data.tasks ?? []) {
    out.push({
      type: 'task',
      id: t.id,
      date: t.date,
      title: t.title,
      text: t.description ?? '',
      tags: t.tags ?? [],
      status: t.completed ? 'done' : 'open',
      keywords: [t.category, t.priority === 'high' ? 'high priority' : ''].filter(Boolean).join(' '),
      record: t,
    })
  }
  for (const r of data.reminders ?? []) {
    const done = !r.recurrence && r.status !== 'pending'
    out.push({
      type: 'reminder',
      id: r.id,
      date: r.date,
      title: r.title,
      text: r.description ?? '',
      tags: [],
      status: done ? 'done' : 'open',
      record: r,
    })
  }
  for (const e of data.events ?? []) {
    out.push({
      type: 'event',
      id: e.id,
      date: e.date,
      title: e.title,
      text: [e.description, e.location].filter(Boolean).join(' · '),
      tags: [],
      keywords: e.calendarName ?? '',
      record: e,
    })
  }
  for (const n of data.notes ?? []) {
    out.push({
      type: 'note',
      id: n.id,
      date: n.date ?? n.updatedAt.slice(0, 10),
      title: n.title || 'Untitled note',
      text: n.content,
      tags: n.tags ?? [],
      keywords: n.archived ? 'archived' : '',
      record: n,
    })
  }
  for (const h of data.highlights ?? []) {
    out.push({ type: 'highlight', id: h.id, date: h.date, title: h.title, text: h.description ?? '', tags: h.tags ?? [], record: h })
  }
  for (const p of data.photos ?? []) {
    // Photos are only searchable through their caption, tags and selfie flag.
    out.push({
      type: 'photo',
      id: p.id,
      date: p.date,
      title: p.caption || (p.isSelfie ? 'Daily selfie' : 'Photo'),
      text: p.location?.label ?? '',
      tags: p.tags ?? [],
      keywords: p.isSelfie ? 'selfie' : '',
      record: p,
    })
  }
  for (const x of data.expenses ?? []) {
    const cat = catName.get(x.categoryId) ?? ''
    out.push({
      type: 'expense',
      id: x.id,
      date: x.date,
      title: `${x.description || cat || 'Expense'} · ${money(x.amount, x.currency)}`,
      text: [x.note, x.paymentMethod].filter(Boolean).join(' · '),
      tags: [],
      keywords: cat,
      record: x,
    })
  }
  for (const s of data.studySessions ?? []) {
    const subject = s.subjectId ? subjName.get(s.subjectId) ?? '' : ''
    out.push({
      type: 'study',
      id: s.id,
      date: s.date,
      title: [subject, s.topic].filter(Boolean).join(' — ') || 'Study session',
      text: [s.goal, s.notes].filter(Boolean).join(' · '),
      tags: s.tags ?? [],
      keywords: subject,
      record: s,
    })
  }
  for (const p of data.places ?? []) {
    out.push({
      type: 'place',
      id: p.id,
      date: p.date,
      title: p.name,
      text: [p.address, p.note].filter(Boolean).join(' · '),
      tags: [],
      record: p,
    })
  }
  for (const d of data.days ?? []) {
    const r = d.reflection
    if (!r) continue
    const parts = Object.entries(r)
      .filter(([, v]) => typeof v === 'string' && v.trim())
      .map(([k, v]) => `${REFLECTION_LABELS[k] ?? k}: ${v}`)
    if (!parts.length) continue
    out.push({ type: 'reflection', id: d.date, date: d.date, title: 'Daily reflection', text: parts.join(' · '), tags: [], record: d })
  }
  for (const m of data.monthlyReflections ?? []) {
    const parts = [m.wentWell, m.proudOf, m.improve, m.prioritize, m.aiSummary].filter((v) => v && v.trim())
    if (!parts.length) continue
    out.push({
      type: 'monthly',
      id: m.month,
      date: m.date,
      title: `${formatMonth(m.month)} reflection`,
      keywords: 'monthly',
      text: parts.join(' · '),
      tags: [],
      record: m,
    })
  }
  return out
}

export interface SearchFilters {
  types?: SearchType[]
  from?: ISODate | null
  to?: ISODate | null
  tags?: string[]
  status?: SearchStatus | 'any'
}

export interface SearchResult {
  entry: SearchEntry
  score: number
}

/**
 * Filter + rank. Every query term must appear in title, text, tags or
 * keywords. Score: terms found in the title count most, then tags, then body.
 * Ties break by recency (newest date first).
 */
export function searchEntries(entries: SearchEntry[], query: string, filters: SearchFilters = {}): SearchResult[] {
  const terms = queryTerms(query)
  const tagFilter = (filters.tags ?? []).map(normalize).filter(Boolean)
  const hasFilter = !!(filters.types?.length || filters.from || filters.to || tagFilter.length || (filters.status && filters.status !== 'any'))
  if (!terms.length && !hasFilter) return []

  const results: SearchResult[] = []
  for (const e of entries) {
    if (filters.types?.length && !filters.types.includes(e.type)) continue
    if (filters.from && (!e.date || e.date < filters.from)) continue
    if (filters.to && (!e.date || e.date > filters.to)) continue
    if (filters.status && filters.status !== 'any') {
      if (!e.status || e.status !== filters.status) continue
    }
    const tagsN = e.tags.map(normalize)
    if (tagFilter.length && !tagFilter.every((t) => tagsN.includes(t))) continue

    if (!terms.length) {
      results.push({ entry: e, score: 0 })
      continue
    }
    const title = normalize(e.title)
    const body = normalize(e.text)
    const tagStr = tagsN.join(' ')
    const kw = normalize(e.keywords)
    let score = 0
    let ok = true
    for (const t of terms) {
      if (title.includes(t)) score += title.startsWith(t) ? 12 : 10
      else if (tagStr.includes(t)) score += 6
      else if (kw.includes(t)) score += 4
      else if (body.includes(t)) score += 2
      else {
        ok = false
        break
      }
    }
    if (!ok) continue
    if (title === terms.join(' ')) score += 5
    results.push({ entry: e, score })
  }
  results.sort((a, b) => b.score - a.score || (b.entry.date ?? '').localeCompare(a.entry.date ?? ''))
  return results
}

/** Chronological order (newest first), ignoring score. */
export function sortByDate(results: SearchResult[]): SearchResult[] {
  return results.slice().sort((a, b) => (b.entry.date ?? '').localeCompare(a.entry.date ?? '') || b.score - a.score)
}

export function groupByType(results: SearchResult[]): Array<{ type: SearchType; results: SearchResult[] }> {
  const map = new Map<SearchType, SearchResult[]>()
  for (const r of results) {
    const list = map.get(r.entry.type) ?? []
    list.push(r)
    map.set(r.entry.type, list)
  }
  // Order groups by their best result's score.
  return Array.from(map.entries())
    .map(([type, rs]) => ({ type, results: rs }))
    .sort((a, b) => b.results[0].score - a.results[0].score || SEARCH_TYPES.indexOf(a.type) - SEARCH_TYPES.indexOf(b.type))
}

export function groupByDate(results: SearchResult[]): Map<ISODate, SearchResult[]> {
  const map = new Map<ISODate, SearchResult[]>()
  for (const r of results) {
    if (!r.entry.date) continue
    const list = map.get(r.entry.date) ?? []
    list.push(r)
    map.set(r.entry.date, list)
  }
  return map
}

/**
 * Split text into plain / highlighted segments for the query terms, without
 * regular expressions. Matching is done on a normalized copy whose indices
 * line up with the original as long as normalization preserves length; when
 * it doesn't (rare combined characters) we fall back to no highlighting.
 */
export function highlightSegments(text: string, query: string): Array<{ text: string; match: boolean }> {
  const terms = queryTerms(query)
  if (!text || !terms.length) return [{ text, match: false }]
  const lower = normalize(text)
  // normalize() trims; compute offset of the trimmed start.
  const lead = text.length - text.trimStart().length
  if (lower.length !== text.trim().length) return [{ text, match: false }]
  const marks = new Array<boolean>(text.length).fill(false)
  for (const t of terms) {
    let from = 0
    while (from <= lower.length - t.length) {
      const i = lower.indexOf(t, from)
      if (i < 0) break
      for (let k = i; k < i + t.length; k++) marks[k + lead] = true
      from = i + t.length
    }
  }
  const segs: Array<{ text: string; match: boolean }> = []
  for (let i = 0; i < text.length; i++) {
    const last = segs[segs.length - 1]
    if (last && last.match === marks[i]) last.text += text[i]
    else segs.push({ text: text[i], match: marks[i] })
  }
  return segs
}
