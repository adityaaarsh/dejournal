/**
 * Google Calendar — read-only import via Google Identity Services (OAuth 2
 * token client) and the official Calendar API v3.
 *
 * - Requires VITE_GOOGLE_CLIENT_ID (an OAuth "Web application" client ID; it is
 *   not a secret). Without it the UI shows a setup state and nothing is fetched.
 * - Scope: calendar.events.readonly. DeJournal never writes to Google Calendar.
 * - The access token is kept in memory only (never persisted), so after a
 *   reload the user must press "Connect" again to sync.
 *
 * NOTE: this code path has not been tested against a live Google account,
 * because no OAuth credentials were available while building it.
 */
import { db } from '@/db/db'
import type { IntegrationConnection } from '@/db/types'
import type { IcsEvent } from '@/lib/ics'
import { addDays, isoToLocalDate, isoToLocalTime, today } from '@/lib/dates'
import { nowISO } from '@/lib/id'
import { replaceConnectionEvents } from './events'

export const GOOGLE_CONNECTION_ID = 'google-primary'
const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly'
const GSI_SRC = 'https://accounts.google.com/gsi/client'

export function googleClientId(): string | undefined {
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
  return id && id.trim() ? id.trim() : undefined
}

/* Minimal typings for the parts of GIS we use. */
interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}
interface TokenClient {
  requestAccessToken: (opts?: { prompt?: string }) => void
}
interface GoogleOAuth2 {
  initTokenClient: (cfg: {
    client_id: string
    scope: string
    callback: (r: TokenResponse) => void
    error_callback?: (e: { type: string; message?: string }) => void
  }) => TokenClient
  revoke: (token: string, done?: () => void) => void
}
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } }
  }
}

let token: { value: string; expiresAt: number } | null = null
let gsiPromise: Promise<GoogleOAuth2> | null = null

function loadGsi(): Promise<GoogleOAuth2> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2)
  if (gsiPromise) return gsiPromise
  gsiPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = GSI_SRC
    s.async = true
    s.onload = () => (window.google?.accounts?.oauth2 ? resolve(window.google.accounts.oauth2) : reject(new Error('Google sign-in failed to load.')))
    s.onerror = () => {
      gsiPromise = null
      reject(new Error('Could not reach Google. Check your connection.'))
    }
    document.head.appendChild(s)
  })
  return gsiPromise
}

export function hasGoogleToken(): boolean {
  return !!token && token.expiresAt > Date.now() + 30_000
}

/** Ask the user to authorize read-only calendar access (opens Google's popup). */
export async function requestGoogleToken(): Promise<string> {
  const clientId = googleClientId()
  if (!clientId) throw new Error('Google Calendar is not configured (VITE_GOOGLE_CLIENT_ID is missing).')
  const oauth2 = await loadGsi()
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) {
          reject(new Error(r.error_description || r.error || 'Authorization was not granted.'))
          return
        }
        token = { value: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 }
        resolve(r.access_token)
      },
      error_callback: (e) => reject(new Error(e.message || (e.type === 'popup_closed' ? 'The Google window was closed.' : 'Authorization failed.'))),
    })
    client.requestAccessToken({ prompt: hasGoogleToken() ? '' : 'consent' })
  })
}

interface GEvent {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
}

/** Pure: map a Google Calendar API event to our import shape. */
export function mapGoogleEvent(e: GEvent): IcsEvent | null {
  if (e.status === 'cancelled' || !e.start) return null
  const title = e.summary?.trim() || '(No title)'
  if (e.start.date) {
    // All-day: end.date is exclusive.
    const endExcl = e.end?.date
    const last = endExcl ? addDays(endExcl, -1) : e.start.date
    return {
      uid: e.id,
      externalId: e.id,
      title,
      description: e.description,
      location: e.location,
      date: e.start.date,
      endDate: last > e.start.date ? last : null,
      allDay: true,
      startTime: null,
      endTime: null,
    }
  }
  if (!e.start.dateTime) return null
  const date = isoToLocalDate(e.start.dateTime)
  const endDate = e.end?.dateTime ? isoToLocalDate(e.end.dateTime) : date
  return {
    uid: e.id,
    externalId: e.id,
    title,
    description: e.description,
    location: e.location,
    date,
    endDate: endDate > date ? endDate : null,
    allDay: false,
    startTime: isoToLocalTime(e.start.dateTime),
    endTime: e.end?.dateTime ? isoToLocalTime(e.end.dateTime) : null,
  }
}

