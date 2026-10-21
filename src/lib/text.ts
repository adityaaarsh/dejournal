/** Lowercase and strip diacritics for forgiving text matching. */
export function normalize(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export function queryTerms(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean)
}

/** Every whitespace-separated query term appears somewhere in the haystack. */
export function matchesQuery(haystack: string, query: string): boolean {
  const terms = queryTerms(query)
  if (!terms.length) return false
  const h = normalize(haystack)
  return terms.every((t) => h.includes(t))
}

/** Short excerpt around the first match. */
export function snippet(text: string | null | undefined, query: string, radius = 48): string {
  const src = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!src) return ''
  const n = normalize(src)
  let idx = -1
  for (const t of queryTerms(query)) {
    idx = n.indexOf(t)
    if (idx >= 0) break
  }
  if (idx < 0) return src.length > radius * 2 ? src.slice(0, radius * 2) + '…' : src
  const start = Math.max(0, idx - radius)
  const end = Math.min(src.length, idx + radius)
  return (start > 0 ? '…' : '') + src.slice(start, end) + (end < src.length ? '…' : '')
}

/** "study, dsa #exam" → ['study', 'dsa', 'exam'] */
export function parseTags(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[,#]/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  )
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`
}
