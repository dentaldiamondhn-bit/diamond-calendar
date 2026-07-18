// Service Worker for Diamond Link PWA
const CACHE_NAME = 'diamond-link-v2';
const urlsToCache = [
  '/',
  '/dashboard',
  '/calendario',
  '/pacientes',
  '/Logo.svg',
  '/favicon-192.png',
  '/favicon-512.png'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('❌ Failed to cache resources:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('🚀 Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Only cache GET requests - POST requests cannot be cached
          if (event.request.method !== 'GET') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
  );
});

// Push notification event
self.addEventListener('push', (event) => {
  console.log('📬 Push notification received:', event);

  if (!event.data) {
    console.log('❌ Push event has no data');
    return;
  }

  try {
    const data = event.data.json();
    console.log('📬 Push notification data:', data);

    const options = {
      body: data.message || 'Nueva notificación de Diamond Link',
      icon: '/Logo.svg',
      badge: '/Logo.svg',
      tag: data.type || 'general',
      data: data,
      requireInteraction: true
      // Actions are not supported in all browsers
      // actions: [
      //   {
      //     action: 'open',
      //     title: 'Ver',
      //     icon: '/Logo.svg'
      //   },
      //   {
      //     action: 'dismiss',
      //     title: 'Cerrar',
      //     icon: '/Logo.svg'
      //   }
      // ]
    };

    // Add event time to notification body if available
    if (data.metadata?.eventTime || data.metadata?.taskTime) {
      const eventTime = new Date(data.metadata.eventTime || data.metadata.taskTime);
      const formattedTime = eventTime.toLocaleDateString('es-HN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      options.body += ` | ${formattedTime}`;
    }

    event.waitUntil(
      self.registration.showNotification(data.title || 'Diamond Link', options)
    );
  } catch (error) {
    console.error('❌ Error processing push notification:', error);
    
    // Fallback notification
    event.waitUntil(
      self.registration.showNotification('Diamond Link', {
        body: 'Tienes una nueva notificación',
        icon: '/Logo.svg',
        badge: '/Logo.svg',
        tag: 'fallback'
      })
    );
  }
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Notification clicked:', event);

  event.notification.close();

  // Handle different actions (simplified for now)
  if (event.action === 'dismiss') {
    return;
  }

  // Default action - open the app
  event.waitUntil(
    clients.matchAll().then(clientList => {
      // Check if app is already open
      for (const client of clientList) {
        if (client.url === '/' || client.url.includes('/calendario')) {
          // Focus the existing tab
          return client.focus();
        }
      }
      // Open new tab
      return clients.openWindow('/calendario');
    })
  );
});

// Notification close event
self.addEventListener('notificationclose', (event) => {
  console.log('🔕 Notification closed:', event);
});

// Background sync for calendar events
self.addEventListener('sync', (event) => {
  if (event.tag === 'calendar-sync') {
    console.log('🔄 Background sync for calendar events');
    event.waitUntil(syncCalendarEvents());
  }
});

// Sync calendar events function
async function syncCalendarEvents() {
  try {
    // This would sync any pending calendar changes
    console.log('📅 Syncing calendar events in background');
  } catch (error) {
    console.error('❌ Error syncing calendar events:', error);
  }
}

// Periodic background sync for reminders
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'calendar-reminders') {
    console.log('⏰ Periodic sync for calendar reminders');
    event.waitUntil(checkReminders());
  }
});

// Check for upcoming reminders
async function checkReminders() {
  try {
    // This would check for upcoming reminders and show notifications
    console.log('🔔 Checking for upcoming reminders');
  } catch (error) {
    console.error('❌ Error checking reminders:', error);
  }
}
