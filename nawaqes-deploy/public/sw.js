// =====================================================
// Nawaqes Service Worker — FCM Background Push Notifications
// =====================================================
// This SW MUST stay registered for background push notifications
// to work when the app is closed or in background.
//
// Firebase Messaging (firebase/messaging) automatically registers
// its own SW handler via `getMessaging()`, but we ALSO handle
// `push` and `notificationclick` here as a fallback for browsers
// that don't auto-swizzle, and for APK WebView compatibility.
// =====================================================

// ─── Lifecycle ─────────────────────────────────────────
self.addEventListener('install', (event) => {
  // Activate immediately — don't wait for old SW to release
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Clear old caches (legacy from previous SW versions)
      caches.keys().then(keys =>
        Promise.all(keys.map(k => caches.delete(k)))
      ),
    ])
  );
});

// ─── Push notifications (background) ───────────────────
// Fired when a push message arrives AND the page is closed/background.
// (When the page is foreground, firebase/messaging's onMessage handles it.)
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);

  let payload;
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    try {
      payload = { notification: { title: 'Nawaqes', body: event.data ? event.data.text() : '' } };
    } catch {
      payload = { notification: { title: 'Nawaqes', body: 'إشعار جديد' } };
    }
  }

  // FCM wraps the actual notification in payload.notification or payload.data
  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || data.title || 'Nawaqes';
  const body = notification.body || data.body || 'إشعار جديد';
  const icon = notification.icon || data.icon || '/icons/icon-192.png';
  const badge = notification.badge || data.badge || '/icons/favicon-32.png';
  const tag = data.tag || data.messageId || 'nawaqes-notification';
  const link = data.link || '/';

  const options = {
    body,
    icon,
    badge,
    tag,
    data: { link, ...data },
    requireInteraction: false,
    silent: false,
    // Android vibration pattern
    vibrate: [200, 100, 200],
    // Auto-close after 10 seconds (unless requireInteraction)
    // (browsers handle this differently)
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ─── Notification click — open/focus the app ───────────
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  event.notification.close();

  const link = event.notification.data?.link || '/';
  const targetUrl = link.startsWith('http') ? link : self.location.origin + '/' + (link.replace(/^\/?#\/?/, '#/')).replace(/^\/+/, '');

  // Build the full URL — link may be like '/#/chat-app?chat=xyz'
  let fullUrl;
  if (link.startsWith('http')) {
    fullUrl = link;
  } else if (link.startsWith('/#/')) {
    fullUrl = self.location.origin + link;
  } else if (link.startsWith('#/')) {
    fullUrl = self.location.origin + '/' + link;
  } else if (link.startsWith('/')) {
    fullUrl = self.location.origin + '/#' + link;
  } else {
    fullUrl = self.location.origin + '/#' + link;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if found
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          // Navigate to the target URL
          if ('navigate' in client) {
            client.navigate(fullUrl).catch(() => {});
          }
          return client.focus();
        }
      }
      // Open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(fullUrl);
      }
    })
  );
});

// ─── Fetch (passthrough — no caching) ──────────────────
// We don't intercept fetches — let the browser handle them normally.
// This ensures the app always loads fresh content.
self.addEventListener('fetch', () => {});

// ─── Message from page (for token refresh etc.) ────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
