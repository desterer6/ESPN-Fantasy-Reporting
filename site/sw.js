// Service worker: makes the site installable and lets it open with no signal.
// Network first for everything, so visitors always get the latest scores and code when online;
// the cached copy is only used when the network is unavailable.
const CACHE = 'league-report-v3';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/theme.js', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // cache: 'no-cache' revalidates with the server every time (a cheap 304 when unchanged),
  // so a new deploy shows up on the next page load.
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
