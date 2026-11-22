// Roda antes do React. O painel master mora em licitaflow-master.vercel.app: é um app instalável
// separado (ícone e nome próprios, abre em /master) e guarda um login independente do app do usuário.
// Mesma regra de src/lib/pwa.ts (que cobre as navegações internas). Arquivo próprio por causa da CSP.
(function () {
  var MASTER = 'licitaflow-master.vercel.app';
  var SITE = 'https://licitaflow-prod.vercel.app';
  var HOSTS_SITE = ['licitaflow-prod.vercel.app', 'licitaflow.com.br', 'www.licitaflow.com.br'];
  var host = location.hostname, path = location.pathname, resto = location.search + location.hash;
  var rotaMaster = /^\/master(\/|$)/.test(path);
  if (host === MASTER && path === '/') return location.replace('/master' + resto);
  if (host === MASTER && !rotaMaster) return location.replace(SITE + path + resto);
  if (HOSTS_SITE.indexOf(host) >= 0 && rotaMaster) return location.replace('https://' + MASTER + path + resto);

  var master = rotaMaster;
  // A abertura animada de index.html usa as cores do master.
  if (master) document.documentElement.classList.add('lf-master');
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
