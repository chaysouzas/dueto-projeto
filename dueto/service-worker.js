const CACHE  = "dueto-v1";
const ASSETS = ["/", "/index.html", "/css/tokens.css", "/css/main.css", "/js/app.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
