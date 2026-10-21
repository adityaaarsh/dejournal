import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Search, Sparkles, X } from 'lucide-react'
import { Button, Chip, IconButton, Input, Page, PageHeader, EmptyState, LoadingState } from '@/components/ui'
import { db } from '@/db/db'
import { usePhotoUrl } from '@/db/photos'
import type { Highlight } from '@/db/types'
import { formatMonth, monthKey, relativeDayLabel, today } from '@/lib/dates'
import { matchesQuery } from '@/lib/text'
import { openDialog } from '@/stores/ui'

function HighlightCard({ h }: { h: Highlight }) {
  const thumb = usePhotoUrl(h.photoId)
  return (
    <li className="flex gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <button
        type="button"
        onClick={() => openDialog({ kind: 'highlight', date: h.date, highlight: h })}
        className="flex min-w-0 flex-1 gap-3 text-left"
        aria-label={`Edit highlight: ${h.title}`}
      >
        {thumb && <img src={thumb} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl object-cover" />}
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted">{relativeDayLabel(h.date, 'EEE, d MMM yyyy')}</span>
          <span className="mt-0.5 block text-[15px] font-medium">{h.title}</span>
          {h.description && <span className="mt-1 line-clamp-3 block text-[13px] leading-relaxed text-muted">{h.description}</span>}
          {h.tags.length > 0 && <span className="mt-1.5 block text-xs text-faint">{h.tags.map((t) => `#${t}`).join(' ')}</span>}
        </span>
      </button>
      <Link to={`/?d=${h.date}`} className="shrink-0 self-start rounded-lg px-2 py-1 text-xs font-medium text-accent hover:bg-accent-soft">
        Open day
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
      <PageHeader title="Highlights" subtitle="The best part of each day" back="/more" actions={<IconButton icon={Plus} label="Add today's highlight" variant="primary" onClick={add} />}>
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
        <div className="flex flex-col gap-6">
          {groups.map(([m, list]) => (
            <section key={m} aria-label={formatMonth(m)}>
              <h2 className="mb-2 px-1 text-xs font-semibold tracking-wider text-faint uppercase">
                {formatMonth(m)} · {list.length}
              </h2>
              <ul className="flex flex-col gap-2">
                {list.map((h) => (
                  <HighlightCard key={h.id} h={h} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Page>
  )
}
