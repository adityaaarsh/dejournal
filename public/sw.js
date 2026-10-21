/*
 * DeJournal service worker.
 *
 * Purpose: show reminder notifications with action buttons and route clicks
 * back to the app. It deliberately does NOT cache or intercept network
 * requests, so it can never serve stale app files.
 */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification
  const data = notification.data || {}
  notification.close()

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const client = windows.find((c) => c.focused) || windows[0]

      if (event.action === 'snooze' || event.action === 'done') {
        if (client) {
          // One client performs the action (avoids running it once per tab).
          client.postMessage({ type: 'reminder-action', action: event.action, id: data.id, date: data.date })
          return
        }
        const q = new URLSearchParams({ raction: event.action, rid: data.id || '', rdate: data.date || '' })
        await self.clients.openWindow('/reminders?' + q.toString())
        return
      }

      const url = data.url || '/'
      if (client) {
        try {
          await client.focus()
        } catch (e) {
          /* focus can fail without a user gesture */
        }
        client.postMessage({ type: 'navigate', url })
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
