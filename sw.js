/* Service Worker — Livret de Formation en Psychiatrie — CH Gérard Marchant
   Stratégie :
   - App shell (HTML, manifest, icônes) : mis en cache à l'installation.
   - Document HTML : network-first avec repli sur le cache (toujours à jour en ligne,
     disponible hors connexion).
   - Ressources locales diverses : cache-first.
   - Google Fonts (fonts.googleapis.com / fonts.gstatic.com) : cache-first avec mise en
     cache dynamique, pour que la typographie reste correcte hors connexion après une
     première visite en ligne. En cas d'échec total (jamais visité en ligne), le CSS du
     livret prévoit déjà des polices de secours système (Georgia, system-ui, monospace).
*/

const CACHE_VERSION = 'v2';
const SHELL_CACHE = `livret-psy-chgm-shell-${CACHE_VERSION}`;
const FONTS_CACHE = `livret-psy-chgm-fonts-${CACHE_VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, FONTS_CACHE];

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

// --- Installation : pré-cache de l'app shell ---
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// --- Activation : suppression des anciens caches ---
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => !CURRENT_CACHES.includes(key))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function isGoogleFonts(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1) Google Fonts : cache-first + mise en cache dynamique (cross-origin)
  if (isGoogleFonts(url)) {
    event.respondWith(
      caches.open(FONTS_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request)
            .then(response => {
              cache.put(request, response.clone());
              return response;
            })
            .catch(() => cached); // pas de réseau et jamais mis en cache -> laisse le CSS gérer le repli
        })
      )
    );
    return;
  }

  // 2) Document HTML (navigation) : network-first avec repli sur le cache
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then(cache => cache.put('./index.html', copy));
          return response;
        })
        .catch(() =>
          caches.match('./index.html').then(cached => cached || caches.match(request))
        )
    );
    return;
  }

  // 3) Autres ressources locales (manifest, icônes, etc.) : cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then(cache => cache.put(request, copy));
          return response;
        });
      })
    );
    return;
  }

  // 4) Autres ressources cross-origin non prévues : laisser passer normalement
});
