const cacheName = 'setmark-pwa-v5';
const shell = ['./', './index.html', './launch.js', './app.js', './catalog.js', './style.css', './manifest.webmanifest', './icon.png', './icon-192.png', './poses.js',
  './install-step-1.jpg', './install-step-2.jpg', './install-step-3.jpg', './install-step-4.jpg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(shell.map(url => new Request(url, {cache: 'reload'})))));
});
self.addEventListener('message', event => {
  if (event.data === 'apply-update') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('setmark-pwa-') && key !== cacheName) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !shell.some(path => new URL(path, self.registration.scope).href === event.request.url)) return;
  event.respondWith(caches.open(cacheName).then(async cache => (await cache.match(event.request)) || fetch(event.request)));
});
