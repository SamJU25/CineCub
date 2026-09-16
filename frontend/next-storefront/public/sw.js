const CACHE_NAME = 'cinecub-v1';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/llms.txt',
  '/favicon.ico',
  '/assets/images/favicon-48x48.png',
  '/assets/images/favicon-32x32.png',
  '/assets/images/favicon-16x16.png',
  '/assets/images/favicon-192x192.png',
  '/assets/images/favicon-512x512.png',
  '/assets/images/app-logo.png',
  '/assets/images/favicon-square.png',
  '/assets/images/icon-logo.png',
  '/assets/images/logo-icon.png',
  '/assets/avatars/av_1.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await Promise.allSettled(
        urlsToCache.map(url => cache.add(url).catch(err => console.warn('[SW] Failed to pre-cache:', url, err)))
      );
    })
  );
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  
  const isOurStaticFile = requestUrl.origin === location.origin &&
    !requestUrl.pathname.startsWith('/api/') &&
    !requestUrl.pathname.startsWith('/_next/') &&
    !requestUrl.pathname.startsWith('/m3u8-proxy') &&
    !requestUrl.pathname.startsWith('/ts-proxy') &&
    !requestUrl.pathname.endsWith('.apk');

  if (isOurStaticFile && event.request.method === 'GET') {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
  }
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.filter(name => name !== CACHE_NAME)
            .map(name => caches.delete(name))
        );
      })
    ])
  );
});
