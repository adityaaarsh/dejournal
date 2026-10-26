import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Plus, Search, Sparkles, X } from 'lucide-react'
import { Button, Chip, IconButton, IconTile, Input, NavSquare, Page, PageHeader, EmptyState, LoadingState, RECORD_TONE } from '@/components/ui'
import { db } from '@/db/db'
import { usePhotoUrl } from '@/db/photos'
import type { Highlight } from '@/db/types'
import { formatDate, formatMonth, monthKey, relativeDayLabel, today } from '@/lib/dates'
import { matchesQuery } from '@/lib/text'
import { openDialog } from '@/stores/ui'

function HighlightRow({ h }: { h: Highlight }) {
  const thumb = usePhotoUrl(h.photoId)
  return (
    <li className="flex min-h-[54px] items-center gap-3 py-1.5">
      <span className="w-10 shrink-0 text-center leading-tight">
        <span className="block font-display text-[15px] font-semibold tabular-nums">{Number(h.date.slice(8))}</span>
        <span className="block text-[10px] font-semibold text-muted uppercase">{formatDate(h.date, 'EEE')}</span>
      </span>
      <IconTile icon={Sparkles} tone={RECORD_TONE.highlight} />
      <button
        type="button"
        onClick={() => openDialog({ kind: 'highlight', date: h.date, highlight: h })}
        className="min-w-0 flex-1 text-left"
        aria-label={`Edit highlight: ${h.title}`}
      >
        <span className="block truncate text-[14px] font-semibold">{h.title}</span>
        <span className="block truncate text-xs text-muted">
          {[h.description, h.tags.map((t) => `#${t}`).join(' ')].filter(Boolean).join(' · ') || relativeDayLabel(h.date, 'EEE, d MMM')}
        </span>
      </button>
      {thumb && <img src={thumb} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-[10px] object-cover" />}
      <Link to={`/?d=${h.date}`} aria-label={`Open ${formatDate(h.date, 'd MMMM')}`} className="grid h-9 w-7 shrink-0 place-items-center rounded-lg text-faint hover:text-accent">
        <ChevronRight size={16} aria-hidden />
      </Link>
    </li>
  )
}

export default function HighlightsPage() {
  const highlights = useLiveQuery(() => db.highlights.orderBy('date').reverse().toArray(), [])
  const [month, setMonth] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const tags = useMemo(() => {
    const s = new Set<string>()
    highlights?.forEach((h) => h.tags.forEach((t) => s.add(t)))
    return [...s].sort()
  }, [highlights])

  const visible = useMemo(
    () =>
      (highlights ?? []).filter(
        (h) =>
          (!month || monthKey(h.date) === month) &&
          (!tag || h.tags.includes(tag)) &&
          (!query.trim() || matchesQuery(`${h.title} ${h.description ?? ''} ${h.tags.join(' ')}`, query)),
      ),
    [highlights, month, tag, query],
  )

  const groups = useMemo(() => {
    const map = new Map<string, Highlight[]>()
    for (const h of visible) map.set(monthKey(h.date), [...(map.get(monthKey(h.date)) ?? []), h])
    return [...map.entries()]
  }, [visible])

  const add = () => openDialog({ kind: 'highlight', date: today() })
  const filtered = !!(month || tag || query.trim())

  return (
    <Page>
      <PageHeader title="Highlights" subtitle="The best part of each day" back="/more" actions={<NavSquare icon={Plus} label="Add today's highlight" onClick={add} />}>
        {highlights && highlights.length > 0 && (
          <div className="mt-3 flex flex-col gap-2.5">
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" aria-hidden />
                <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search highlights" aria-label="Search highlights" className="pl-10" />
              </div>
              <div className="flex items-center">
                <input
                  type="month"
                  aria-label="Filter by month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="h-11 w-36 rounded-xl border border-line bg-surface-2 px-2 text-[13px]"
                />
                {month && <IconButton icon={X} label="Clear month filter" size="sm" onClick={() => setMonth('')} />}
              </div>
            </div>
            {tags.length > 0 && (
              <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0">
                {tags.map((t) => (
                  <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                    #{t}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        )}
      </PageHeader>

      {highlights === undefined ? (
        <LoadingState />
      ) : highlights.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No highlights yet"
          description="Each day, note the moment you want to remember. They collect here."
          action={
            <Button variant="primary" icon={Plus} onClick={add}>
              Add today's highlight
            </Button>
          }
        />
      ) : visible.length === 0 && filtered ? (
        <EmptyState icon={Search} title="No matching highlights" description="Try a different month, tag or search." />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(([m, list]) => (
            <section key={m} aria-label={formatMonth(m)} className="rounded-[var(--radius-card)] border border-line bg-surface px-3 pt-2.5 pb-1.5">
              <div className="flex items-center gap-2 pb-1">
                <h2 className="text-[14px] font-semibold">{formatMonth(m)}</h2>
                <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted tabular-nums">{list.length}</span>
              </div>
              <ul className="flex flex-col">
                {list.map((h) => (
                  <HighlightRow key={h.id} h={h} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Page>
  )
}
