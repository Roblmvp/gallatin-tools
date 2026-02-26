const CACHE = 'servicebridge-v2';
const PRECACHE = ['/app.html', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/') || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

// ── PUSH NOTIFICATION HANDLER ──────────────────────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return;

  let data = {};
  try { data = e.data.json(); } catch { data = { title: 'ServiceBridge', body: e.data.text() }; }

  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.tag || 'servicebridge',
    data: data.data || {},
    vibrate: [200, 100, 200],
    requireInteraction: false,
    actions: [
      { action: 'view', title: '📊 View Dashboard' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  e.waitUntil(self.registration.showNotification(data.title || 'ServiceBridge', options));
});

// ── NOTIFICATION CLICK ─────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();

  const url = e.notification.data?.url || 'https://servicebridge.vyaxis.com/app.html';

  if (e.action === 'dismiss') return;

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes('servicebridge.vyaxis.com') && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      return clients.openWindow(url);
    })
  );
});
