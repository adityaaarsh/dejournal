import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDown, ArrowUp, Bot, Download, HardDrive, Info, RotateCcw, ShieldCheck, Trash2, Upload, Check } from 'lucide-react'
import { db } from '@/db/db'
import { kvSet } from '@/db/repo'
import {
  DEFAULT_SETTINGS,
  updateSettings,
  useSettings,
  type Accent,
  type DashboardSectionId,
  type QuickActionId,
  type Settings,
} from '@/stores/settings'
import { confirmDialog, toast } from '@/stores/ui'
import { Button, Card, Chip, Field, IconButton, Input, Notice, Page, PageHeader, Segmented, Select, Sheet, Toggle } from '@/components/ui'
import { QUICK_ACTIONS } from '@/features/quick/QuickActionSheet'
import { CURRENCIES, currencySymbol } from '@/lib/money'
import { formatDate, today } from '@/lib/dates'
import { formatDuration } from '@/lib/duration'
import { backupCounts, BackupError, deleteAllData, downloadBackup, importBackup, parseBackup, type BackupEnvelope } from '@/lib/backup'
import { getProviderForStatus } from '@/ai/provider'
import { cn, plural } from '@/lib/text'
import { version as APP_VERSION } from '../../package.json'
import { isNativeApp } from '@/platform/native'
import { usePermission } from '@/features/reminders/NotificationStatus'

const SECTION_LABELS: Record<DashboardSectionId, string> = {
  recommendation: 'Suggestion',
  rating: 'Rating & selfie',
  highlight: 'Highlight',
  tasks: 'To-do',
  agenda: 'Agenda',
  routines: 'Routines',
  study: 'Study',
  expenses: 'Expenses',
  activity: 'Recent activity',
}

const DATE_FORMATS = ['EEE, d MMM', 'EEEE, d MMMM', 'd MMM yyyy', 'EEE, MMM d', 'dd/MM/yyyy', 'MM/dd/yyyy']

const ACCENTS: Array<{ value: Accent; label: string; color: string }> = [
  { value: 'blue', label: 'Blue', color: '#5b9bff' },
  { value: 'violet', label: 'Violet', color: '#9b8cff' },
  { value: 'teal', label: 'Teal', color: '#3cc4b4' },
  { value: 'rose', label: 'Rose', color: '#f27a9b' },
]

const JUMP: Array<{ id: string; label: string }> = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'general', label: 'General' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'ai', label: 'AI' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'data', label: 'Data' },
]

function Section({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-28">
      <h2 id={`${id}-h`} className="mb-1 px-1 text-xs font-semibold tracking-wider text-faint uppercase">
        {title}
      </h2>
      {description && <p className="mb-2 px-1 text-[13px] text-muted">{description}</p>}
      <Card className="divide-y divide-line px-4">{children}</Card>
    </section>
  )
}

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('py-3', className)}>{children}</div>
}

/** Text/number input that commits on blur or Enter (avoids writing on every keystroke). */
function CommitInput({
  value,
  onCommit,
  validate,
  ...rest
}: {
  value: string
  onCommit: (v: string) => void
  validate?: (v: string) => string | null
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [draft, setDraft] = useState(value)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    const e = validate?.(draft) ?? null
    setErr(e)
    if (e) return
    if (draft !== value) onCommit(draft)
  }
  return (
    <>
      <Input
        {...rest}
        value={draft}
        aria-invalid={err ? true : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
        }}
      />
      {err && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {err}
        </p>
      )}
    </>
  )
}

const minutesValidator = (max: number) => (v: string) => {
  if (v.trim() === '') return null
  const n = Number(v)
  if (!Number.isInteger(n) || n < 0 || n > max) return `Enter whole minutes between 0 and ${max}.`
  return null
}

function MinutesField({ label, value, onCommit, max = 1440, hint }: { label: string; value: number; onCommit: (n: number) => void; max?: number; hint?: string }) {
  return (
    <Field label={label} hint={hint ?? (value ? formatDuration(value * 60) : 'No goal')}>
      {(p) => (
        <CommitInput
          {...p}
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          value={String(value)}
          validate={minutesValidator(max)}
          onCommit={(v) => onCommit(v.trim() === '' ? 0 : Number(v))}
        />
      )}
    </Field>
  )
}

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir
  if (j < 0 || j >= arr.length) return arr
  const next = arr.slice()
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/* ------------------------------------------------------------------ */

