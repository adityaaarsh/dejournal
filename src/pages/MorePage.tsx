import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { MORE_GROUPS } from '@/app/nav'
import { Page, PageHeader } from '@/components/ui'

export default function MorePage() {
  return (
    <Page>
      <PageHeader title="More" />
      <div className="flex flex-col gap-6">
        {MORE_GROUPS.map((g) => (
          <section key={g.title} aria-labelledby={`more-${g.title}`}>
            <h2 id={`more-${g.title}`} className="mb-2 px-1 text-xs font-semibold tracking-wider text-faint uppercase">
              {g.title}
            </h2>
            <ul className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {g.items.map(({ to, label, icon: Icon, description }, i) => (
                <li key={to} className={i ? 'border-t border-line' : undefined}>
                  <Link to={to} className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-muted">
                      <Icon size={18} strokeWidth={1.8} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium">{label}</span>
                      {description && <span className="block truncate text-xs text-muted">{description}</span>}
                    </span>
                    <ChevronRight size={16} className="text-faint" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Page>
  )
}
