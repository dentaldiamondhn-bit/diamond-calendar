const CACHE_NAME = 'diamond-link-v4';

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

  // Navigations must always hit the network first: serving a stale cached HTML
  // page can show a signed-out user a previously-cached authenticated route
  // (e.g. /calendario "No autorizado") because the middleware redirect never
  // runs. Fall back to cache only when offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(event.request)
            .then((cached) => cached || new Response('Offline', { status: 503 })),
        ),
    );
    return;
  }

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
    icon: '/Calendar.svg',
    badge: '/Calendar.svg',
    tag: data.type || 'general',
    data: data.metadata || data,
    requireInteraction: true,
    vibrate: [200, 100, 200],
  };

  // Render action buttons (e.g. "Abrir cita") when the payload includes them.
  if (Array.isArray(data.actions) && data.actions.length > 0) {
    options.actions = data.actions;
  } else if (data.type === 'calendar' || data.source === 'event_invitees' || data.eventId) {
    options.actions = [{ action: 'open', title: 'Abrir cita' }];
  }

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

  if (data.url) {
    url = data.url;
  } else if (data.conversationId) {
    url = `/chat?conv=${data.conversationId}`;
  } else if (data.eventId) {
    url = `/calendario?view=day&date=${encodeURIComponent(data.date || '')}&eventId=${data.eventId}`;
  } else if (data.patientId) {
    url = `/menu-navegacion?id=${data.patientId}`;
  }

  // Always handle action button taps (e.g. "Abrir cita") — open the URL.
  if (event.action && event.action !== 'dismiss') {
    url = url || '/calendario';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'NOTIFICATION_CLICKED', data });
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
