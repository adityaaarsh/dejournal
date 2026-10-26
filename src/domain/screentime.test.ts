import { describe, expect, it } from 'vitest'
import { screenTimeSlices } from './screentime'
import { spendLevel } from './expenses'

describe('spendLevel', () => {
  it('is green under 100, yellow under 400, red from 400 (major units)', () => {
    expect(spendLevel(0, 'INR')).toBe('low')
    expect(spendLevel(9_999, 'INR')).toBe('low') // ₹99.99
    expect(spendLevel(10_000, 'INR')).toBe('mid') // ₹100
    expect(spendLevel(39_999, 'INR')).toBe('mid')
    expect(spendLevel(40_000, 'INR')).toBe('high') // ₹400
    expect(spendLevel(399, 'JPY')).toBe('mid') // zero-decimal currency
  })
})

describe('screenTimeSlices', () => {
  it('returns nothing for no record or zero minutes', () => {
    expect(screenTimeSlices(null)).toEqual([])
    expect(screenTimeSlices({ minutes: 0, breakdown: null })).toEqual([])
  })

  it('uses one Total slice when there is no breakdown', () => {
    const s = screenTimeSlices({ minutes: 95, breakdown: null })
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ key: 'total', minutes: 95 })
  })

  it('keeps the top three categories and folds the rest into Other', () => {
    const s = screenTimeSlices({ minutes: 200, breakdown: { Social: 70, Video: 55, Games: 10, Productivity: 40, Other: 20, Weird: 5 } })
    expect(s.map((x) => x.key)).toEqual(['Social', 'Video', 'Productivity', 'Other'])
    expect(s.find((x) => x.key === 'Other')!.minutes).toBe(35) // games 10 + other 20 + unknown 5
    expect(s.reduce((t, x) => t + x.minutes, 0)).toBe(200)
  })

  it('counts minutes missing from the breakdown as Other', () => {
    const s = screenTimeSlices({ minutes: 100, breakdown: { Social: 60 } })
    expect(s).toEqual([
      expect.objectContaining({ key: 'Social', minutes: 60 }),
      expect.objectContaining({ key: 'Other', minutes: 40 }),
    ])
  })
})
