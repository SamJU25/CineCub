const CACHE_NAME = 'streamheaven-cache-v60';
const urlsToCache = [
  '/',
  '/index.html',
  '/profile.html',
  '/style.css',
  '/script.js',
  '/firebase-auth.js',
  '/manifest.json',
  '/assets/images/logo.png',
  '/assets/images/icon-logo.png',
  '/assets/avatars/av_1.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  const isStatic = urlsToCache.includes(requestUrl.pathname);

  if (isStatic) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, networkResponse.clone());
          });
          return networkResponse;
        });
        return cachedResponse || fetchPromise;
      })
    );
  } else {
    event.respondWith(fetch(event.request));
  }
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );
});
