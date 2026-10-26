import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Images, LayoutGrid, Lock, Plus, Rows3, Search, UserRound, X } from 'lucide-react'
import { Button, Card, Chip, Input, NavSquare, Page, PageHeader, Segmented, EmptyState, LoadingState } from '@/components/ui'
import { db } from '@/db/db'
import { useObjectUrl } from '@/db/photos'
import type { Photo } from '@/db/types'
import { formatDate, isISODate, monthEnd, monthStart, relativeDayLabel } from '@/lib/dates'
import { matchesQuery } from '@/lib/text'
import { openDialog } from '@/stores/ui'
import { useSettings } from '@/stores/settings'
import { PhotoViewer } from '@/features/photos/PhotoViewer'

const PAGE_SIZE = 60

function Thumb({ photo, onOpen }: { photo: Photo; onOpen: () => void }) {
  const url = useObjectUrl(photo.thumb)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${photo.caption || 'Photo'}, ${formatDate(photo.date, 'd MMM yyyy')}`}
      className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-surface-2 focus-visible:outline-offset-1"
    >
      {url && (
        <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" />
      )}
      {photo.isSelfie && (
        <span className="absolute top-1.5 left-1.5 grid h-6 w-6 place-items-center rounded-lg bg-accent text-on-accent" title="Selfie">
          <UserRound size={13} aria-hidden />
        </span>
      )}
    </button>
  )
}

export default function PhotosPage() {
  const settings = useSettings()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<'grid' | 'timeline'>('grid')
  const [selfiesOnly, setSelfiesOnly] = useState(false)
  const [month, setMonth] = useState('')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)

  const dayFilter = isISODate(params.get('d')) ? params.get('d')! : null
  const openId = params.get('open')

  const result = useLiveQuery(async () => {
    let coll
    if (dayFilter) coll = db.photos.where('date').equals(dayFilter)
    else if (/^\d{4}-\d{2}$/.test(month)) coll = db.photos.where('date').between(monthStart(month), monthEnd(month), true, true)
    else coll = db.photos.orderBy('date')
    coll = coll.reverse()
    const q = query.trim()
    if (selfiesOnly || q) {
      coll = coll.filter((p) => (!selfiesOnly || p.isSelfie) && (!q || matchesQuery(`${p.caption ?? ''} ${p.tags.join(' ')}`, q)))
    }
    const total = await coll.clone().count()
    const items = await coll.limit(limit).toArray()
    // Newest first within a day as well.
    items.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    return { items, total }
  }, [dayFilter, month, selfiesOnly, query, limit])

  const items = result?.items ?? []
  const ids = useMemo(() => items.map((p) => p.id), [items])

  const groups = useMemo(() => {
    const map = new Map<string, Photo[]>()
    for (const p of items) {
      const arr = map.get(p.date) ?? []
      arr.push(p)
      map.set(p.date, arr)
    }
    return [...map.entries()]
  }, [items])

  // Viewer: opened via ?open=ID so links from other screens work.
  const viewerIds = openId ? (ids.includes(openId) ? ids : [openId]) : []
  const viewerIndex = openId ? Math.max(0, viewerIds.indexOf(openId)) : 0
  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params)
    if (id) next.set('open', id)
    else next.delete('open')
    setParams(next, { replace: !!id && !!openId })
  }

  const filtered = !!(dayFilter || month || selfiesOnly || query.trim())

  return (
    <Page>
      <PageHeader
        title="Photos"
        back="/more"
        subtitle={result ? `${result.total} photo${result.total === 1 ? "" : "s"}` : undefined}
        actions={<NavSquare icon={Plus} label="Add photo" onClick={() => openDialog({ kind: 'photo', date: dayFilter ?? undefined })} />}
      >
        <div className="mt-3 flex flex-col gap-2.5">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setLimit(PAGE_SIZE)
              }}
              placeholder="Search captions and tags"
              aria-label="Search photos"
              className="h-10 pl-10"
            />
          </div>
          <Segmented
            label="Layout"
            className="w-full"
            value={view}
            onChange={setView}
            options={[
              { value: 'grid', label: 'Grid', icon: <LayoutGrid size={14} aria-hidden /> },
              { value: 'timeline', label: 'Timeline', icon: <Rows3 size={14} aria-hidden /> },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Chip active={!selfiesOnly} onClick={() => setSelfiesOnly(false)}>
              All
            </Chip>
            <Chip active={selfiesOnly} onClick={() => setSelfiesOnly(true)}>
              Selfies
            </Chip>
            {!dayFilter && (
              <label className="ml-auto flex items-center gap-1 text-xs text-muted">
                <span className="sr-only">Month</span>
                <input
                  type="month"
                  value={month}
                  onChange={(e) => {
                    setMonth(e.target.value)
                    setLimit(PAGE_SIZE)
                  }}
                  className="h-8 w-[9.5rem] rounded-full border border-line bg-surface px-3 text-[13px] text-text"
                />
                {month && (
                  <button type="button" aria-label="Clear month filter" onClick={() => setMonth('')} className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface-2 hover:text-text">
                    <X size={14} />
                  </button>
                )}
              </label>
            )}
            {dayFilter && (
              <Chip active onClick={() => setParams({})}>
                {relativeDayLabel(dayFilter, settings.dateFormat)} <X size={12} aria-label="Clear date filter" />
              </Chip>
            )}
          </div>
        </div>
      </PageHeader>

      {result === undefined ? (
        <LoadingState />
      ) : items.length === 0 ? (
        filtered ? (
          <EmptyState icon={Search} title="No matching photos" description="Try a different filter or search." className="mt-4" />
        ) : (
          <EmptyState
            icon={Images}
            title="No photos yet"
            description="Add a daily selfie or attach photos to any day to build your photo diary."
            action={
              <Button variant="primary" icon={Plus} onClick={() => openDialog({ kind: 'photo' })}>
                Add photo
              </Button>
            }
            className="mt-4"
          />
        )
      ) : view === 'grid' ? (
        <div className="mt-1 grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5">
          {items.map((p) => (
            <Thumb key={p.id} photo={p} onOpen={() => setOpen(p.id)} />
          ))}
        </div>
      ) : (
        <div className="mt-1 flex flex-col gap-3">
          {groups.map(([date, photos]) => (
            <Card key={date} className="p-3">
              <section aria-label={formatDate(date, 'EEEE, d MMMM yyyy')}>
                <h2 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold">
                  <span>{relativeDayLabel(date, 'EEEE, d MMM yyyy')}</span>
                  <span className="text-xs font-normal text-faint">{photos.length}</span>
                  <Link to={`/?d=${date}`} className="ml-auto text-[13px] font-semibold text-accent hover:underline">
                    Open day
                  </Link>
                </h2>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                  {photos.map((p) => (
                    <Thumb key={p.id} photo={p} onOpen={() => setOpen(p.id)} />
                  ))}
                </div>
              </section>
            </Card>
          ))}
        </div>
      )}

      {result && result.total > items.length && (
        <div className="mt-5 flex justify-center">
          <Button onClick={() => setLimit((l) => l + PAGE_SIZE)}>
            Load more ({result.total - items.length} left)
          </Button>
        </div>
      )}

      {items.length > 0 && (
        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-faint">
          <Lock size={12} aria-hidden /> Private: photos never leave this device.
        </p>
      )}

      {openId && viewerIds.length > 0 && (
        <PhotoViewer ids={viewerIds} index={viewerIndex} onIndexChange={(i) => setOpen(viewerIds[i] ?? null)} onClose={() => setOpen(null)} />
      )}
    </Page>
  )
}
