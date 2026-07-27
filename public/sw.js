const CACHE_NAME = 'diamond-link-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) return caches.delete(name);
        }),
      ),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/')) return;
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') return response;
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        return response;
      });
    }).catch(() => new Response('Offline', { status: 503 })),
  );
});

self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data?.json() || {};
  } catch {
    data = { title: 'Diamond Calendar', message: event.data?.text() || '' };
  }

  // Timezone helper for Honduras (UTC-6)
  const formatHondurasTime = (dateInput) => {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '';

    // Subtract 6 hours from UTC
    const localDate = new Date(date.getTime() - (6 * 60 * 60 * 1000));

    const hours = localDate.getUTCHours();
    const minutes = String(localDate.getUTCMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;

    return `${hours12}:${minutes} ${ampm}`;
  };

  const options = {
    body: data.message || data.body || 'Nueva notificación',
    icon: '/Logo.svg',
    badge: '/Logo.svg',
    tag: data.type || 'general',
    data: data.metadata || data,
    requireInteraction: true,
    vibrate: [200, 100, 200],
  };

  const hasTimeInBody = options.body.includes(' AM') || options.body.includes(' PM') || /\d{1,2}:\d{2}/.test(options.body);
  const rawTime = data.metadata?.eventTime || data.metadata?.taskTime || data.metadata?.itemTime;

  if (rawTime && !hasTimeInBody) {
    const formattedTime = formatHondurasTime(rawTime);
    if (formattedTime) {
      options.body += ` | ${formattedTime}`;
    }
  }

  event.waitUntil(self.registration.showNotification(data.title || 'Diamond Calendar', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let url = '/';

  if (data.eventId || data.conversationId) {
    url = data.conversationId ? `/chat?conv=${data.conversationId}` : '/calendario';
  } else if (data.patientId) {
    url = `/menu-navegacion?id=${data.patientId}`;
  } else if (data.url) {
    url = data.url;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'NOTIFICATION_CLICKED', data });
          return client.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
