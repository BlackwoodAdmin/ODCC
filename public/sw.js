/*
 * Service worker for live-chat phone alerts, used from plain Chrome on the
 * admin's phone (registered with scope /dashboard/ from the Live Chat console).
 * Web Push -> system notification; a tap focuses an open console window or
 * opens one. After the notification is shown, the signed receipt token from
 * the payload is echoed to POST /api/chat/push/receipt so the server knows the
 * alert really reached the phone (a push-service 201 alone does not prove that).
 * Deliberately NO fetch handler: the dashboard must never be served from cache.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === 'string' ? data.title : 'Website visitor waiting';
  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    tag: typeof data.sessionId === 'string' ? data.sessionId : 'chat',
    renotify: true,
    data: { url: typeof data.url === 'string' && data.url.startsWith('/dashboard') ? data.url : '/dashboard/chats' },
  };
  // The receipt confirms the notification was DISPLAYED, so it runs only after
  // showNotification resolves — firing it in parallel would stamp the receipt
  // even when display fails (e.g. Chrome revoked the permission), silently
  // defeating the "last alert unconfirmed" warning.
  const work = self.registration
    .showNotification(title, options)
    .then(() => {
      if (typeof data.receipt === 'string' && data.receipt.length <= 512) {
        return fetch('/api/chat/push/receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ receipt: data.receipt }),
        });
      }
    })
    .catch(() => {});
  event.waitUntil(work);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/dashboard/chats';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes('/dashboard') && 'focus' in client) {
          if ('navigate' in client) client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
