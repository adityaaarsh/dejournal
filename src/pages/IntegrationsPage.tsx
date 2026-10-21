import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bot, CalendarDays, ChevronRight, FileUp, Map, RefreshCw, Trash2, TriangleAlert, Unplug } from 'lucide-react'
import { db } from '@/db/db'
import type { IntegrationConnection } from '@/db/types'
import { Button, Card, Chip, Notice, Page, PageHeader } from '@/components/ui'
import { confirmDialog, toast } from '@/stores/ui'
import { useSettings } from '@/stores/settings'
import { importIcsText, removeConnection } from '@/features/calendar/events'
import { disconnectGoogle, GOOGLE_CONNECTION_ID, googleClientId, hasGoogleToken, syncGoogleCalendar } from '@/features/calendar/google'
import { isNativeApp } from '@/platform/native'

const MAX_ICS_BYTES = 10 * 1024 * 1024

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 px-1 text-xs font-semibold tracking-wider text-faint uppercase">{children}</h2>
}

function syncedLabel(c: IntegrationConnection): string {
  if (!c.lastSyncAt) return 'Never synced'
  return `Synced ${new Date(c.lastSyncAt).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`
}

function StatusChip({ c }: { c: IntegrationConnection }) {
  if (c.status === 'connected') return <Chip tone="success">Connected</Chip>
  if (c.status === 'revoked') return <Chip tone="warn">Access expired</Chip>
  return <Chip tone="danger">Error</Chip>
}

/* ------------------------------------------------------------------ */
/* .ics import                                                         */
/* ------------------------------------------------------------------ */

