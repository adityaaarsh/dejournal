import { db } from '@/db/db'
import type { CalendarEvent, IntegrationConnection, ISODate } from '@/db/types'
import { nowISO, uid } from '@/lib/id'
import { undoToast } from '@/stores/ui'
import { parseIcs, type IcsEvent } from '@/lib/ics'

/* ------------------------------------------------------------------ */
/* Local events                                                        */
/* ------------------------------------------------------------------ */

export interface EventInput {
  title: string
  description?: string
  location?: string
  date: ISODate
  endDate?: ISODate | null
  allDay: boolean
  startTime?: string | null
  endTime?: string | null
}

export async function createEvent(input: EventInput): Promise<CalendarEvent> {
  const now = nowISO()
  const ev: CalendarEvent = {
    id: uid(),
    ...clean(input),
    source: 'local',
    externalId: null,
    connectionId: null,
    calendarName: null,
    createdAt: now,
    updatedAt: now,
  }
  await db.events.add(ev)
  return ev
}

export async function updateEvent(id: string, input: EventInput): Promise<void> {
  await db.events.update(id, { ...clean(input), updatedAt: nowISO() })
}

function clean(input: EventInput) {
  return {
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    location: input.location?.trim() || undefined,
    date: input.date,
    endDate: input.endDate && input.endDate > input.date ? input.endDate : null,
    allDay: input.allDay,
    startTime: input.allDay ? null : input.startTime || null,
    endTime: input.allDay ? null : input.endTime || null,
  }
}

export async function deleteEvent(id: string): Promise<void> {
  const ev = await db.events.get(id)
  if (!ev || ev.source !== 'local') return
  await db.events.delete(id)
  undoToast('Event deleted', async () => {
    await db.events.put(ev)
  })
}

/** Does an event (possibly multi-day) cover `date`? */
export function eventCovers(ev: CalendarEvent, date: ISODate): boolean {
  return ev.date <= date && (ev.endDate ?? ev.date) >= date
}

/** All-day first, then by start time, then title. */
export function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return events.slice().sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
    return (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.title.localeCompare(b.title)
  })
}

export function sourceLabel(ev: CalendarEvent): string | null {
  if (ev.source === 'local') return null
  if (ev.source === 'google') return ev.calendarName || 'Google Calendar'
  return ev.calendarName || 'Imported calendar'
}

/* ------------------------------------------------------------------ */
/* Imported events (shared by .ics import and Google)                  */
/* ------------------------------------------------------------------ */

/**
 * Replace a connection's events with `incoming`, keeping ids stable for
 * events whose externalId already exists (no duplicates on re-import).
 */
export async function replaceConnectionEvents(
  connection: IntegrationConnection,
  incoming: IcsEvent[],
  source: 'ics' | 'google',
): Promise<{ added: number; updated: number; removed: number }> {
  let added = 0
  let updated = 0
  let removed = 0
  await db.transaction('rw', db.events, async () => {
    const existing = await db.events.where('connectionId').equals(connection.id).toArray()
    const byExt = new Map(existing.map((e) => [e.externalId ?? '', e]))
    const seen = new Set<string>()
    const now = nowISO()
    const rows: CalendarEvent[] = []
    for (const ie of incoming) {
      if (seen.has(ie.externalId)) continue // de-dup within the file
      seen.add(ie.externalId)
      const prev = byExt.get(ie.externalId)
      prev ? updated++ : added++
      rows.push({
        id: prev?.id ?? uid(),
        title: ie.title,
        description: ie.description,
        location: ie.location,
        date: ie.date,
        endDate: ie.endDate ?? null,
        allDay: ie.allDay,
        startTime: ie.startTime ?? null,
        endTime: ie.endTime ?? null,
        source,
        externalId: ie.externalId,
        connectionId: connection.id,
        calendarName: connection.name,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      })
    }
    const stale = existing.filter((e) => !seen.has(e.externalId ?? ''))
    removed = stale.length
    await db.events.bulkDelete(stale.map((e) => e.id))
    await db.events.bulkPut(rows)
  })
  return { added, updated, removed }
}

/** Import an .ics file. Re-importing into `connectionId` refreshes that calendar. */
export async function importIcsText(
  text: string,
  fileName: string,
  connectionId?: string,
): Promise<{ connection: IntegrationConnection; added: number; updated: number; removed: number; total: number }> {
  const parsed = parseIcs(text)
  const now = nowISO()
  let connection = connectionId ? await db.integrations.get(connectionId) : undefined
  if (!connection) {
    connection = {
      id: uid(),
      kind: 'ics',
      name: parsed.calendarName || fileName.replace(/\.ics$/i, '') || 'Imported calendar',
      status: 'connected',
      lastSyncAt: now,
      lastError: null,
      meta: {},
      createdAt: now,
      updatedAt: now,
    }
    await db.integrations.add(connection)
  }
  const res = await replaceConnectionEvents(connection, parsed.events, 'ics')
  const total = parsed.events.length
  await db.integrations.update(connection.id, {
    status: 'connected',
    lastSyncAt: now,
    lastError: null,
    meta: { ...(connection.meta ?? {}), eventCount: total, fileName, skipped: parsed.skipped },
    updatedAt: now,
  })
  return { connection, ...res, total }
}

/** Remove a connection and every event it imported. */
export async function removeConnection(id: string): Promise<number> {
  let count = 0
  await db.transaction('rw', db.events, db.integrations, async () => {
    const evs = await db.events.where('connectionId').equals(id).primaryKeys()
    count = evs.length
    await db.events.bulkDelete(evs)
    await db.integrations.delete(id)
  })
  return count
}
