// Tela offline (só ela é armazenada; APIs, sessões e documentos não são cacheados) e notificações push.
const CACHE = 'licitaflow-offline-v4'
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/offline.html', '/offline.js'])))
  self.skipWaiting()
})
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('licitaflow-offline-') && k !== CACHE).map(k => caches.delete(k)))),
    self.clients.claim(),
  ]))
})
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (url.origin === self.location.origin && url.pathname === '/offline.js') {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match('/offline.js')) || fetch(event.request)))
    return
  }
  if (event.request.mode === 'navigate' && new URL(event.request.url).origin === self.location.origin) {
    event.respondWith((async () => {
      const controller = new AbortController()
      const limite = setTimeout(() => controller.abort(), 12000)
      try {
        const resposta = await fetch(event.request, { signal: controller.signal, cache: 'no-cache' })
        if (resposta.status >= 500) throw new Error('Serviço indisponível')
        return resposta
      } catch {
        const cache = await caches.open(CACHE)
        return (await cache.match('/offline.html')) || new Response('Sem conexão. Tente novamente.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      } finally { clearTimeout(limite) }
    })())
  }
})

// Nome que aparece no topo de toda notificação (trocar aqui quando virar LicitaForce).
const NOME_APP = 'LicitaForce'

// Avisos por push: aparece na hora, mesmo com o app fechado. Estilo "app de mensagens": o título é
// sempre o nome do app e o assunto do aviso vem no corpo, antes do texto.
self.addEventListener('push', event => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { texto: event.data ? event.data.text() : '' } }
  const titulo = String(d.titulo || '').trim()
  const texto = String(d.texto || '').trim()
  const corpo = titulo && titulo !== NOME_APP ? (texto ? `${titulo}: ${texto}` : titulo) : texto
  event.waitUntil(Promise.all([
    self.registration.showNotification(NOME_APP, {
      body: corpo,
      // Som do sistema (o "ping" do celular/computador). A Web Push não deixa escolher um arquivo de som.
      silent: false,
      icon: '/icons/icone-192.png',
      // Ícone pequeno da barra de status (Android): silhueta branca transparente, senão vira um quadrado branco.
      badge: '/icons/badge-96.png',
      tag: d.tag || 'licitaforce-aviso',
      renotify: true,
      vibrate: [200, 100, 200],
      timestamp: Date.now(),
      data: { url: d.url || '/app/avisos' },
    }),
    // Com o app aberto na tela, ele mesmo toca o som escolhido no aviso (src/lib/ping.ts, chamado em src/main.tsx).
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(lista => lista.forEach(c => c.postMessage({ tipo: 'push-ping', som: d.som || 'principal' }))).catch(() => undefined),
  ]))
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