function IcsSection({ connections, counts }: { connections: IntegrationConnection[]; counts: Record<string, number> }) {
  const input = useRef<HTMLInputElement>(null)
  const [target, setTarget] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  const pick = (connectionId?: string) => {
    setTarget(connectionId)
    input.current?.click()
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_ICS_BYTES) {
      toast('That file is larger than 10 MB.', { tone: 'error' })
      return
    }
    setBusy(true)
    try {
      const text = await file.text()
      const res = await importIcsText(text, file.name, target)
      if (res.total === 0) toast('No events found in that file.', { tone: 'error' })
      else
        toast(
          target
            ? `Calendar refreshed: ${res.added} new, ${res.updated} updated, ${res.removed} removed`
            : `Imported ${res.total} event${res.total === 1 ? '' : 's'} from ${res.connection.name}`,
          { tone: 'success' },
        )
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not read that calendar file.', { tone: 'error', duration: 6000 })
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
          <FileUp size={19} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-medium">Import a calendar file (.ics)</h3>
          <p className="mt-0.5 text-[13px] text-muted">
            Export a calendar from Google, Outlook or Apple Calendar as .ics and import it here. Events are stored only on this device and stay
            read-only. Repeating events are expanded one year back and one year ahead.
          </p>
        </div>
      </div>
      <input ref={input} type="file" accept=".ics,text/calendar" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onFile(e.target.files?.[0])} />
      <div className="mt-3">
        <Button variant="secondary" icon={FileUp} loading={busy} onClick={() => pick(undefined)}>
          Choose .ics file
        </Button>
      </div>

      {connections.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {connections.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px]">{c.name}</p>
                <p className="text-xs text-muted">
                  {counts[c.id] ?? 0} event{counts[c.id] === 1 ? '' : 's'} · {syncedLabel(c)}
                </p>
              </div>
              <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => pick(c.id)} disabled={busy} aria-label={`Re-import ${c.name}`}>
                Re-import
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={Trash2}
                aria-label={`Remove ${c.name}`}
                onClick={() =>
                  confirmDialog({
                    title: `Remove “${c.name}”?`,
                    message: `This deletes the ${counts[c.id] ?? 0} imported events from DeJournal. Your original calendar isn’t affected.`,
                    confirmLabel: 'Remove',
                    destructive: true,
                    onConfirm: async () => {
                      const n = await removeConnection(c.id)
                      toast(`Removed ${n} imported event${n === 1 ? '' : 's'}`)
                    },
                  })
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Google Calendar                                                     */
/* ------------------------------------------------------------------ */

function GoogleSection({ connection, count }: { connection?: IntegrationConnection; count: number }) {
  const clientId = googleClientId()
  const [busy, setBusy] = useState(false)
  const [, force] = useState(0)

  const sync = async () => {
    setBusy(true)
    try {
      const { total } = await syncGoogleCalendar()
      toast(`Synced ${total} event${total === 1 ? '' : 's'} from Google Calendar`, { tone: 'success' })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Google Calendar sync failed.', { tone: 'error', duration: 6000 })
    } finally {
      setBusy(false)
      force((n) => n + 1)
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
          <CalendarDays size={19} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-medium">Google Calendar</h3>
            {connection ? <StatusChip c={connection} /> : !clientId ? <Chip>Setup required</Chip> : null}
          </div>
          <p className="mt-0.5 text-[13px] text-muted">Read-only. DeJournal shows your Google events from the last 30 days to the next 90 and never changes them.</p>
        </div>
      </div>

      {isNativeApp() ? (
        <Notice className="mt-3" title="Not available in the Android app" icon={TriangleAlert}>
          Google doesn’t allow its sign-in page inside apps like this one. To bring in your Google events, export your calendar as an .ics file from
          Google Calendar on the web and import it above.
        </Notice>
      ) : !clientId ? (
        <Notice className="mt-3" title="Setup required" icon={TriangleAlert}>
          <p>Google sign-in needs an OAuth client ID that hasn’t been configured for this copy of DeJournal:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>In Google Cloud Console, enable the Google Calendar API.</li>
            <li>Create an OAuth client ID of type “Web application”.</li>
            <li>
              Add this site’s address (<code className="text-text">{window.location.origin}</code>) as an authorized JavaScript origin.
            </li>
            <li>
              Put <code className="text-text">VITE_GOOGLE_CLIENT_ID=…</code> in <code className="text-text">.env.local</code> and restart or rebuild the app.
            </li>
          </ol>
          <p className="mt-2">Until then, you can import an .ics export of your Google calendar above.</p>
        </Notice>
      ) : (
        <>
          {connection && (
            <p className="mt-3 text-xs text-muted">
              {count} event{count === 1 ? '' : 's'} · {syncedLabel(connection)}
              {connection.lastError && <span className="block text-danger">{connection.lastError}</span>}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant={connection ? 'secondary' : 'primary'} icon={RefreshCw} loading={busy} onClick={sync}>
              {connection ? (hasGoogleToken() ? 'Sync now' : 'Reconnect & sync') : 'Connect Google Calendar'}
            </Button>
            {connection && (
              <Button
                variant="ghost"
                icon={Unplug}
                onClick={() =>
                  confirmDialog({
                    title: 'Disconnect Google Calendar?',
                    message: 'Imported Google events will be removed from DeJournal and access will be revoked. Your Google Calendar is not changed.',
                    confirmLabel: 'Disconnect',
                    destructive: true,
                    onConfirm: async () => {
                      await disconnectGoogle()
                      toast('Google Calendar disconnected')
                      force((n) => n + 1)
                    },
                  })
                }
              >
                Disconnect
              </Button>
            )}
          </div>
          <p className="mt-3 text-xs text-faint">
            For privacy, the access token is kept in memory only, so you’ll be asked to reconnect after reloading the app. Synced events stay saved.
            This integration hasn’t been tested against a live Google account yet.
          </p>
        </>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ */

function LinkCard({ to, icon: Icon, title, description, status }: { to: string; icon: typeof Bot; title: string; description: string; status?: ReactNode }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 transition-colors hover:bg-surface-2">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
        <Icon size={19} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
          {title}
          {status}
        </span>
        <span className="block text-[13px] text-muted">{description}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-faint" aria-hidden />
    </Link>
  )
}

export default function IntegrationsPage() {
  const settings = useSettings()
  const connections = useLiveQuery(() => db.integrations.toArray(), [])
  const counts = useLiveQuery(async () => {
    const out: Record<string, number> = {}
    const evs = await db.events.where('source').anyOf('ics', 'google').toArray()
    for (const e of evs) if (e.connectionId) out[e.connectionId] = (out[e.connectionId] ?? 0) + 1
    return out
  }, [])

  const ics = (connections ?? []).filter((c) => c.kind === 'ics')
  const google = connections?.find((c) => c.id === GOOGLE_CONNECTION_ID)

  return (
    <Page>
      <PageHeader title="Integrations" back="/more" subtitle="Optional connections. DeJournal works fully without them." />
      <div className="flex flex-col gap-6">
        <section>
          <SectionTitle>Calendars</SectionTitle>
          <div className="flex flex-col gap-3">
            <IcsSection connections={ics} counts={counts ?? {}} />
            <GoogleSection connection={google} count={google ? (counts?.[google.id] ?? 0) : 0} />
          </div>
        </section>

        <section>
          <SectionTitle>Assistant</SectionTitle>
          <LinkCard
            to="/settings#ai"
            icon={Bot}
            title="AI assistant"
            description="Optional summaries and reflections. Configure provider and consent in Settings."
            status={<Chip tone={settings.aiEnabled ? 'success' : 'default'}>{settings.aiEnabled ? 'On' : 'Off'}</Chip>}
          />
        </section>

        <section>
          <SectionTitle>Maps</SectionTitle>
          <LinkCard
            to="/places"
            icon={Map}
            title="Places & map"
            description="Save places you visit and see them on an OpenStreetMap map. Location access is optional."
            status={<Chip tone={settings.locationEnabled ? 'success' : 'default'}>{settings.locationEnabled ? 'Location on' : 'Manual only'}</Chip>}
          />
        </section>
      </div>
    </Page>
  )
}
