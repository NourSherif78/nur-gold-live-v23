// Gold Live Dashboard - Service Worker for PWA (Android & iOS)
const CACHE_NAME = "gold-pwa-v23-3";
const PRECACHE_ASSETS = [
  "/",
  "/style.css?v=23.2.0",
  "/app.js?v=23.2.0",
  "/goldAnalytics.js?v=23.2.0",
  "/logo.jpg",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/icon.svg"
];

// Install Event - Pre-cache core shell
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("PWA precache error:", err);
      });
    })
  );
});

// Activate Event - Clean up stale caches and claim clients immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Network-first for dynamic data & sockets, Cache fallback for offline shell
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept or cache WebSocket/Socket.IO or Admin API requests
  if (
    url.pathname.startsWith("/socket.io/") ||
    url.pathname.startsWith("/api/") ||
    event.request.method !== "GET"
  ) {
    return;
  }

  // Network-first strategy for everything else
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and store successful GET responses in cache
        if (response && response.status === 200 && response.type === "basic") {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, resClone);
          });
        }
        return response;
      })
      .catch(async () => {
        // If network offline, serve from cache
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") {
          return caches.match("/");
        }
        return new Response("Offline", { status: 503, statusText: "Offline" });
      })
  );
});
