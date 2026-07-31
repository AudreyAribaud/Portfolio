const CACHE_NAME = 'portfolio';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/applis.json'
];

// Installe le service worker et met en cache le shell de l'application
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pré-mise en cache du shell');
      return cache.addAll(STATIC_ASSETS);
    }).catch(err => console.error('[Service Worker] Erreur lors de la pré-mise en cache:', err))
  );
});

// Active le SW et supprime les anciens caches obsolètes
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Nettoyage ancien cache:', key);
            return caches.delete(key);
          }
        })
      );
    })()
  );
});

// Stratégie de mise en cache : Cache-First avec repli réseau et mise en cache dynamique (notamment pour les Google Fonts)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Gérer séparément les fichiers locaux et les polices Google Fonts
  const isLocalAsset = url.origin === self.location.origin;
  const isGoogleFont = url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com');

  if (isLocalAsset || isGoogleFont) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Stale-While-Revalidate pour les assets locaux afin de mettre à jour le cache en arrière-plan
          if (isLocalAsset) {
            fetch(event.request).then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
              }
            }).catch(() => {/* ignorer les erreurs réseau en arrière-plan */});
          }
          return cachedResponse;
        }

        // Cache miss : fetch réseau et mise en cache dynamique
        return fetch(event.request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        }).catch(() => {
          // Si hors-ligne et pas en cache, retourner une page d'erreur de base pour les pages HTML
          if (event.request.headers.get('accept').includes('text/html')) {
            return caches.match('/index.html');
          }
        });
      })
    );
  }
});
