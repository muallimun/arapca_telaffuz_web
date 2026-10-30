const CACHE_NAME = "muallimun-arapca-pwa-v2.0";
const PROTECTED_CACHES = [
  "muallimun-offline-audio-v1",
  "transformers-cache",
];
const OFFLINE_URL = "/offline";

const PRECACHE_ASSETS = [
  "/",
  "/kutuphane",
  "/alistirmalar",
  "/sozluk",
  "/ayarlar",
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/fonts/Arakom.ttf",
  "/audio/manifest.json",
  "/icons/favicon.ico",
  "/icons/favicon-16x16.png",
  "/icons/favicon-32x32.png",
  "/icons/apple-touch-icon.png",
  "/icons/android-chrome-192x192.png",
  "/icons/android-chrome-512x512.png",
];

// Kurulum: Temel rotaları ve kritik statik varlıkları önbelleğe al
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        for (const asset of PRECACHE_ASSETS) {
          try {
            await cache.add(asset);
          } catch (error) {
            console.warn(`Önbelleğe alınamadı: ${asset}`, error);
          }
        }
      })
      .then(() => self.skipWaiting())
  );
});

// Aktivasyon: Yalnızca eski uygulama kabuğu (muallimun-arapca-pwa-*) önbelleklerini temizle;
// çevrimdışı ses paketleri (muallimun-offline-audio-v1) ve Whisper AI model önbelleğini (transformers-cache) koru
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (
              cacheName !== CACHE_NAME &&
              !PROTECTED_CACHES.includes(cacheName) &&
              cacheName.startsWith("muallimun-arapca-pwa-")
            ) {
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch: İstekleri yakala ve çevrimdışı desteği sağla
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Sadece kendi sitemize gelen istekleri önbelleğe al
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api") || url.pathname.endsWith(".wasm")) return;

  // Kısmi ses/medya (Range / HTTP 206 Partial Content) istekleri Cache API'de put() hatası vermesin
  if (request.headers.get("range")) {
    return;
  }

  // HTML sayfa istekleri (Navigasyon) için: Network First (Önce internet, yoksa önbellek veya offline sayfası)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === "basic"
          ) {
            const responseClone = networkResponse.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) =>
                cache.put(event.request, responseClone).catch(() => {})
              );
          }
          return networkResponse;
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
              headers: { "Content-Type": "text/html; charset=utf-8" },
            }
          );
        })
    );
    return;
  }

  // Statik dosyalar (resimler, sesler, fontlar, css, js) için: Cache First
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).then((networkResponse) => {
        // HTTP 206 Partial Content ses yanıtlarını cache.put dışında tut
        if (!networkResponse || networkResponse.status === 206) {
          return networkResponse;
        }
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === "basic"
        ) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone).catch(() => {});
          });
        }
        return networkResponse;
      });
    })
  );
});