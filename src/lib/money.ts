/** Money helpers. Amounts are stored as integer minor units (paise, cents). */

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'IDR', 'CLP'])

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'SGD', 'AED'] as const

export function minorUnitDigits(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2
}

/**
 * Parse user input ("340", "12.5", "1,299.99") into minor units.
 * Returns null for invalid, non-finite, zero or negative values.
 */
export function parseAmount(input: string, currency = 'INR'): number | null {
  if (input.includes('-')) return null
  const cleaned = input.replace(/[,\s]/g, '').replace(/^[^\d.]+/, '')
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null
  const digits = minorUnitDigits(currency)
  const [whole, frac = ''] = cleaned.split('.')
  if (frac.length > digits) return null
  const fracPart = digits === 0 ? 0 : Number((frac + '00').slice(0, digits))
  const minor = Number(whole) * 10 ** digits + fracPart
  if (!Number.isFinite(minor) || !Number.isSafeInteger(minor) || minor <= 0) return null
  return minor
}

export function toMajor(minor: number, currency = 'INR'): number {
  return minor / 10 ** minorUnitDigits(currency)
}

function locale(currency: string): string | undefined {
  return currency === 'INR' ? 'en-IN' : undefined
}

/** Format minor units for display, e.g. ₹340 or ₹1,299.50. */
export function formatMoney(minor: number, currency = 'INR'): string {
  const major = toMajor(minor, currency)
  const whole = Number.isInteger(major)
  try {
    return new Intl.NumberFormat(locale(currency), {
      style: 'currency',
      currency,
      minimumFractionDigits: whole ? 0 : minorUnitDigits(currency),
      maximumFractionDigits: minorUnitDigits(currency),
    }).format(major)
  } catch {
    return `${currency} ${major.toFixed(whole ? 0 : 2)}`
  }
}

/** Value to prefill an amount input with. */
export function amountInputValue(minor: number, currency = 'INR'): string {
  const major = toMajor(minor, currency)
  return Number.isInteger(major) ? String(major) : major.toFixed(minorUnitDigits(currency))
}

export function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat(locale(currency), { style: 'currency', currency }).formatToParts(0)
    return parts.find((p) => p.type === 'currency')?.value ?? currency
  } catch {
    return currency
  }
}
