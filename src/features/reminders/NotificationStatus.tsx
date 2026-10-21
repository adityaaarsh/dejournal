import { useEffect, useState } from 'react'
import { BellOff, BellRing, Info } from 'lucide-react'
import { Button, Card, Notice, Toggle } from '@/components/ui'
import { updateSettings, useSettings } from '@/stores/settings'
import { toast } from '@/stores/ui'
import { permissionState, requestNotificationPermission, type PermissionState } from './notifications'
import { canScheduleExactAlarms, isNativeApp, onNativeEvent, openExactAlarmSettings } from '@/platform/native'

/** Live browser notification permission. */
export function usePermission(): [PermissionState, () => Promise<PermissionState>] {
  const [state, setState] = useState<PermissionState>(() => permissionState())
  useEffect(() => {
    let status: PermissionStatus | null = null
    const onChange = () => setState(permissionState())
    navigator.permissions
      ?.query({ name: 'notifications' as PermissionName })
      .then((s) => {
        status = s
        s.addEventListener('change', onChange)
      })
      .catch(() => {})
    window.addEventListener('focus', onChange)
    // In the Android app, re-read the permission when returning from system settings.
    const offNative = onNativeEvent((e) => e.type === 'resume' && onChange())
    return () => {
      status?.removeEventListener('change', onChange)
      window.removeEventListener('focus', onChange)
      offNative()
    }
  }, [])
  const request = async () => {
    const s = await requestNotificationPermission()
    setState(s)
    if (s === 'granted') toast('Notifications enabled', { tone: 'success' })
    else if (s === 'denied')
      toast(
        isNativeApp()
          ? 'Notifications are off for DeJournal. You can allow them in Android Settings → Apps → DeJournal.'
          : 'Notifications were blocked. You can allow them in your browser’s site settings.',
        { tone: 'error', duration: 6000 },
      )
    return s
  }
  return [state, request]
}

const LABEL: Record<PermissionState, string> = {
  granted: 'Allowed',
  denied: 'Blocked in settings',
  default: 'Not enabled yet',
  unsupported: 'Not supported in this browser',
}

/** Full status panel for the Reminders page. */
export function NotificationStatusPanel() {
  const settings = useSettings()
  const [perm, request] = usePermission()
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${perm === 'granted' && settings.notificationsEnabled ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'}`}>
          {perm === 'granted' && settings.notificationsEnabled ? <BellRing size={18} aria-hidden /> : <BellOff size={18} aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">Notifications</p>
          <p className="text-[13px] text-muted">
            {isNativeApp() ? 'Permission' : 'Browser permission'}: <span className="text-text">{LABEL[perm]}</span>
          </p>
        </div>
      </div>
      <div className="mt-2">
        <Toggle
          label="Remind me with notifications"
          description="Turn off to stop all reminder alerts. Your reminders stay saved."
          checked={settings.notificationsEnabled}
          onChange={(v) => updateSettings({ notificationsEnabled: v })}
        />
      </div>
      {perm === 'default' && settings.notificationsEnabled && (
        <Notice
          className="mt-2"
          title="Allow DeJournal to alert you"
          action={
            <Button size="sm" variant="primary" onClick={request}>
              Enable notifications
            </Button>
          }
        >
          {isNativeApp()
            ? 'Android will ask for permission. It’s used only to alert you about reminders you create.'
            : 'Your browser will ask for permission. It’s used only to show reminders you create; without it, reminders appear inside the app.'}
        </Notice>
      )}
      {perm === 'denied' &&
        (isNativeApp() ? (
          <Notice
            className="mt-2"
            tone="warn"
            action={
              <Button size="sm" onClick={request}>
                Open settings
              </Button>
            }
          >
            Notifications are turned off for DeJournal. Allow them in Android settings to get reminder alerts.
          </Notice>
        ) : (
          <Notice className="mt-2" tone="warn">
            Notifications are blocked for this site. To get alerts, allow notifications in your browser’s site settings, then come back.
            Reminders will still show inside the app while it’s open.
          </Notice>
        ))}
      {isNativeApp() && perm === 'granted' && settings.notificationsEnabled && !canScheduleExactAlarms() && (
        <Notice
          className="mt-2"
          title="Allow on-time alerts"
          action={
            <Button size="sm" onClick={openExactAlarmSettings}>
              Open settings
            </Button>
          }
        >
          Without the “Alarms &amp; reminders” permission, Android may deliver reminders a few minutes late to save battery.
        </Notice>
      )}
      <p className="mt-3 flex gap-2 text-xs leading-relaxed text-faint">
        <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
        {isNativeApp() ? (
          <span>Reminders are scheduled on your phone and arrive even when DeJournal is closed or after a restart.</span>
        ) : (
          <span>
            Reminders fire while DeJournal is open in any tab, even in the background. Browsers can’t reliably wake a closed web app without a
            push server, which this private, local-only app doesn’t use.
          </span>
        )}
      </p>
    </Card>
  )
}

/** Compact prompt shown inside the reminder editor when permission is missing. */
export function NotificationInlinePrompt() {
  const settings = useSettings()
  const [perm, request] = usePermission()
  if (!settings.notificationsEnabled)
    return (
      <Notice tone="warn" icon={BellOff}>
        Reminder notifications are turned off for the whole app. You can turn them on from the Reminders page.
      </Notice>
    )
  if (perm === 'default')
    return (
      <Notice
        icon={BellRing}
        action={
          <Button size="sm" variant="subtle" onClick={request}>
            Enable notifications
          </Button>
        }
      >
        To get an alert at the reminder time, allow notifications. DeJournal uses them only for your reminders.
      </Notice>
    )
  if (perm === 'denied')
    return (
      <Notice tone="warn" icon={BellOff}>
        {isNativeApp()
          ? 'Notifications are turned off for DeJournal in Android settings, so you won’t get an alert for this reminder.'
          : 'Notifications are blocked in your browser, so this reminder will appear inside the app instead.'}
      </Notice>
    )
  return null
}
