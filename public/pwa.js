// Escolhe o aplicativo instalável antes do React carregar: o painel master é um app à parte
// (ícone e nome próprios, abre direto em /master); o restante instala o app do usuário.
// Arquivo próprio para permitir CSP sem 'unsafe-inline'. src/lib/pwa.ts repete a troca em navegações internas.
(function () {
  var master = /^\/master(\/|$)/.test(location.pathname);
  var head = document.head;
  function link(rel, href) {
    var el = document.createElement('link');
    el.rel = rel; el.href = href; head.appendChild(el);
  }
  function meta(name, content) {
    var el = document.createElement('meta');
    el.name = name; el.content = content; head.appendChild(el);
  }
  link('manifest', master ? '/master.webmanifest' : '/manifest.webmanifest');
  link('apple-touch-icon', master ? '/icons/master-192.png' : '/icons/app-192.png');
  meta('apple-mobile-web-app-title', master ? 'LF Master' : 'LicitaFlow');
  meta('theme-color', master ? '#09090b' : '#0f172a');
})();
