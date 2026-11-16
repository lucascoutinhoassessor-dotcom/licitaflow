// Apenas a tela pública offline é armazenada. APIs, sessões e documentos não são cacheados.
const CACHE = 'licitaflow-offline-v1'
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add('/offline.html')))
  self.skipWaiting()
})
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('licitaflow-offline-') && k !== CACHE).map(k => caches.delete(k)))),
    self.clients.claim(),
  ]))
})
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate' && new URL(event.request.url).origin === self.location.origin) {
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')))
  }
})
