import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { MORE_GROUPS } from '@/app/nav'
import { CenteredHeader, IconTile, Page, SectionLabel, type Tone } from '@/components/ui'

/** One tone per module, matching the record colours used across the app. */
const MODULE_TONE: Record<string, Tone> = {
  '/tasks': 1,
  '/expenses': 2,
  '/study': 3,
  '/reminders': 4,
  '/notes': 5,
  '/photos': 4,
  '/journal': 'accent',
  '/highlights': 'warn',
  '/routines': 'success',
  '/focus': 3,
  '/places': 3,
  '/screen-time': 5,
  '/integrations': 'muted',
  '/settings': 'muted',
}

export default function MorePage() {
  const total = MORE_GROUPS.reduce((n, g) => n + g.items.length, 0)
  return (
    <Page>
      <CenteredHeader title="More" subtitle={`${total} tools and settings`} />
      <div className="flex flex-col gap-2">
        {MORE_GROUPS.map((g) => {
          const single = g.items.length === 1
          return (
            <section key={g.title} aria-labelledby={`more-${g.title}`}>
              <SectionLabel>
                <span id={`more-${g.title}`}>{g.title}</span>
              </SectionLabel>
              <ul className={single ? 'flex flex-col' : 'grid grid-cols-2 gap-2'}>
                {g.items.map(({ to, label, icon, description }) => (
                  <li key={to}>
                    {single ? (
                      <Link
                        to={to}
                        className="flex min-h-[60px] items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-3 py-2.5 transition-colors hover:bg-surface-2"
                      >
                        <IconTile icon={icon} tone={MODULE_TONE[to] ?? 'muted'} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-semibold">{label}</span>
                          {description && <span className="block truncate text-xs text-muted">{description}</span>}
                        </span>
                        <ChevronRight size={16} className="text-faint" aria-hidden />
                      </Link>
                    ) : (
                      <Link
                        to={to}
                        className="flex h-full min-h-[104px] flex-col justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-3 transition-colors hover:bg-surface-2"
                      >
                        <IconTile icon={icon} tone={MODULE_TONE[to] ?? 'muted'} />
                        <span className="min-w-0">
                          <span className="block text-[14px] font-semibold">{label}</span>
                          {description && <span className="line-clamp-2 block text-[11.5px] leading-snug text-muted">{description}</span>}
                        </span>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </Page>
  )
}
