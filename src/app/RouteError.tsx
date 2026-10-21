import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { ErrorState } from '@/components/ui/States'

export function RouteError() {
  const err = useRouteError()
  const msg = isRouteErrorResponse(err) ? `${err.status} ${err.statusText}` : err instanceof Error ? err.message : 'Something went wrong.'
  console.error(err)
  return (
    <div className="mx-auto max-w-md p-6 pt-20">
      <ErrorState message={`DeJournal hit an error: ${msg}`} onRetry={() => window.location.reload()} />
    </div>
  )
}
