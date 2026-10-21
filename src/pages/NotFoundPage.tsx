import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Page, PageHeader, EmptyState } from '@/components/ui'

export default function NotFoundPage() {
  return (
    <Page>
      <PageHeader title="Page not found" />
      <EmptyState
        icon={Compass}
        title="That page doesn't exist"
        action={
          <Link className="text-accent hover:underline" to="/">
            Go to Today
          </Link>
        }
      />
    </Page>
  )
}
