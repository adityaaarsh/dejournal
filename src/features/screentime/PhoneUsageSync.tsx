import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Smartphone } from 'lucide-react'
import { db } from '@/db/db'
import { addDays, today } from '@/lib/dates'
import { nowISO, uid } from '@/lib/id'
import { Button, Card, IconTile, Notice } from '@/components/ui'
import { onNativeEvent, openUsageAccessSettings, readNativeScreenTimeDetail, usageAccessGranted } from '@/platform/native'
import { toast } from '@/stores/ui'

/** Android keeps detailed usage events for roughly a week. */
const SYNC_DAYS = 7

/**
 * Import the last week of screen time from Android's usage stats. Days you
 * logged by hand are never overwritten; imported days are refreshed.
 */
export async function syncPhoneScreenTime(): Promise<number> {
  const end = today()
  const start = addDays(end, -(SYNC_DAYS - 1))
  const byDate = readNativeScreenTimeDetail(start, end)
  let changed = 0
  await db.transaction('rw', db.screenTime, async () => {
    for (const [date, day] of Object.entries(byDate)) {
      const minutes = day?.total
      if (!Number.isFinite(minutes) || minutes < 0) continue
      const existing = await db.screenTime.where('date').equals(date).first()
      if (existing?.source === 'manual') continue
      const rounded = Math.round(minutes)
      const breakdown = day.breakdown && Object.keys(day.breakdown).length ? day.breakdown : null
      if (existing) {
        if (existing.minutes !== rounded || JSON.stringify(existing.breakdown ?? null) !== JSON.stringify(breakdown)) {
          await db.screenTime.update(existing.id, { minutes: rounded, breakdown, updatedAt: nowISO() })
          changed++
        }
      } else if (rounded > 0) {
        const now = nowISO()
        await db.screenTime.add({ id: uid(), date, minutes: rounded, breakdown, source: 'import', createdAt: now, updatedAt: now })
        changed++
      }
    }
  })
  return changed
}

/** Card shown on the Screen time page inside the Android app. */
export function PhoneUsageSync() {
  const [granted, setGranted] = useState(() => usageAccessGranted())
  const [syncedAt, setSyncedAt] = useState<Date | null>(null)
  const [busy, setBusy] = useState(false)

  const sync = useCallback(async (manual: boolean) => {
    if (!usageAccessGranted()) return
    setBusy(true)
    try {
      const n = await syncPhoneScreenTime()
      setSyncedAt(new Date())
      if (manual) toast(n ? `Updated ${n} day${n === 1 ? '' : 's'} from your phone` : 'Already up to date', { tone: 'success' })
    } catch (e) {
      console.error(e)
      toast('Could not read screen time from your phone.', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (granted) sync(false)
    return onNativeEvent((e) => {
      if (e.type !== 'resume') return
      const g = usageAccessGranted()
      setGranted(g)
      if (g) sync(false)
    })
  }, [granted, sync])

  if (!granted)
    return (
      <Notice
        icon={Smartphone}
        title="Track screen time automatically"
        action={
          <Button size="sm" variant="primary" onClick={openUsageAccessSettings}>
            Allow usage access
          </Button>
        }
      >
        DeJournal can read how long you used your phone each day from Android’s usage stats. In the screen that opens, find DeJournal and turn on
        “Permit usage access”. The data stays on this phone. You can still log time by hand without it.
      </Notice>
    )

  return (
    <Card className="flex items-center gap-3 px-3 py-2.5">
      <IconTile icon={Smartphone} tone="accent" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold">Synced from your phone</p>
        <p className="text-xs text-muted">
          Last {SYNC_DAYS} days of app use{syncedAt ? ` · updated ${syncedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}. Days you log by hand are kept as you entered them.
        </p>
      </div>
      <Button size="sm" variant="ghost" icon={RefreshCw} loading={busy} onClick={() => sync(true)}>
        Sync
      </Button>
    </Card>
  )
}
