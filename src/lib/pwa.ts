/** Aponta o manifesto, o ícone e a cor para o app do painel atual (ver public/pwa.js). */
export function usarAppDoPainel(master: boolean) {
  const trocar = (seletor: string, attr: 'href' | 'content', valor: string) => {
    const el = document.head.querySelector(seletor)
    if (el && el.getAttribute(attr) !== valor) el.setAttribute(attr, valor)
  }
  trocar('link[rel="manifest"]', 'href', master ? '/master.webmanifest' : '/manifest.webmanifest')
  trocar('link[rel="apple-touch-icon"]', 'href', master ? '/icons/master-192.png' : '/icons/app-192.png')
  trocar('meta[name="apple-mobile-web-app-title"]', 'content', master ? 'LF Master' : 'LicitaFlow')
  trocar('meta[name="theme-color"]', 'content', master ? '#09090b' : '#0f172a')
}
