const CACHE_NAME = 'arapca-platform-v3';
const OFFLINE_URL = '/offline';

const PRECACHE_ASSETS = [
  '/',
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/android-chrome-192x192.png',
  '/icons/android-chrome-512x512.png',
  '/icons/favicon.ico'
];

// Kurulum: Temel dosyaları önbelleğe al (Hata olsa bile diğerlerini almaya devam et)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of PRECACHE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (error) {
          console.warn(`Önbelleğe alınamadı: ${asset}`, error);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

// Aktivasyon: Eski önbellekleri temizle
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: İstekleri yakala
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Sadece kendi sitemize gelen istekleri önbelleğe al
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.endsWith('.wasm')) return;

  // Kısmi ses/medya (Range / 206 Partial Content) istekleri Cache API'de put() hatası vermesin
  if (request.headers.get('range')) {
    return;
  }

  // HTML sayfa istekleri (Navigasyon) için: Network First (Önce internet, yoksa offline sayfası)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const cachedResponse = await cache.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          const offlineResponse = await cache.match(OFFLINE_URL);
          if (offlineResponse) {
            return offlineResponse;
          }
          return new Response(
            '<h1 style="text-align:center; margin-top:50px; font-family:sans-serif;">Çevrimdışı Mod — Lütfen internet bağlantınızı kontrol edin.</h1>',
            {
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            }
          );
        })
    );
    return;
  }

  // Statik dosyalar (resimler, sesler, css, js) için: Cache First
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).then((response) => {
        if (
          !response ||
          response.status !== 200 ||
          response.status === 206 ||
          response.type !== 'basic'
        ) {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache).catch(() => {});
        });
        return response;
      });
    })
  );
});