function AppearanceSection({ s }: { s: Settings }) {
  return (
    <Section id="appearance" title="Appearance">
      <Row className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[15px]">Theme</span>
        <Segmented
          label="Theme"
          size="sm"
          value={s.theme}
          onChange={(theme) => updateSettings({ theme })}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
            { value: 'system', label: 'System' },
          ]}
        />
      </Row>
      <Row className="flex flex-wrap items-center justify-between gap-3">
        <span id="accent-label" className="text-[15px]">
          Accent colour
        </span>
        <div role="radiogroup" aria-labelledby="accent-label" className="flex gap-2">
          {ACCENTS.map((a) => (
            <button
              key={a.value}
              type="button"
              role="radio"
              aria-checked={s.accent === a.value}
              aria-label={a.label}
              title={a.label}
              onClick={() => updateSettings({ accent: a.value })}
              className={cn(
                'grid h-10 w-10 place-items-center rounded-full border-2 transition-transform',
                s.accent === a.value ? 'border-text' : 'border-transparent hover:scale-105',
              )}
            >
              <span className="grid h-7 w-7 place-items-center rounded-full" style={{ background: a.color }}>
                {s.accent === a.value && <Check size={15} className="text-black/80" aria-hidden />}
              </span>
            </button>
          ))}
        </div>
      </Row>
      <Row className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-[15px]">Motion</span>
          <p className="text-xs text-faint">"System" follows your device's reduced-motion setting.</p>
        </div>
        <Segmented
          label="Motion"
          size="sm"
          value={s.motion}
          onChange={(motion) => updateSettings({ motion })}
          options={[
            { value: 'system', label: 'System' },
            { value: 'reduced', label: 'Reduced' },
            { value: 'full', label: 'Full' },
          ]}
        />
      </Row>
    </Section>
  )
}

