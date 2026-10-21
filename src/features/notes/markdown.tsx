import { Fragment, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { parseMarkdown, type Block, type Inline } from './markdownParse'

/** Render the safe markdown subset as React elements (no innerHTML). */

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    switch (n.type) {
      case 'text':
        return <Fragment key={i}>{n.text}</Fragment>
      case 'bold':
        return <strong key={i} className="font-semibold">{renderInline(n.children)}</strong>
      case 'italic':
        return <em key={i}>{renderInline(n.children)}</em>
      case 'code':
        return (
          <code key={i} className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[0.9em]">
            {n.text}
          </code>
        )
      case 'link':
        return (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
            {renderInline(n.children)}
          </a>
        )
      case 'br':
        return <br key={i} />
    }
  })
}

function renderBlock(b: Block, i: number): ReactNode {
  switch (b.type) {
    case 'heading': {
      const cls = b.level === 1 ? 'text-xl font-semibold' : b.level === 2 ? 'text-lg font-semibold' : 'text-base font-semibold'
      const Tag = (`h${b.level + 1}` as 'h2' | 'h3' | 'h4')
      return (
        <Tag key={i} className={`${cls} mt-1 tracking-tight`}>
          {renderInline(b.children)}
        </Tag>
      )
    }
    case 'paragraph':
      return (
        <p key={i} className="leading-relaxed">
          {renderInline(b.children)}
        </p>
      )
    case 'list':
      return (
        <ul key={i} className="flex list-disc flex-col gap-1 pl-5 marker:text-faint">
          {b.items.map((it, j) => (
            <li key={j}>{renderInline(it)}</li>
          ))}
        </ul>
      )
    case 'checklist':
      return (
        <ul key={i} className="flex flex-col gap-1.5">
          {b.items.map((it, j) => (
            <li key={j} className="flex items-start gap-2">
              <span
                aria-label={it.checked ? 'Done' : 'Not done'}
                className={`mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded-[5px] border ${it.checked ? 'border-accent bg-accent text-on-accent' : 'border-line-strong'}`}
              >
                {it.checked && <Check size={12} strokeWidth={3} />}
              </span>
              <span className={it.checked ? 'text-muted line-through' : undefined}>{renderInline(it.children)}</span>
            </li>
          ))}
        </ul>
      )
  }
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = parseMarkdown(source)
  return <div className={`flex flex-col gap-3 text-[15px] ${className ?? ''}`}>{blocks.map(renderBlock)}</div>
}