async function ensureConnection(): Promise<IntegrationConnection> {
  const existing = await db.integrations.get(GOOGLE_CONNECTION_ID)
  if (existing) return existing
  const now = nowISO()
  const c: IntegrationConnection = {
    id: GOOGLE_CONNECTION_ID,
    kind: 'google',
    name: 'Google Calendar',
    status: 'connected',
    lastSyncAt: null,
    lastError: null,
    meta: { calendarId: 'primary' },
    createdAt: now,
    updatedAt: now,
  }
  await db.integrations.add(c)
  return c
}

/** Fetch primary-calendar events from −30 to +90 days and store them read-only. */
export async function syncGoogleCalendar(): Promise<{ total: number }> {
  if (!hasGoogleToken()) await requestGoogleToken()
  const connection = await ensureConnection()
  const timeMin = new Date(Date.now() - 30 * 86400_000).toISOString()
  const timeMax = new Date(Date.now() + 90 * 86400_000).toISOString()
  const all: IcsEvent[] = []
  let pageToken: string | undefined
  let pages = 0
  try {
    do {
      const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
      url.searchParams.set('singleEvents', 'true')
      url.searchParams.set('orderBy', 'startTime')
      url.searchParams.set('timeMin', timeMin)
      url.searchParams.set('timeMax', timeMax)
      url.searchParams.set('maxResults', '250')
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token!.value}` } })
      if (res.status === 401 || res.status === 403) {
        token = null
        const msg = res.status === 401 ? 'Access expired or was revoked. Connect again.' : 'Google denied access to the calendar.'
        await db.integrations.update(connection.id, { status: res.status === 401 ? 'revoked' : 'error', lastError: msg, updatedAt: nowISO() })
        throw new Error(msg)
      }
      if (!res.ok) throw new Error(`Google Calendar returned ${res.status}.`)
      const body = (await res.json()) as { items?: GEvent[]; nextPageToken?: string }
      for (const item of body.items ?? []) {
        const m = mapGoogleEvent(item)
        if (m) all.push(m)
      }
      pageToken = body.nextPageToken
    } while (pageToken && ++pages < 10)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Sync failed.'
    const cur = await db.integrations.get(connection.id)
    if (cur && cur.status === 'connected') await db.integrations.update(connection.id, { status: 'error', lastError: msg, updatedAt: nowISO() })
    throw e
  }
  await replaceConnectionEvents(connection, all, 'google')
  await db.integrations.update(connection.id, {
    status: 'connected',
    lastError: null,
    lastSyncAt: nowISO(),
    meta: { calendarId: 'primary', eventCount: all.length, window: `${addDays(today(), -30)}..${addDays(today(), 90)}` },
    updatedAt: nowISO(),
  })
  return { total: all.length }
}

/** Revoke the token (if any) and delete imported Google events. */
export async function disconnectGoogle(): Promise<void> {
  const t = token?.value
  token = null
  if (t && window.google?.accounts?.oauth2) {
    await new Promise<void>((r) => window.google!.accounts!.oauth2!.revoke(t, () => r()))
  }
  await db.transaction('rw', db.events, db.integrations, async () => {
    const ids = await db.events.where('connectionId').equals(GOOGLE_CONNECTION_ID).primaryKeys()
    await db.events.bulkDelete(ids)
    await db.integrations.delete(GOOGLE_CONNECTION_ID)
  })
}