function GeneralSection({ s }: { s: Settings }) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  return (
    <Section id="general" title="General">
      <Row>
        <Field label="Date format" hint={`Preview: ${formatDate(today(), s.dateFormat)}`}>
          {(p) => (
            <Select {...p} value={s.dateFormat} onChange={(e) => updateSettings({ dateFormat: e.target.value })}>
              {DATE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {formatDate(today(), f)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </Row>
      <Row className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[15px]">First day of the week</span>
        <Segmented
          label="First day of the week"
          size="sm"
          value={String(s.weekStartsOn) as '0' | '1'}
          onChange={(v) => updateSettings({ weekStartsOn: v === '0' ? 0 : 1 })}
          options={[
            { value: '1', label: 'Monday' },
            { value: '0', label: 'Sunday' },
          ]}
        />
      </Row>
      <Row>
        <p className="text-[15px]">Time zone</p>
        <p className="mt-0.5 text-[13px] text-muted">
          {tz}. Entries are saved under your local calendar date, so travelling or changing time zones never moves them to a different day. Times are
          shown in your device's current time zone.
        </p>
      </Row>
      <Row>
        <Field label="Default currency" hint="Used for new expenses and totals. Existing expenses keep their own currency.">
          {(p) => (
            <Select {...p} value={s.currency} onChange={(e) => updateSettings({ currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c} ({currencySymbol(c)})
                </option>
              ))}
            </Select>
          )}
        </Field>
      </Row>
      <Row className="grid gap-4 sm:grid-cols-3">
        <MinutesField label="Daily study goal (min)" value={s.studyGoalDailyMin} onCommit={(n) => updateSettings({ studyGoalDailyMin: n })} />
        <MinutesField label="Weekly study goal (min)" value={s.studyGoalWeeklyMin} max={10080} onCommit={(n) => updateSettings({ studyGoalWeeklyMin: n })} />
        <MinutesField label="Screen-time goal (min)" value={s.screenTimeGoalMin} onCommit={(n) => updateSettings({ screenTimeGoalMin: n })} hint={s.screenTimeGoalMin ? `Under ${formatDuration(s.screenTimeGoalMin * 60)} a day` : 'No goal'} />
      </Row>
      <Row>
        <p className="mb-2 text-[13px] font-medium text-muted">Rating labels</p>
        <div className="flex flex-col gap-2">
          {s.ratingLabels.map((label, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-6 shrink-0 text-center text-sm text-muted tabular-nums" aria-hidden>
                {i + 1}
              </span>
              <div className="flex-1">
                <CommitInput
                  aria-label={`Label for rating ${i + 1}`}
                  value={label}
                  maxLength={40}
                  validate={(v) => (v.trim() ? null : 'Label cannot be empty.')}
                  onCommit={(v) => {
                    const next = [...s.ratingLabels] as Settings['ratingLabels']
                    next[i] = v.trim()
                    updateSettings({ ratingLabels: next })
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </Row>
      <Row>
        <Toggle label="Hide completed tasks" description="Completed tasks are tucked away on Today and in task lists." checked={s.hideCompletedTasks} onChange={(v) => updateSettings({ hideCompletedTasks: v })} />
      </Row>
    </Section>
  )
}

function NotificationsSection({ s }: { s: Settings }) {
  const [perm, requestPerm] = usePermission()
  const native = isNativeApp()
  const permText: Record<string, string> = {
    granted: 'Allowed',
    denied: native ? 'Turned off in Android settings' : 'Blocked in browser settings',
    default: 'Not yet asked',
    unsupported: 'Not supported in this browser',
  }
  return (
    <Section
      id="notifications"
      title="Notifications"
      description={
        native
          ? 'Reminders are scheduled on your phone and arrive even when DeJournal is closed.'
          : "Reminders can show a notification while DeJournal is open (including in a background tab). Browsers can't reliably deliver them when the app is fully closed."
      }
    >
      <Row>
        <Toggle label="Reminder notifications" description="Turn off to silence all reminder notifications." checked={s.notificationsEnabled} onChange={(v) => updateSettings({ notificationsEnabled: v })} />
      </Row>
      <Row className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[15px]">{native ? 'Permission' : 'Browser permission'}</p>
          <p className="text-xs text-faint">{permText[perm]}</p>
        </div>
        {(perm === 'default' || (native && perm === 'denied')) && (
          <Button size="sm" variant="subtle" onClick={requestPerm}>
            {perm === 'denied' ? 'Open settings' : 'Allow notifications'}
          </Button>
        )}
      </Row>
      <Row>
        <Toggle
          label="Quiet hours"
          description="No notifications during these hours. Reminders still appear in the app."
          checked={s.quietHours.enabled}
          onChange={(enabled) => updateSettings({ quietHours: { ...s.quietHours, enabled } })}
        />
        {s.quietHours.enabled && (
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Field label="From">{(p) => <Input {...p} type="time" value={s.quietHours.start} onChange={(e) => e.target.value && updateSettings({ quietHours: { ...s.quietHours, start: e.target.value } })} />}</Field>
            <Field label="Until">{(p) => <Input {...p} type="time" value={s.quietHours.end} onChange={(e) => e.target.value && updateSettings({ quietHours: { ...s.quietHours, end: e.target.value } })} />}</Field>
          </div>
        )}
      </Row>
      <Row>
        <Link to="/reminders" className="text-[13px] font-medium text-accent hover:underline">
          Manage reminders
        </Link>
      </Row>
    </Section>
  )
}

function PrivacySection({ s }: { s: Settings }) {
  return (
    <Section
      id="privacy"
      title="Privacy"
      description="Everything you record stays in this browser on this device. Nothing is uploaded unless you turn on a feature below."
    >
      <Row>
        <Toggle
          label="Location features"
          description="Allow using your device's location when you add a place. Off by default — you can always type a place by hand. Location is never collected in the background."
          checked={s.locationEnabled}
          onChange={(v) => updateSettings({ locationEnabled: v })}
        />
      </Row>
      <Row>
        <Toggle
          label="Map tiles"
          description="Show maps on the Places screen. Map images are loaded from OpenStreetMap, which sees the map area being viewed (not your entries)."
          checked={s.mapTilesEnabled}
          onChange={(v) => updateSettings({ mapTilesEnabled: v })}
        />
      </Row>
      <Row>
        <Toggle
          label="Remember recent searches"
          description="Keeps your last 8 searches on this device."
          checked={s.recentSearchesEnabled}
          onChange={async (v) => {
            await updateSettings({ recentSearchesEnabled: v })
            if (!v) await kvSet('recentSearches', [])
          }}
        />
        <button
          type="button"
          className="mt-1 text-[13px] text-accent hover:underline"
          onClick={async () => {
            await kvSet('recentSearches', [])
            toast('Recent searches cleared')
          }}
        >
          Clear recent searches
        </button>
      </Row>
      <Row>
        <Toggle
          label="Daily suggestions"
          description="A small suggestion on Today based on your own recent ratings, tasks, study and routines. Worked out on your device."
          checked={s.recommendationsEnabled}
          onChange={(v) => updateSettings({ recommendationsEnabled: v })}
        />
      </Row>
      <Row className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        <Link to="/places" className="text-accent hover:underline">
          Manage location history
        </Link>
        <Link to="/photos" className="text-accent hover:underline">
          Manage photos
        </Link>
      </Row>
    </Section>
  )
}

function AISection({ s }: { s: Settings }) {
  const [status, setStatus] = useState<{ available: boolean; detail: string } | null>(null)
  const [checking, setChecking] = useState(false)
  const check = async () => {
    setChecking(true)
    setStatus(await getProviderForStatus().status())
    setChecking(false)
  }
  useEffect(() => {
    if (s.aiEnabled) void check()
  }, [s.aiEnabled])

  return (
    <Section id="ai" title="AI (optional)" description="DeJournal works fully without AI. When enabled, AI is only used when you press a button such as “Summarize this month”.">
      {isNativeApp() && (
        <Row>
          <Notice icon={Info} title="Not available in the Android app yet">
            AI summaries need the DeJournal AI server, which this version of the app doesn’t connect to. Everything else works without it.
          </Notice>
        </Row>
      )}
      <Row>
        <Toggle
          label="Enable AI features"
          disabled={isNativeApp()}
          checked={s.aiEnabled && !isNativeApp()}
          onChange={(v) => updateSettings({ aiEnabled: v })}
        />
      </Row>
      {s.aiEnabled && !isNativeApp() && (
        <>
          <Row>
            <div className="flex items-start gap-3">
              <input
                id="ai-consent"
                type="checkbox"
                checked={s.aiConsent}
                onChange={(e) => updateSettings({ aiConsent: e.target.checked })}
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--c-accent)]"
              />
              <label htmlFor="ai-consent" className="text-[13px] leading-relaxed text-muted">
                <span className="block text-[15px] text-text">I agree to send summaries to the AI service</span>
                When you request an AI feature, DeJournal sends a small summary of the selected period — counts, ratings, task and highlight titles, and
                study and spending totals — to the AI server set up for this app, which forwards it to Anthropic's Claude API. Photos, locations, note
                text, reflections and expense notes are never sent. Nothing is sent automatically.
              </label>
            </div>
          </Row>
          <Row className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              <Bot size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden />
              <div>
                <p className="text-[15px]">AI server</p>
                <p className={cn('text-xs', status?.available ? 'text-success' : 'text-faint')}>{status ? status.detail : 'Checking…'}</p>
              </div>
            </div>
            <Button size="sm" variant="ghost" loading={checking} onClick={check}>
              Check again
            </Button>
          </Row>
          {status && !status.available && (
            <Row>
              <Notice icon={Info} title="Set up the AI server">
                Install the SDK with <code className="rounded bg-surface-3 px-1">npm install @anthropic-ai/sdk</code>, put your API key in a{' '}
                <code className="rounded bg-surface-3 px-1">.env</code> file as <code className="rounded bg-surface-3 px-1">ANTHROPIC_API_KEY</code> (see{' '}
                <code className="rounded bg-surface-3 px-1">.env.example</code>), then run <code className="rounded bg-surface-3 px-1">npm run ai-server</code>. The key stays on
                the server and is never sent to the browser.
              </Notice>
            </Row>
          )}
        </>
      )}
    </Section>
  )
}

function DashboardSection({ s }: { s: Settings }) {
  const allActions = Object.keys(QUICK_ACTIONS) as QuickActionId[]
  const hidden = allActions.filter((a) => !s.quickActions.includes(a))
  return (
    <Section id="dashboard" title="Dashboard" description="Choose what appears on Today and in the quick-add menu.">
      <Row>
        <p className="mb-1 text-[13px] font-medium text-muted">Today sections</p>
        <ul>
          {s.dashboard.map((sec, i) => (
            <li key={sec.id} className="flex items-center gap-1">
              <div className="flex-1">
                <Toggle
                  label={SECTION_LABELS[sec.id]}
                  checked={sec.visible}
                  onChange={(v) => updateSettings({ dashboard: s.dashboard.map((d) => (d.id === sec.id ? { ...d, visible: v } : d)) })}
                />
              </div>
              <IconButton icon={ArrowUp} size="sm" label={`Move ${SECTION_LABELS[sec.id]} up`} disabled={i === 0} onClick={() => updateSettings({ dashboard: move(s.dashboard, i, -1) })} />
              <IconButton
                icon={ArrowDown}
                size="sm"
                label={`Move ${SECTION_LABELS[sec.id]} down`}
                disabled={i === s.dashboard.length - 1}
                onClick={() => updateSettings({ dashboard: move(s.dashboard, i, 1) })}
              />
            </li>
          ))}
        </ul>
      </Row>
      <Row>
        <p className="mb-1 text-[13px] font-medium text-muted">Quick actions</p>
        <ul>
          {s.quickActions.map((id, i) => {
            const { label, icon: Icon } = QUICK_ACTIONS[id]
            return (
              <li key={id} className="flex items-center gap-1">
                <Icon size={17} className="mr-2 text-muted" aria-hidden />
                <div className="flex-1">
                  <Toggle
                    label={label}
                    checked
                    disabled={s.quickActions.length <= 1}
                    onChange={() => updateSettings({ quickActions: s.quickActions.filter((x) => x !== id) })}
                  />
                </div>
                <IconButton icon={ArrowUp} size="sm" label={`Move ${label} up`} disabled={i === 0} onClick={() => updateSettings({ quickActions: move(s.quickActions, i, -1) })} />
                <IconButton
                  icon={ArrowDown}
                  size="sm"
                  label={`Move ${label} down`}
                  disabled={i === s.quickActions.length - 1}
                  onClick={() => updateSettings({ quickActions: move(s.quickActions, i, 1) })}
                />
              </li>
            )
          })}
          {hidden.map((id) => {
            const { label, icon: Icon } = QUICK_ACTIONS[id]
            return (
              <li key={id} className="flex items-center gap-1 pr-[76px]">
                <Icon size={17} className="mr-2 text-faint" aria-hidden />
                <div className="flex-1">
                  <Toggle label={label} checked={false} onChange={() => updateSettings({ quickActions: [...s.quickActions, id] })} />
                </div>
              </li>
            )
          })}
        </ul>
      </Row>
      <Row>
        <Button
          size="sm"
          variant="ghost"
          icon={RotateCcw}
          onClick={() => updateSettings({ dashboard: DEFAULT_SETTINGS.dashboard, quickActions: DEFAULT_SETTINGS.quickActions })}
        >
          Reset to defaults
        </Button>
      </Row>
    </Section>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function DeleteAllSheet({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const ok = text.trim() === 'DELETE'
  return (
    <Sheet
      title="Delete all data?"
      size="sm"
      onClose={onClose}
      onSubmit={async () => {
        if (!ok) return
        setBusy(true)
        try {
          await deleteAllData()
          toast('All data deleted')
          onClose()
        } catch {
          toast('Could not delete data', { tone: 'error' })
        } finally {
          setBusy(false)
        }
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={!ok} loading={busy}>
            Delete everything
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm leading-relaxed text-muted">
        This permanently removes every task, note, photo, expense, study session, reflection and setting stored in this browser. It cannot be undone.
        Export a backup first if you might want it later.
      </p>
      <Field label='Type "DELETE" to confirm'>{(p) => <Input {...p} autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />}</Field>
    </Sheet>
  )
}

function ImportSheet({ env, fileName, onClose }: { env: BackupEnvelope; fileName: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const counts = backupCounts(env)
  const total = Object.values(counts).reduce((s, n) => s + n, 0)
  const run = async (mode: 'replace' | 'merge') => {
    setBusy(true)
    try {
      const n = await importBackup(env, mode)
      toast(`Imported ${plural(n, 'record')}`, { tone: 'success' })
      onClose()
    } catch (e) {
      console.error(e)
      toast('Import failed. Your existing data was not changed.', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  const shown = Object.entries(counts).filter(([k, n]) => n > 0 && k !== 'kv' && k !== 'photoFiles')
  return (
    <Sheet
      title="Import backup"
      description={`${fileName} · exported ${formatDate(env.exportedAt.slice(0, 10), 'd MMM yyyy')}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => run('merge')}>
            Merge
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() =>
              confirmDialog({
                title: 'Replace all data?',
                message: 'Everything currently in DeJournal on this device will be removed and replaced with the backup.',
                confirmLabel: 'Replace all',
                destructive: true,
                onConfirm: () => run('replace'),
              })
            }
          >
            Replace all
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">
        This backup contains {plural(total, 'record')}
        {env.includesPhotos ? ', including photos' : ' (without photos)'}.
      </p>
      {shown.length > 0 && (
        <ul className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
          {shown.map(([k, n]) => (
            <li key={k} className="flex justify-between">
              <span className="text-muted">{k}</span>
              <span className="tabular-nums">{n}</span>
            </li>
          ))}
        </ul>
      )}
      <Notice>
        <strong className="text-text">Merge</strong> adds the backup to what you have; records that exist in both are replaced by the backup copy.{' '}
        <strong className="text-text">Replace all</strong> clears this device first.
      </Notice>
    </Sheet>
  )
}

function DataSection() {
  const [estimate, setEstimate] = useState<{ usage?: number; quota?: number } | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [includePhotos, setIncludePhotos] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [pending, setPending] = useState<{ env: BackupEnvelope; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const photoStats = useLiveQuery(async () => {
    let bytes = 0
    let count = 0
    await db.photos.each((p) => {
      count++
      bytes += p.thumb?.size ?? 0
    })
    await db.photoFiles.each((f) => {
      bytes += f.blob?.size ?? 0
    })
    return { count, bytes }
  }, [])

  const refreshStorage = async () => {
    if (!navigator.storage) return
    try {
      setEstimate(await navigator.storage.estimate())
      if (navigator.storage.persisted) setPersisted(await navigator.storage.persisted())
    } catch {
      /* not available */
    }
  }
  useEffect(() => {
    void refreshStorage()
  }, [photoStats])

  const onFile = async (file: File) => {
    try {
      if (file.size > 500 * 1024 * 1024) throw new BackupError('This file is too large to import.')
      const env = parseBackup(await file.text())
      setPending({ env, name: file.name })
    } catch (e) {
      toast(e instanceof BackupError ? e.message : 'Could not read that file.', { tone: 'error' })
    }
  }

  return (
    <Section id="data" title="Your data" description="DeJournal is local-first: your data lives in this browser's storage. Export regularly to keep a copy.">
      <Row className="flex items-start gap-3">
        <HardDrive size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[15px]">Storage</p>
          <p className="text-xs text-faint">
            {estimate?.usage !== undefined
              ? `${formatBytes(estimate.usage)} used${estimate.quota ? ` of ${formatBytes(estimate.quota)} available` : ''}`
              : 'Storage estimate not available in this browser.'}
          </p>
          {photoStats && (
            <p className="text-xs text-faint">
              Photos: {plural(photoStats.count, 'photo')} · about {formatBytes(photoStats.bytes)} ·{' '}
              <Link to="/photos" className="text-accent hover:underline">
                Manage
              </Link>
            </p>
          )}
        </div>
      </Row>
      {persisted !== null && (
        <Row className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldCheck size={18} className={cn('mt-0.5 shrink-0', persisted ? 'text-success' : 'text-muted')} aria-hidden />
            <div>
              <p className="text-[15px]">Persistent storage</p>
              <p className="text-xs text-faint">{persisted ? 'On — the browser will not clear DeJournal data to free up space.' : 'Off — the browser may clear data when the device runs low on space.'}</p>
            </div>
          </div>
          {!persisted && (
            <Button
              size="sm"
              variant="subtle"
              onClick={async () => {
                const ok = await navigator.storage.persist()
                setPersisted(ok)
                toast(ok ? 'Storage is now persistent' : 'The browser declined. Installing the app or bookmarking it can help.', { tone: ok ? 'success' : 'default' })
              }}
            >
              Keep data persistent
            </Button>
          )}
        </Row>
      )}
      <Row>
        <p className="text-[15px]">Export backup</p>
        <p className="mb-2 text-xs text-faint">Downloads a JSON file with all your records{includePhotos ? ' and photos' : ''}.</p>
        <Toggle label="Include photos" description="Turn off for a much smaller file." checked={includePhotos} onChange={setIncludePhotos} />
        <Button
          className="mt-2"
          icon={Download}
          loading={exporting}
          onClick={async () => {
            setExporting(true)
            try {
              const r = await downloadBackup({ includePhotos })
              toast(`Exported ${plural(r.rows, 'record')} (${formatBytes(r.bytes)})`, { tone: 'success' })
            } catch {
              toast('Export failed', { tone: 'error' })
            } finally {
              setExporting(false)
            }
          }}
        >
          Export backup
        </Button>
      </Row>
      <Row>
        <p className="text-[15px]">Import backup</p>
        <p className="mb-2 text-xs text-faint">Restore from a DeJournal backup file. You'll choose to merge or replace before anything changes.</p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Choose backup file"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void onFile(f)
          }}
        />
        <Button icon={Upload} onClick={() => fileRef.current?.click()}>
          Choose file
        </Button>
      </Row>
      <Row>
        <p className="text-[15px]">Delete all data</p>
        <p className="mb-2 text-xs text-faint">Permanently erase everything stored by DeJournal in this browser.</p>
        <Button variant="danger" icon={Trash2} onClick={() => setDeleting(true)}>
          Delete all data…
        </Button>
      </Row>
      {pending && <ImportSheet env={pending.env} fileName={pending.name} onClose={() => setPending(null)} />}
      {deleting && <DeleteAllSheet onClose={() => setDeleting(false)} />}
    </Section>
  )
}

export default function SettingsPage() {
  const s = useSettings()
  const { hash } = useLocation()

  useEffect(() => {
    if (!hash) return
    const t = setTimeout(() => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' }), 50)
    return () => clearTimeout(t)
  }, [hash])

  return (
    <Page>
      <PageHeader title="Settings" back="/more">
        <nav aria-label="Settings sections" className="scrollbar-none -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {JUMP.map((j) => (
            <a key={j.id} href={`#${j.id}`} onClick={(e) => {
              e.preventDefault()
              document.getElementById(j.id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
              history.replaceState(null, '', `#${j.id}`)
            }}>
              <Chip>{j.label}</Chip>
            </a>
          ))}
        </nav>
      </PageHeader>
      <div className="flex flex-col gap-7">
        <AppearanceSection s={s} />
        <GeneralSection s={s} />
        <NotificationsSection s={s} />
        <PrivacySection s={s} />
        <AISection s={s} />
        <DashboardSection s={s} />
        <DataSection />
        <section aria-labelledby="about-h">
          <h2 id="about-h" className="mb-1 px-1 text-xs font-semibold tracking-wider text-faint uppercase">
            About
          </h2>
          <Card className="p-4 text-[13px] leading-relaxed text-muted">
            <p className="text-[15px] font-medium text-text">DeJournal {APP_VERSION}</p>
            <p className="mt-1">
              A private journal, planner and life tracker. Your records are stored only in this browser (IndexedDB) and are never uploaded. Optional
              features — AI summaries, calendar import and maps — only contact outside services when you turn them on.
            </p>
          </Card>
        </section>
      </div>
    </Page>
  )
}
