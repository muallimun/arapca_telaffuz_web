const CACHE_NAME = 'arapca-platform-v2'; // Sürümü v2 yaptık ki eski hatalı önbellek temizlensin
const OFFLINE_URL = '/offline';

const PRECACHE_ASSETS = [
  '/',
  OFFLINE_URL,
  '/manifest.webmanifest'
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
            return caches.delete(cacheName); // Eski v1 önbelleğini siler
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: İstekleri yakala
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Sadece kendi sitemize gelen istekleri önbelleğe al
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.endsWith('.wasm')) return;

  // HTML sayfa istekleri (Navigasyon) için: Network First (Önce internet, yoksa offline sayfası)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(async () => {
          // İnternet yoksa önce tam o sayfanın önbelleği var mı diye bak
          const cache = await caches.open(CACHE_NAME);
          const cachedResponse = await cache.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          // O sayfa önbellekte yoksa bizim özel offline sayfamızı göster
          const offlineResponse = await cache.match(OFFLINE_URL);
          if (offlineResponse) {
            return offlineResponse;
          }
          // Eğer offline sayfası da bulunamazsa basit bir HTML dön (Chrome dinozoru çıkmasın diye)
          return new Response('<h1 style="text-align:center; margin-top:50px;">İnternet Bağlantısı Yok</h1>', {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        })
    );
    return;
  }

  // Statik dosyalar (resimler, sesler, css, js) için: Cache First (Önce önbellek, yoksa internet)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });
        return response;
      });
    })
  );
});