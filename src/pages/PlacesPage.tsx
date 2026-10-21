import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { List, Map as MapIcon, MapPin, Plus, ShieldCheck, Trash } from 'lucide-react'
import { Button, IconButton, LoadingState, Notice, Page, PageHeader, Segmented, EmptyState } from '@/components/ui'
import { db } from '@/db/db'
import { usePhotoUrl } from '@/db/photos'
import { kvSet } from '@/db/repo'
import type { SavedPlace } from '@/db/types'
import { formatTime, relativeDayLabel } from '@/lib/dates'
import { plural } from '@/lib/text'
import { useSettings } from '@/stores/settings'
import { confirmDialog, toast } from '@/stores/ui'
import { PlaceSheet } from '@/features/places/PlaceSheet'

const PlacesMap = lazy(() => import('@/features/places/PlacesMap'))
const INTRO_KEY = 'placesIntroDismissed'

function PlaceRow({ place, onOpen }: { place: SavedPlace; onOpen: () => void }) {
  const thumb = usePhotoUrl(place.photoId)
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2">
        {thumb ? (
          <img src={thumb} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
            <MapPin size={18} aria-hidden />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-[15px] font-medium">{place.name}</span>
            {place.time && <span className="shrink-0 text-xs text-faint">{formatTime(place.time)}</span>}
          </span>
          {place.address && <span className="block truncate text-[13px] text-muted">{place.address}</span>}
          {place.note && <span className="mt-0.5 line-clamp-2 block text-[13px] text-muted">{place.note}</span>}
          {place.lat == null && <span className="mt-0.5 block text-[11px] text-faint">No coordinates · not shown on map</span>}
        </span>
      </button>
    </li>
  )
}

export default function PlacesPage() {
  const settings = useSettings()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<'list' | 'map'>('list')
  const [editing, setEditing] = useState<SavedPlace | 'new' | null>(null)
  const places = useLiveQuery(() => db.places.orderBy('date').reverse().toArray(), [])
  const introDismissed = useLiveQuery(async () => ((await db.kv.get(INTRO_KEY))?.value as boolean | undefined) ?? false, [])

  // ?open=ID (from search) opens that place.
  const openId = params.get('open')
  const opened = openId ? places?.find((p) => p.id === openId) : undefined

  const sorted = useMemo(
    () => (places ?? []).slice().sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? '')),
    [places],
  )
  const groups = useMemo(() => {
    const map = new Map<string, SavedPlace[]>()
    for (const p of sorted) map.set(p.date, [...(map.get(p.date) ?? []), p])
    return [...map.entries()]
  }, [sorted])
  const mapped = sorted.filter((p) => p.lat != null && p.lng != null)

  const closeSheet = () => {
    setEditing(null)
    if (openId) setParams({}, { replace: true })
  }

  const deleteAll = () =>
    confirmDialog({
      title: 'Delete all location history?',
      message: `This permanently deletes ${plural(places?.length ?? 0, 'saved place')}. Photos attached to them are kept. This cannot be undone.`,
      confirmLabel: 'Delete all',
      destructive: true,
      onConfirm: async () => {
        await db.places.clear()
        toast('Location history deleted')
      },
    })

  return (
    <Page>
      <PageHeader
        title="Places"
        subtitle="Optional · stored only on this device"
        back="/more"
        actions={<IconButton icon={Plus} label="Add place" variant="primary" onClick={() => setEditing('new')} />}
      >
        {sorted.length > 0 && (
          <div className="mt-3">
            <Segmented
              label="Places view"
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: 'list', label: 'Timeline', icon: <List size={14} aria-hidden /> },
                { value: 'map', label: 'Map', icon: <MapIcon size={14} aria-hidden /> },
              ]}
            />
          </div>
        )}
      </PageHeader>

      {introDismissed === false && (
        <Notice
          icon={ShieldCheck}
          title="How Places works"
          className="mb-4"
          action={
            <Button size="sm" onClick={() => kvSet(INTRO_KEY, true)}>
              Got it
            </Button>
          }
        >
          You add places by hand. Each entry stores a name, date, optional address, note, photo and coordinates — only in this
          browser. DeJournal never tracks your location in the background. "Use my current location" asks for permission each time
          and only works when location is enabled in{' '}
          <Link to="/settings#privacy" className="text-accent hover:underline">
            Settings
          </Link>
          .
        </Notice>
      )}

      {places === undefined ? (
        <LoadingState />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No places yet"
          description="Save places you visit and link them to your days."
          action={
            <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
              Add place
            </Button>
          }
        />
      ) : view === 'map' ? (
        settings.mapTilesEnabled ? (
          <div className="flex flex-col gap-2">
            <Suspense fallback={<LoadingState label="Loading map…" />}>
              <PlacesMap places={mapped} onSelect={(p) => setEditing(p)} />
            </Suspense>
            <p className="text-xs text-faint">
              {mapped.length === 0
                ? 'None of your places have coordinates yet.'
                : `${plural(mapped.length, 'place')} on the map.`}{' '}
              Map tiles are loaded from tile.openstreetmap.org, which can see the area you view.
            </p>
          </div>
        ) : (
          <Notice icon={MapIcon} title="Map tiles are turned off">
            Showing a map downloads tiles from tile.openstreetmap.org, which can see the area being viewed. Turn on "Map tiles" in{' '}
            <Link to="/settings#privacy" className="text-accent hover:underline">
              Settings → Privacy
            </Link>{' '}
            to use the map. Your saved places are still available in the timeline.
          </Notice>
        )
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(([date, list]) => (
            <section key={date}>
              <h2 className="mb-2 flex items-baseline justify-between px-1 text-[13px] font-medium text-muted">
                {relativeDayLabel(date, 'EEEE, d MMM yyyy')}
                <Link to={`/?d=${date}`} className="text-xs text-accent hover:underline">
                  Open day
                </Link>
              </h2>
              <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
                {list.map((p) => (
                  <PlaceRow key={p.id} place={p} onOpen={() => setEditing(p)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {sorted.length > 0 && (
        <div className="mt-8 flex justify-center">
          <Button variant="ghost" icon={Trash} onClick={deleteAll} className="text-danger hover:text-danger">
            Delete all location history
          </Button>
        </div>
      )}

      {(editing || opened) && (
        <PlaceSheet place={editing && editing !== 'new' ? editing : editing === 'new' ? undefined : opened} onClose={closeSheet} />
      )}
    </Page>
  )
}
