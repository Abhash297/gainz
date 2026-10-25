const CACHE = 'gainz-v13';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/db.js',
  './js/stats.js',
  './js/nutrition-stats.js',
  './js/foods-data.js',
  './js/ai-estimate.js',
  './js/charts.js',
  './js/app.js',
  './vendor/chart.umd.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first: always prefer the latest files when online so a normal
// reload shows new code immediately; fall back to cache only when offline.
// Only intercept same-origin GET requests — cross-origin calls (e.g. the
// Anthropic API for AI food estimates) and non-GET requests (POST) pass
// straight through untouched; the Cache API can't store non-GET responses.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return;
  }
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
