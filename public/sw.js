const VERSION = 'dev';
const ASSETS = ["./css/style.css","./fonts/nunito-latin.woff2","./icons/apple-touch-icon.png","./icons/favicon-32.png","./icons/favicon.svg","./icons/icon-192.png","./icons/icon-512.png","./icons/maskable-512.png","./index.html","./js/app.js","./js/critters.js","./js/daily.js","./js/figure-kinds.js","./js/figure.js","./js/game.js","./js/gen-client.js","./js/gen-worker.js","./js/icons.js","./js/levels-data.js","./js/nonogram.js","./js/puzzle.js","./js/pwa.js","./js/reveal.js","./js/rng.js","./js/sound.js","./js/store.js","./js/version.js","./manifest.webmanifest"];
const CACHE = `picopals-${VERSION}`;
const DEV = ['localhost', '127.0.0.1'].includes(self.location.hostname);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['./', ...ASSETS].map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('picopals-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function fromNetwork(request) {
  const res = await fetch(request);
  if (res.ok && res.type === 'basic') {
    const cache = await caches.open(CACHE);
    cache.put(request, res.clone());
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fromNetwork(request).catch(() => caches.match('./', { ignoreSearch: true })));
    return;
  }
  if (DEV) {
    event.respondWith(fromNetwork(request).catch(() => caches.match(request, { ignoreSearch: true })));
    return;
  }
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => hit || fromNetwork(request)),
  );
});
