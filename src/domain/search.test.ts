import { describe, expect, it } from 'vitest'
import { buildEntries, groupByDate, groupByType, highlightSegments, searchEntries, sortByDate } from './search'
import type { Expense, Note, StudySession, Task } from '@/db/types'

const base = { createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }

const task = (id: string, title: string, date: string, extra: Partial<Task> = {}): Task => ({
  ...base,
  id,
  title,
  date,
  completed: false,
  priority: 'normal',
  tags: [],
  order: 0,
  ...extra,
})

const note: Note = { ...base, id: 'n1', title: 'Café ideas', content: 'Try the résumé template (v2) [draft]', tags: ['work'], pinned: false, archived: false, date: '2026-10-05' }
const expense: Expense = { ...base, id: 'e1', amount: 34000, currency: 'INR', description: 'Lunch', date: '2026-10-10', categoryId: 'food' }
const session: StudySession = { ...base, id: 's1', subjectId: 'dsa', topic: 'Graphs', date: '2026-10-12', durationSec: 3600, tags: ['exam'], source: 'manual' }

const entries = buildEntries({
  tasks: [
    task('t1', 'Pay electricity bill', '2026-10-20'),
    task('t2', 'Drink water', '2026-10-21', { completed: true, description: 'Two litres of water' }),
    task('t3', 'Water the plants', '2026-10-01'),
  ],
  notes: [note],
  expenses: [expense],
  categories: [{ id: 'food', name: 'Food', icon: 'utensils', builtin: true, order: 0 }],
  studySessions: [session],
  subjects: [{ id: 'dsa', name: 'DSA', color: '#fff', archived: false, createdAt: base.createdAt }],
  days: [{ date: '2026-10-15', rating: 4, reflection: { learned: 'Dijkstra finally clicked' }, updatedAt: base.updatedAt }],
  monthlyReflections: [{ month: '2026-09', wentWell: 'Consistent study', date: '2026-09-30', createdAt: base.createdAt, updatedAt: base.updatedAt }],
})

describe('search', () => {
  it('matches partial, case- and diacritic-insensitive terms', () => {
    expect(searchEntries(entries, 'cafe').map((r) => r.entry.id)).toEqual(['n1'])
    expect(searchEntries(entries, 'RESUME').map((r) => r.entry.id)).toEqual(['n1'])
    expect(searchEntries(entries, 'elec').map((r) => r.entry.id)).toEqual(['t1'])
  })

  it('requires all terms', () => {
    expect(searchEntries(entries, 'water plants').map((r) => r.entry.id)).toEqual(['t3'])
  })

  it('ranks title matches above body matches, then recency', () => {
    // Title prefix beats mid-title; both beat body-only.
    expect(searchEntries(entries, 'water').map((r) => r.entry.id)).toEqual(['t3', 't2'])
    // Same score → newest first.
    expect(searchEntries(entries, 'litres water').map((r) => r.entry.id)).toEqual(['t2'])
    const tie = buildEntries({ tasks: [task('old', 'Read book', '2026-01-01'), task('new', 'Read book', '2026-10-01')] })
    expect(searchEntries(tie, 'book').map((r) => r.entry.id)).toEqual(['new', 'old'])
  })

  it('handles special characters safely', () => {
    expect(() => searchEntries(entries, '(v2) [draft] .* +?')).not.toThrow()
    expect(searchEntries(entries, '(v2)').map((r) => r.entry.id)).toEqual(['n1'])
    expect(searchEntries(entries, '.*')).toEqual([])
  })

  it('searches category, subject, tags and reflections', () => {
    expect(searchEntries(entries, 'food').map((r) => r.entry.id)).toEqual(['e1'])
    expect(searchEntries(entries, 'dsa').map((r) => r.entry.id)).toEqual(['s1'])
    expect(searchEntries(entries, 'exam').map((r) => r.entry.id)).toEqual(['s1'])
    expect(searchEntries(entries, 'dijkstra').map((r) => r.entry.type)).toEqual(['reflection'])
    expect(searchEntries(entries, 'consistent').map((r) => r.entry.type)).toEqual(['monthly'])
  })

  it('applies filters', () => {
    expect(searchEntries(entries, 'water', { status: 'done' }).map((r) => r.entry.id)).toEqual(['t2'])
    expect(searchEntries(entries, 'water', { from: '2026-10-02' }).map((r) => r.entry.id)).toEqual(['t2'])
    expect(searchEntries(entries, '', { types: ['note'] }).map((r) => r.entry.id)).toEqual(['n1'])
    expect(searchEntries(entries, '', { tags: ['work'] }).map((r) => r.entry.id)).toEqual(['n1'])
    expect(searchEntries(entries, '')).toEqual([])
  })

  it('groups by type and date', () => {
    const results = searchEntries(entries, 'water')
    expect(groupByType(results)).toHaveLength(1)
    expect(groupByDate(results).get('2026-10-21')).toHaveLength(1)
    expect(sortByDate(results)[0].entry.date).toBe('2026-10-21')
  })

  it('splits highlight segments without regex', () => {
    const segs = highlightSegments('Pay electricity bill', 'ELEC bill')
    expect(segs.filter((s) => s.match).map((s) => s.text)).toEqual(['elec', 'bill'])
    expect(segs.map((s) => s.text).join('')).toBe('Pay electricity bill')
    expect(highlightSegments('a(b)c', '(b)').find((s) => s.match)?.text).toBe('(b)')
  })
})
