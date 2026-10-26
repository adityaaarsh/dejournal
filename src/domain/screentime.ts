import type { ScreenTimeRecord } from '@/db/types'

/** Category order and colours (theme tokens) for the screen-time pie. */
export const SCREEN_CATEGORIES = [
  { key: 'Social', color: 'var(--c-cat-1)' },
  { key: 'Video', color: 'var(--c-cat-2)' },
  { key: 'Productivity', color: 'var(--c-cat-3)' },
  { key: 'Games', color: 'var(--c-cat-4)' },
  { key: 'Other', color: 'var(--c-cat-5)' },
] as const

export interface Slice {
  key: string
  label: string
  minutes: number
  color: string
}

const MAX_SLICES = 4

/**
 * Pie slices for a day: the largest categories (up to 3) plus "Other".
 * A record without a breakdown (logged by hand) is one "Total" slice.
 */
export function screenTimeSlices(rec: Pick<ScreenTimeRecord, 'minutes' | 'breakdown'> | null): Slice[] {
  if (!rec || rec.minutes <= 0) return []
  const b = rec.breakdown
  if (!b || !Object.keys(b).length) return [{ key: 'total', label: 'Total', minutes: rec.minutes, color: 'var(--c-accent)' }]

  const known = SCREEN_CATEGORIES.map((c) => c.key as string)
  const entries = Object.entries(b)
    .map(([k, m]) => [known.includes(k) ? k : 'Other', Math.max(0, Math.round(m))] as const)
    .reduce<Record<string, number>>((acc, [k, m]) => ({ ...acc, [k]: (acc[k] ?? 0) + m }), {})

  const main = Object.entries(entries)
    .filter(([k, m]) => k !== 'Other' && m > 0)
    .sort((a, b2) => b2[1] - a[1])
  const top = main.slice(0, MAX_SLICES - 1)
  const rest = main.slice(MAX_SLICES - 1).reduce((s, [, m]) => s + m, 0) + (entries.Other ?? 0)
  // Any minutes not covered by the breakdown count as Other.
  const covered = top.reduce((s, [, m]) => s + m, 0) + rest
  const other = rest + Math.max(0, rec.minutes - covered)

  const colorOf = (k: string) => SCREEN_CATEGORIES.find((c) => c.key === k)?.color ?? 'var(--c-cat-5)'
  const labelOf = (k: string) => (k === 'Productivity' ? 'Work' : k)
  const slices: Slice[] = top.map(([k, m]) => ({ key: k, label: labelOf(k), minutes: m, color: colorOf(k) }))
  if (other > 0) slices.push({ key: 'Other', label: 'Other', minutes: other, color: colorOf('Other') })
  return slices
}
