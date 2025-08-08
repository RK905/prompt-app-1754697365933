// Service Worker for Simple Recipe Book App PWA
// Caches app shell, recipe data, and images with strategies suitable for offline usage

const PRECACHE = 'simple-recipe-book-precache-v1';
const RUNTIME = 'simple-recipe-book-runtime-v1';

const PRECACHE_URLS = [
  '/', // HTML entry
  '/index.html',
  '/offline.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/recipes.json', // local recipe data (if present)
  '/images/placeholder.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Max items to keep in runtime image cache
const IMAGE_CACHE_MAX_ITEMS = 60;

// Utility: limit number of entries in a cache (FIFO)
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    // delete oldest entries until at or below maxItems
    const deletions = keys.slice(0, keys.length - maxItems).map(key => cache.delete(key));
    await Promise.all(deletions);
  }
}

// Install: cache the app shell and offline page
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(PRECACHE)
      .then(cache => {
        console.log('[ServiceWorker] Precaching app shell for Simple Recipe Book App');
        return cache.addAll(PRECACHE_URLS);
      })
  );
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  const expectedCaches = [PRECACHE, RUNTIME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (!expectedCaches.includes(name)) {
            console.log('[ServiceWorker] Removing old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => {
      // Take control of uncontrolled clients immediately
      return self.clients.claim();
    })
  );
});

// Message handler for skipWaiting from page
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch: handle requests with different strategies
self.addEventListener('fetch', event => {
  // Only handle GET requests in the service worker caching strategies
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);

  // Strategy: App shell navigation requests -> network-first, fallback to cached offline page
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // If we get a valid response, update the cache for the app shell (optional)
          return caches.open(PRECACHE).then(cache => {
            cache.put('/index.html', response.clone()).catch(() => {});
            return response;
          });
        })
        .catch(() => {
          return caches.match('/offline.html');
        })
    );
    return;
  }

  // Strategy: Recipe JSON or API endpoints -> network-first with cache fallback
  if (requestUrl.pathname.endsWith('/recipes.json') || requestUrl.pathname.startsWith('/api/recipes')) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          // Save fresh data in runtime cache
          return caches.open(RUNTIME).then(cache => {
            cache.put(event.request, networkResponse.clone()).catch(() => {});
            return networkResponse;
          });
        })
        .catch(() => {
          // On failure, try to serve from cache
          return caches.match(event.request).then(cached => {
            if (cached) return cached;
            // final fallback: offline page
            return caches.match('/offline.html');
          });
        })
    );
    return;
  }

  // Strategy: Images -> cache-first with runtime cache and size limit
  if (requestUrl.pathname.startsWith('/images/') || /\.(png|jpg|jpeg|gif|webp|svg)$/.test(requestUrl.pathname)) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          // Update in background (stale-while-revalidate)
          fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.ok) {
              caches.open(RUNTIME).then(cache => {
                cache.put(event.request, networkResponse).then(() => {
                  trimCache(RUNTIME, IMAGE_CACHE_MAX_ITEMS).catch(() => {});
                }).catch(() => {});
              }).catch(() => {});
            }
          }).catch(() => {});
          return cachedResponse;
        }
        return fetch(event.request)
          .then(networkResponse => {
            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }
            return caches.open(RUNTIME).then(cache => {
              cache.put(event.request, networkResponse.clone()).then(() => {
                trimCache(RUNTIME, IMAGE_CACHE_MAX_ITEMS).catch(() => {});
              }).catch(() => {});
              return networkResponse;
            });
          })
          .catch(() => {
            // If no network and no cache, serve a placeholder image if available
            return caches.match('/images/placeholder.png');
          });
      })
    );
    return;
  }

  // Default strategy: cache-first then network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        return cached;
      }
      return fetch(event.request)
        .then(networkResponse => {
          // Optionally cache other fetched assets in runtime
          return caches.open(RUNTIME).then(cache => {
            // Avoid caching opaque responses (e.g., cross-origin) without CORS headers
            if (networkResponse && networkResponse.status === 200 && networkResponse.type !== 'opaque') {
              cache.put(event.request, networkResponse.clone()).catch(() => {});
            }
            return networkResponse;
          });
        })
        .catch(() => {
          // If request accepts HTML, show offline page
          if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
            return caches.match('/offline.html');
          }
        });
    })
  );
});

// Optional: handle push events to show notifications for new recipes (if push configured)
self.addEventListener('push', event => {
  let data = { title: 'Simple Recipe Book', body: 'New recipe available!', url: '/' };
  try {
    if (event.data) {
      data = Object.assign(data, event.data.json());
    }
  } catch (e) {
    // non-JSON payload
    data.body = event.data ? event.data.text() : data.body;
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification click to focus or open the app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === target && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(target);
      }
    })
  );
});