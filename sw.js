// Offline shell. Trip data is NOT cached here (localStorage + Firestore's own
// offline cache handle that) — this only keeps the app itself loadable with
// no signal. Same-origin files are network-first so a redeploy shows up on
// the next open instead of one load later; the Firebase SDK is cache-first.
const CACHE = 'hawks-cup-v14';
const ASSETS = [
  './', './index.html', './styles.css', './firebase-config.js',
  './data.js', './engine.js', './store.js', './derive.js', './sync.js',
  './actions.js', './render.js', './main.js',
  './manifest.webmanifest', './logo.png', './icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const firebaseSdk = url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0;
  if (!sameOrigin && !firebaseSdk) return; // Firestore traffic etc. goes straight through

  if (firebaseSdk) {
    event.respondWith(caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }

  event.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
