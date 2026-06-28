/* SafeStay Hospital Check service worker.
   Caches the app shell + data so the tool works offline, like a native app. */
const CACHE = "safestay-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/fx.js",
  "./data/results.json",
  "./data/web_model.json",
  "./data/facilities.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for our own data/pages (fresh when online, cached when offline);
// cache-first for static assets. Third-party (fonts, three.js, goatcounter) pass through.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  const isData = url.pathname.endsWith(".json") || url.pathname.endsWith(".html") || url.pathname.endsWith("/");
  if (isData) {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
    );
  } else {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
  }
});
