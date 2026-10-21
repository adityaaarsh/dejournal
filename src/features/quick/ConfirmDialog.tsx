import { useState } from 'react'
import { Button, Sheet } from '@/components/ui'
import type { DialogProps } from './DialogHost'

export function ConfirmDialog({ request, onClose }: DialogProps<'confirm'>) {
  const [busy, setBusy] = useState(false)
  return (
    <Sheet
      title={request.title}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={request.destructive ? 'danger' : 'primary'}
            loading={busy}
            autoFocus
            onClick={async () => {
              setBusy(true)
              try {
                await request.onConfirm()
              } finally {
                setBusy(false)
                onClose()
              }
            }}
          >
            {request.confirmLabel ?? 'Confirm'}
          </Button>
        </>
      }
    >
      {request.message && <p className="text-sm leading-relaxed text-muted">{request.message}</p>}
    </Sheet>
  )
}
