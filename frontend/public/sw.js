/*
 * Service worker for media_tool.
 *
 * Scope is deliberately tiny. This app holds one person's private photos, videos and
 * documents, so nothing that belongs to a signed-in session is ever written to the cache:
 * no HTML, no /api responses, no media files. Only build-hashed static assets and the app
 * icons are stored, and those are immutable and carry no personal data.
 *
 * Bump CACHE_VERSION to evict everything on the next activation.
 */
const CACHE_VERSION = 'v1';
const STATIC_CACHE = `media-tool-static-${CACHE_VERSION}`;

/** Only these prefixes are cacheable. Anything else goes straight to the network. */
const CACHEABLE_PREFIXES = ['/_next/static/', '/icons/'];

self.addEventListener('install', () => {
  // Nothing to precache: the prefixes above are hashed per build, so their URLs are not
  // known ahead of time. Taking over immediately avoids a stale worker lingering.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!CACHEABLE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      // Opaque and error responses are not worth keeping, and caching a 404 would pin it.
      if (response.ok && response.type === 'basic') {
        cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
