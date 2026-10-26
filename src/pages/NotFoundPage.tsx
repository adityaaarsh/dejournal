import { Link } from 'react-router-dom'
import { Compass, Sun } from 'lucide-react'
import { CenteredHeader, IconTile, Page } from '@/components/ui'

export default function NotFoundPage() {
  return (
    <Page>
      <CenteredHeader title="Page not found" subtitle="That page doesn't exist" />
      <div className="mt-6 flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-6 py-10 text-center">
        <IconTile icon={Compass} tone="muted" size="lg" />
        <p className="text-[15px] font-semibold">Nothing lives at this address</p>
        <p className="max-w-xs text-[13px] text-muted">The link may be old or mistyped. Your journal is safe.</p>
        <Link
          to="/"
          className="mt-2 inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[14px] font-semibold text-on-accent hover:bg-accent-strong"
        >
          <Sun size={17} aria-hidden /> Go to Today
        </Link>
      </div>
    </Page>
  )
}
