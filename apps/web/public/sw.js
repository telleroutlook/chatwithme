// Service Worker for offline support
const CACHE_NAME = 'chatwithme-v2';
const OFFLINE_CACHE = 'chatwithme-offline-v2';

// Assets to cache immediately on install
const STATIC_ASSETS = [
  '/',
  '/favicon.svg',
];

// API routes that should use network-first strategy
const API_ROUTES = ['/api/'];

// Routes that need network-first (critical resources)
const NETWORK_FIRST_ROUTES = ['/assets/', '/build/', '/public/', '/lib/'];

// Stale-While-Revalidate strategy for static assets
// Returns cached response immediately if available, then updates cache in background
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  // Fetch in background to update cache
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => null); // Silently fail for background fetch

  // Return cached response immediately if available
  if (cachedResponse) {
    return cachedResponse;
  }

  // If no cache, wait for network
  try {
    return await fetchPromise;
  } catch (error) {
    // Return offline fallback for HTML requests
    if (request.headers.get('accept')?.includes('text/html')) {
      const offlineCache = await caches.open(OFFLINE_CACHE);
      const offlinePage = await offlineCache.match('/offline');
      if (offlinePage) {
        return offlinePage;
      }
    }
    throw error;
  }
}

// Network-first strategy for critical assets (JS, CSS, API calls)
// Always tries network first, falls back to cache on error
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      // Update cache with fresh response
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Network failed, try cache as fallback
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      console.log('[SW] Network failed, using cache for:', request.url);
      return cachedResponse;
    }
    throw error;
  }
}

// Determine which strategy to use based on the request
function getCacheStrategy(request) {
  const url = new URL(request.url);

  // Use network-first for API routes
  if (API_ROUTES.some(route => url.pathname.startsWith(route))) {
    return 'network-first';
  }

  // Use network-first for critical assets (JS, CSS with hashes)
  if (NETWORK_FIRST_ROUTES.some(route => url.pathname.startsWith(route))) {
    return 'network-first';
  }

  // Use stale-while-revalidate for other static assets
  return 'stale-while-revalidate';
}

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
      caches.open(OFFLINE_CACHE).then((cache) => cache.add('/offline.html')),
    ])
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== OFFLINE_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - handle requests with appropriate strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other protocols
  if (!request.url.startsWith('http')) return;

  const strategy = getCacheStrategy(request);

  if (strategy === 'network-first') {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});

// Message event - handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(event.data.urls);
      })
    );
  }
});
