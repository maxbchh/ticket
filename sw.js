const CACHE_NAME = "ticket-pwa-v41";
const APP_SHELL = [
  "./", "./index.html", "./manifest.webmanifest", "./cloud-sync.js",
  "./qr-sales.js", "./qr-pay.html", "./qr-ticket.html", "./card-terminal.html",
  "./route-payment-qr.js", "./buffet-design.js", "./buffet-cashier.js",
  "./shift-sync.js", "./report.js", "./card-bridge.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request).then(cached => cached || caches.match("./index.html")))
  );
});
