import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { WeekStart } from '@/lib/dates'
import { setNativeSystemBars } from '@/platform/native'

export type ThemePref = 'dark' | 'light' | 'system'
export type MotionPref = 'system' | 'reduced' | 'full'
export type Accent = 'blue' | 'violet' | 'teal' | 'rose'

export type DashboardSectionId =
  | 'recommendation'
  | 'rating'
  | 'highlight'
  | 'tasks'
  | 'agenda'
  | 'routines'
  | 'study'
  | 'expenses'
  | 'screentime'
  | 'activity'

export type QuickActionId =
  | 'task'
  | 'reminder'
  | 'note'
  | 'expense'
  | 'study'
  | 'photo'
  | 'highlight'
  | 'rating'
  | 'event'

export interface DashboardSection {
  id: DashboardSectionId
  visible: boolean
}

export interface Settings {
  theme: ThemePref
  accent: Accent
  motion: MotionPref
  /** date-fns pattern used in headers. */
  dateFormat: string
  weekStartsOn: WeekStart
  currency: string
  /** Daily / weekly study goals in minutes (0 = no goal). */
  studyGoalDailyMin: number
  studyGoalWeeklyMin: number
  screenTimeGoalMin: number
  /** Monthly budget in minor units (0 = none) and per-category budgets. */
  monthlyBudget: number
  categoryBudgets: Record<string, number>
  hideCompletedTasks: boolean
  notificationsEnabled: boolean
  quietHours: { enabled: boolean; start: string; end: string }
  aiEnabled: boolean
  /** User agreed that selected data may be sent to the configured AI provider. */
  aiConsent: boolean
  locationEnabled: boolean
  mapTilesEnabled: boolean
  recentSearchesEnabled: boolean
  recommendationsEnabled: boolean
  dashboard: DashboardSection[]
  /** Bumped when the default Today layout changes, so existing installs get it. */
  dashboardVersion: number
  quickActions: QuickActionId[]
  ratingLabels: [string, string, string, string, string]
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  accent: 'blue',
  motion: 'system',
  dateFormat: 'EEE, d MMM',
  weekStartsOn: 1,
  currency: 'INR',
  studyGoalDailyMin: 60,
  studyGoalWeeklyMin: 0,
  screenTimeGoalMin: 0,
  monthlyBudget: 0,
  categoryBudgets: {},
  hideCompletedTasks: false,
  notificationsEnabled: true,
  quietHours: { enabled: false, start: '22:00', end: '07:00' },
  aiEnabled: false,
  aiConsent: false,
  locationEnabled: false,
  mapTilesEnabled: true,
  recentSearchesEnabled: true,
  recommendationsEnabled: true,
  // Default Today fits on one phone screen without scrolling; the extra
  // sections can be switched on in Settings → Dashboard.
  dashboard: [
    { id: 'recommendation', visible: true },
    { id: 'rating', visible: true },
    { id: 'study', visible: true },
    { id: 'expenses', visible: true },
    { id: 'screentime', visible: true },
    { id: 'highlight', visible: true },
    { id: 'tasks', visible: true },
    { id: 'agenda', visible: false },
    { id: 'routines', visible: false },
    { id: 'activity', visible: false },
  ],
  dashboardVersion: 2,
  quickActions: ['task', 'expense', 'study', 'note', 'photo', 'highlight', 'reminder', 'rating', 'event'],
  ratingLabels: ['Very difficult', 'Below average', 'Average', 'Good', 'Excellent'],
}

const KEY = 'settings'

/** Merge stored settings with defaults so new fields always have values. */
export function mergeSettings(stored: Partial<Settings> | undefined): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(stored ?? {}) }
  // Older layouts are replaced by the current default once.
  if ((stored?.dashboardVersion ?? 1) < DEFAULT_SETTINGS.dashboardVersion) {
    s.dashboard = DEFAULT_SETTINGS.dashboard
    s.dashboardVersion = DEFAULT_SETTINGS.dashboardVersion
  }
  // Keep dashboard list complete if new sections were added in an update.
  const known = new Set(s.dashboard.map((d) => d.id))
  const dashboard = [...s.dashboard.filter((d) => DEFAULT_SETTINGS.dashboard.some((x) => x.id === d.id))]
  for (const d of DEFAULT_SETTINGS.dashboard) if (!known.has(d.id)) dashboard.push(d)
  s.dashboard = dashboard
  s.quietHours = { ...DEFAULT_SETTINGS.quietHours, ...(s.quietHours ?? {}) }
  return s
}

export async function getSettings(): Promise<Settings> {
  const row = await db.kv.get(KEY)
  return mergeSettings(row?.value as Partial<Settings> | undefined)
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await db.transaction('rw', db.kv, async () => {
    const current = await getSettings()
    await db.kv.put({ key: KEY, value: { ...current, ...patch } })
  })
}

/** Live settings. Returns defaults until the first read resolves. */
export function useSettings(): Settings {
  const row = useLiveQuery(() => db.kv.get(KEY), [])
  return mergeSettings(row?.value as Partial<Settings> | undefined)
}

/** Apply appearance settings to <html>. Called from AppShell whenever settings change. */
export function applyAppearance(s: Pick<Settings, 'theme' | 'accent' | 'motion'>) {
  const root = document.documentElement
  const resolved =
    s.theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : s.theme
  root.dataset.theme = resolved
  root.dataset.accent = s.accent
  if (s.motion === 'system') delete root.dataset.motion
  else root.dataset.motion = s.motion
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', resolved === 'light' ? '#f4f3ef' : '#121418')
  setNativeSystemBars(resolved)
  try {
    localStorage.setItem('dj-theme', s.theme)
  } catch {
    /* storage unavailable */
  }
}
