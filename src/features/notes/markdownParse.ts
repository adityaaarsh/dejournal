/**
 * Tiny, safe markdown subset for notes. Produces a token tree; rendering to
 * React elements happens in markdown.tsx (never via innerHTML).
 *
 * Blocks: # / ## / ### headings, "- " / "* " bullets, "- [ ] " / "- [x] "
 * checklists, paragraphs (consecutive lines joined with line breaks).
 * Inline: **bold**, _italic_ / *italic*, `code`, [text](http(s) url), bare http(s) urls.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold'; children: Inline[] }
  | { type: 'italic'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: Inline[] }
  | { type: 'br' }

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; children: Inline[] }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'list'; items: Inline[][] }
  | { type: 'checklist'; items: Array<{ checked: boolean; children: Inline[] }> }

export function isSafeUrl(href: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(href)
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = []
  let buf = ''
  const flush = () => {
    if (buf) out.push({ type: 'text', text: buf })
    buf = ''
  }
  let i = 0
  while (i < src.length) {
    const rest = src.slice(i)
    // inline code
    if (src[i] === '`') {
      const end = src.indexOf('`', i + 1)
      if (end > i + 1) {
        flush()
        out.push({ type: 'code', text: src.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }
    // bold
    if (rest.startsWith('**')) {
      const end = src.indexOf('**', i + 2)
      if (end > i + 2) {
        flush()
        out.push({ type: 'bold', children: parseInline(src.slice(i + 2, end)) })
        i = end + 2
        continue
      }
    }
    // italic (_x_ or *x*), must not start with whitespace
    if ((src[i] === '_' || src[i] === '*') && src[i + 1] && !/\s/.test(src[i + 1])) {
      const ch = src[i]
      // underscore only at word boundary (avoid snake_case)
      const prev = src[i - 1]
      if (ch === '*' || !prev || /[\s(\[]/.test(prev)) {
        const end = src.indexOf(ch, i + 1)
        if (end > i + 1 && !/\s/.test(src[end - 1])) {
          const next = src[end + 1]
          if (ch === '*' || !next || /[\s.,;:!?)\]]/.test(next)) {
            flush()
            out.push({ type: 'italic', children: parseInline(src.slice(i + 1, end)) })
            i = end + 1
            continue
          }
        }
      }
    }
    // [text](url)
    if (src[i] === '[') {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest)
      if (m) {
        flush()
        if (isSafeUrl(m[2])) out.push({ type: 'link', href: m[2], children: parseInline(m[1]) })
        else out.push({ type: 'text', text: m[1] })
        i += m[0].length
        continue
      }
    }
    // bare url
    if ((src[i] === 'h' || src[i] === 'H') && (i === 0 || /\s/.test(src[i - 1]))) {
      const m = /^https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/i.exec(rest)
      if (m) {
        flush()
        out.push({ type: 'link', href: m[0], children: [{ type: 'text', text: m[0] }] })
        i += m[0].length
        continue
      }
    }
    buf += src[i]
    i++
  }
  flush()
  return out
}

const HEADING = /^(#{1,3})\s+(.*)$/
const CHECK = /^\s*[-*]\s+\[( |x|X)\]\s?(.*)$/
const BULLET = /^\s*[-*]\s+(.*)$/

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let para: string[] = []
  const flushPara = () => {
    if (!para.length) return
    const children: Inline[] = []
    para.forEach((l, idx) => {
      if (idx) children.push({ type: 'br' })
      children.push(...parseInline(l))
    })
    blocks.push({ type: 'paragraph', children })
    para = []
  }
  for (const line of lines) {
    if (!line.trim()) {
      flushPara()
      continue
    }
    const h = HEADING.exec(line)
    if (h) {
      flushPara()
      blocks.push({ type: 'heading', level: h[1].length as 1 | 2 | 3, children: parseInline(h[2].trim()) })
      continue
    }
    const c = CHECK.exec(line)
    if (c) {
      flushPara()
      const item = { checked: c[1].toLowerCase() === 'x', children: parseInline(c[2]) }
      const last = blocks[blocks.length - 1]
      if (last?.type === 'checklist') last.items.push(item)
      else blocks.push({ type: 'checklist', items: [item] })
      continue
    }
    const b = BULLET.exec(line)
    if (b) {
      flushPara()
      const last = blocks[blocks.length - 1]
      if (last?.type === 'list') last.items.push(parseInline(b[1]))
      else blocks.push({ type: 'list', items: [parseInline(b[1])] })
      continue
    }
    para.push(line)
  }
  flushPara()
  return blocks
}

/** Plain-text version (for snippets / search). */
export function stripMarkdown(src: string): string {
  return src
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/^\s*[-*]\s+\[( |x|X)\]\s?/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/(^|\s)[_*]([^_*\s][^_*]*?)[_*](?=\s|$|[.,;:!?])/g, '$1$2')
}

/**
 * Apply a formatting action to a textarea value + selection.
 * Returns the new value and selection range.
 */
export type FormatAction = 'bold' | 'italic' | 'heading' | 'bullet' | 'check' | 'code'

export function applyFormat(
  value: string,
  start: number,
  end: number,
  action: FormatAction,
): { value: string; start: number; end: number } {
  const wrap = (mark: string, placeholder: string) => {
    const sel = value.slice(start, end) || placeholder
    const next = value.slice(0, start) + mark + sel + mark + value.slice(end)
    return { value: next, start: start + mark.length, end: start + mark.length + sel.length }
  }
  if (action === 'bold') return wrap('**', 'bold text')
  if (action === 'italic') return wrap('_', 'italic text')
  if (action === 'code') return wrap('`', 'code')

  // Line prefixes: apply to every line touched by the selection.
  const prefix = action === 'heading' ? '## ' : action === 'bullet' ? '- ' : '- [ ] '
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  let lineEnd = value.indexOf('\n', end)
  if (lineEnd === -1) lineEnd = value.length
  const block = value.slice(lineStart, lineEnd)
  const lines = block.split('\n')
  const all = lines.every((l) => l.startsWith(prefix))
  const changed = lines.map((l) => (all ? l.slice(prefix.length) : l.startsWith(prefix) ? l : prefix + l)).join('\n')
  const next = value.slice(0, lineStart) + changed + value.slice(lineEnd)
  const delta = changed.length - block.length
  return { value: next, start: lineStart, end: lineEnd + delta }
}
