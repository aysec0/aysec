/* aysec service worker — installable PWA + offline shell.
 * Strategy: network-first for everything, cache as a fallback so the app
 * still loads when offline. API + upload URLs are always network (no cache).
 */
const CACHE = 'aysec-v2';

const PRECACHE = [
  '/',
  '/offline.html',
  '/css/styles.css',
  '/js/api.js',
  '/js/layout.js',
  '/js/theme.js',
  '/img/favicon.svg',
  '/img/og.svg',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Always-network: API, uploads, SSE streams, auth probes
  if (url.pathname.startsWith('/api/'))     return;
  if (url.pathname.startsWith('/uploads/')) return;

  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      // Cache successful static responses for offline fallback
      if (fresh.ok && shouldCache(url)) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch {
      const cached = await caches.match(req);
      if (cached) return cached;
      // Last-resort offline page for navigations
      if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
        return caches.match('/offline.html');
      }
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});

function shouldCache(url) {
  const p = url.pathname;
  return p.endsWith('.css') || p.endsWith('.js') || p.endsWith('.svg') ||
         p.endsWith('.png') || p.endsWith('.webp') || p.endsWith('.woff2') ||
         p.endsWith('.html') || p === '/' || p.startsWith('/img/');
}
