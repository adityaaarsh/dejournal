import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { List, Map as MapIcon, MapPin, Plus, ShieldCheck, Trash } from 'lucide-react'
import { Button, Card, IconTile, LoadingState, NavSquare, Notice, Page, PageHeader, RECORD_TONE, Segmented, EmptyState } from '@/components/ui'
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
  const sub = [place.address, place.note].filter(Boolean).join(' · ')
  return (
    <li className="border-t border-line first:border-t-0">
      <button type="button" onClick={onOpen} className="flex min-h-[56px] w-full items-center gap-3 rounded-xl py-2 text-left transition-colors hover:bg-surface-2/60">
        <span className="w-[60px] shrink-0 text-xs font-semibold whitespace-nowrap text-muted tabular-nums">{place.time ? formatTime(place.time) : "—"}</span>
        {thumb ? (
          <img src={thumb} alt="" className="h-[34px] w-[34px] shrink-0 rounded-xl object-cover" />
        ) : (
          <IconTile icon={MapPin} tone={RECORD_TONE.place} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{place.name}</span>
          {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
          {place.lat == null && <span className="block text-[11px] text-faint">No coordinates · not on the map</span>}
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
    () => (places ?? []).slice().sort((a, b) => b.date.localeCompare(a.date) || (a.time ?? '').localeCompare(b.time ?? '')),
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
        actions={<NavSquare icon={Plus} label="Add place" onClick={() => setEditing('new')} />}
      >
        {sorted.length > 0 && (
          <div className="mt-3">
            <Segmented
              label="Places view"
              className="w-full"
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
          className="mb-3"
          action={
            <Button size="sm" onClick={() => kvSet(INTRO_KEY, true)}>
              Got it
            </Button>
          }
        >
          You add places by hand; they stay on this device. DeJournal never tracks your location in the background. “Use my current
          location” asks each time and only works when location is enabled in{' '}
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
            <Suspense fallback={<Card className="h-[420px]"><LoadingState label="Loading map…" /></Card>}>
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
        <div className="flex flex-col gap-3">
          {groups.map(([date, list]) => (
            <Card key={date} className="px-3 pt-1.5 pb-1">
              <section aria-label={relativeDayLabel(date, 'EEEE, d MMM yyyy')}>
                <div className="flex h-9 items-center gap-2">
                  <h2 className="text-[13px] font-semibold">{relativeDayLabel(date, 'EEEE, d MMM yyyy')}</h2>
                  <Link to={`/?d=${date}`} className="ml-auto text-[13px] font-semibold text-accent hover:underline">
                    Open day
                  </Link>
                </div>
                <ul>
                  {list.map((p) => (
                    <PlaceRow key={p.id} place={p} onOpen={() => setEditing(p)} />
                  ))}
                </ul>
              </section>
            </Card>
          ))}
        </div>
      )}

      {sorted.length > 0 && (
        <div className="mt-6 flex justify-center">
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
