// Tela offline (só ela é armazenada; APIs, sessões e documentos não são cacheados) e notificações push.
const CACHE = 'licitaflow-offline-v3'
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

// Avisos do LicitaFlow por push: aparece na hora, mesmo com o app fechado.
self.addEventListener('push', event => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { titulo: 'LicitaFlow', texto: event.data ? event.data.text() : '' } }
  event.waitUntil(self.registration.showNotification(d.titulo || 'LicitaFlow', {
    body: d.texto || '',
    icon: '/icons/icone-192.png',
    // Ícone pequeno da barra de status (Android): silhueta branca transparente, senão vira um quadrado branco.
    badge: '/icons/badge-96.png',
    tag: d.tag || 'licitaflow-aviso',
    renotify: true,
    vibrate: [200, 100, 200],
    timestamp: Date.now(),
    data: { url: d.url || '/app/avisos' },
  }))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/app/avisos', self.location.origin).href
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
    const aberta = lista.find(c => c.url.startsWith(self.location.origin))
    if (aberta) return aberta.focus().then(c => (c || aberta).navigate(url)).catch(() => self.clients.openWindow(url))
    return self.clients.openWindow(url)
  }))
})
