const CACHE_NAME = 'streamheaven-v176';
const urlsToCache = [
  '/',
  '/index.html',
  '/profile.html',
  '/style.css',
  '/script.js',
  '/firebase-auth.js',
  '/manifest.json',
  '/assets/images/logo.png',
  '/assets/images/favicon-square.png',
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
  
  // Use Network-First strategy for our app's static files
  // This guarantees users always get the freshest code instantly on refresh
  const isOurFile = requestUrl.origin === location.origin;

  if (isOurFile) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          // If we got a valid response, cache it for offline use later
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If network fails (offline), try to serve from cache
          return caches.match(event.request);
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
