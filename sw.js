const cacheName = 'setmark-pwa-v41';
const shell = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./install/",
  "./install/index.html",
  "./install/install-step-1.jpg",
  "./install/install-step-2.jpg",
  "./install/install-step-3.jpg",
  "./install/install-step-4.jpg",
  "./install/install-step-share.jpg",
  "./install/style.css",
  "./main/app.js",
  "./main/exercise-guide.js",
  "./main/burnfit-guides.js",
  "./main/exercise-guide.css",
  "./main/catalog.js",
  "./main/icon-192.png",
  "./main/icon.png",
  "./main/launch.js",
  "./main/poses.js",
  "./main/style.css"
];
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
