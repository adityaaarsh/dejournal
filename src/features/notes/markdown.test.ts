import { describe, expect, it } from 'vitest'
import { applyFormat, isSafeUrl, parseInline, parseMarkdown, stripMarkdown } from './markdownParse'

describe('parseInline', () => {
  it('parses bold, italic and code', () => {
    expect(parseInline('a **b** _c_ `d`')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'bold', children: [{ type: 'text', text: 'b' }] },
      { type: 'text', text: ' ' },
      { type: 'italic', children: [{ type: 'text', text: 'c' }] },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'd' },
    ])
  })

  it('does not italicise snake_case words', () => {
    expect(parseInline('my_var_name')).toEqual([{ type: 'text', text: 'my_var_name' }])
  })

  it('keeps unsafe links as plain text', () => {
    expect(parseInline('[x](javascript:alert(1))')[0]).toEqual({ type: 'text', text: 'x' })
    expect(parseInline('[site](https://example.com)')[0]).toEqual({
      type: 'link',
      href: 'https://example.com',
      children: [{ type: 'text', text: 'site' }],
    })
  })

  it('detects bare urls without trailing punctuation', () => {
    const t = parseInline('see https://example.com/a.')
    expect(t[1]).toMatchObject({ type: 'link', href: 'https://example.com/a' })
    expect(t[2]).toEqual({ type: 'text', text: '.' })
  })

  it('leaves unmatched markers alone', () => {
    expect(parseInline('2 * 3 and **open')).toEqual([{ type: 'text', text: '2 * 3 and **open' }])
  })
})

describe('parseMarkdown', () => {
  it('parses headings, lists, checklists and paragraphs', () => {
    const blocks = parseMarkdown('# Title\nline one\nline two\n\n- a\n- b\n- [ ] todo\n- [x] done')
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'list', 'checklist'])
    expect(blocks[1]).toMatchObject({ children: [{ text: 'line one' }, { type: 'br' }, { text: 'line two' }] })
    const cl = blocks[3]
    expect(cl.type === 'checklist' && cl.items.map((i) => i.checked)).toEqual([false, true])
  })

  it('treats html as text', () => {
    const b = parseMarkdown('<script>alert(1)</script>')
    expect(b[0]).toEqual({ type: 'paragraph', children: [{ type: 'text', text: '<script>alert(1)</script>' }] })
  })
})

describe('helpers', () => {
  it('isSafeUrl only allows http(s)', () => {
    expect(isSafeUrl('https://a.b')).toBe(true)
    expect(isSafeUrl('data:text/html,x')).toBe(false)
  })

  it('stripMarkdown removes syntax', () => {
    expect(stripMarkdown('## Hi **there**\n- [ ] task')).toBe('Hi there\ntask')
  })

  it('applyFormat wraps selection and toggles prefixes', () => {
    expect(applyFormat('hello world', 6, 11, 'bold')).toEqual({ value: 'hello **world**', start: 8, end: 13 })
    const r = applyFormat('a\nb', 0, 3, 'bullet')
    expect(r.value).toBe('- a\n- b')
    expect(applyFormat(r.value, 0, r.value.length, 'bullet').value).toBe('a\nb')
  })
})
