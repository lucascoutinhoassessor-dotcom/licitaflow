/**
 * O painel master mora num endereço próprio (HOST_MASTER) para ser um app instalável separado
 * e ter login independente do app do usuário (cada endereço guarda a sua sessão).
 * public/pwa.js repete esta regra antes do React carregar; aqui ela vale para navegações internas.
 */
export const HOST_SITE = 'licitaforce-app.vercel.app'
export const HOST_MASTER = 'licitaforce-master.vercel.app'
export const URL_SITE = `https://${HOST_SITE}`
/** Endereços de produção do app do usuário. Os antigos (marca LicitaFlow) levam ao novo. Prévias e localhost não redirecionam. */
const HOSTS_SITE = [HOST_SITE, 'licitaflow-prod.vercel.app']
/** Endereços do painel master. Os que não forem HOST_MASTER levam a ele. */
const HOSTS_MASTER = [HOST_MASTER, 'licitaflow-master.vercel.app']

const ehRotaMaster = (path: string) => /^\/master(\/|$)/.test(path)

/** Aberto pelo ícone do app instalado (não pela aba do navegador). */
export const emAppInstalado = () => typeof window !== 'undefined' && (
  (navigator as Navigator & { standalone?: boolean }).standalone === true
  || ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].some(m => window.matchMedia?.(`(display-mode: ${m})`).matches))

/** App instalado pelo endereço antigo (marca LicitaFlow): continua nele e pede para instalar o novo. */
export const appAntigo = () => emAppInstalado() && [...HOSTS_SITE, ...HOSTS_MASTER].includes(location.hostname)
  && location.hostname !== HOST_SITE && location.hostname !== HOST_MASTER

/**
 * URL completa para onde ir quando o caminho pertence ao outro endereço; null se já está no certo.
 * `instalado`: no app instalado pelo endereço antigo não troca de endereço (o Android mostraria a barra do navegador).
 */
export function enderecoCorreto(host: string, path: string, resto = '', instalado = false): string | null {
  if (HOSTS_MASTER.includes(host)) {
    if (!ehRotaMaster(path)) return path === '/' ? null : `${URL_SITE}${path}${resto}` // pwa.js leva "/" para /master
    return host === HOST_MASTER || instalado ? null : `https://${HOST_MASTER}${path}${resto}`
  }
  if (!HOSTS_SITE.includes(host)) return null
  if (ehRotaMaster(path)) return `https://${HOST_MASTER}${path}${resto}`
  return host === HOST_SITE || instalado ? null : `${URL_SITE}${path}${resto}`
}

/** Endereço do painel master (absoluto em produção, relativo em desenvolvimento e prévias). */
export function urlMaster(path = '/master') {
  return HOSTS_SITE.includes(location.hostname) ? `https://${HOST_MASTER}${path}` : path
}

/** O master está num endereço separado do app do usuário (produção). */
export const masterSeparado = () => HOSTS_MASTER.includes(location.hostname) || HOSTS_SITE.includes(location.hostname)

/** Aponta o manifesto, o ícone e a cor para o app do painel atual (ver public/pwa.js). */
export function usarAppDoPainel(master: boolean) {
  const trocar = (seletor: string, attr: 'href' | 'content', valor: string) => {
    const el = document.head.querySelector(seletor)
    if (el && el.getAttribute(attr) !== valor) el.setAttribute(attr, valor)
  }
  trocar('link[rel="manifest"]', 'href', master ? '/master.webmanifest' : '/manifest.webmanifest')
  trocar('link[rel="apple-touch-icon"]', 'href', master ? '/icons/master-192.png' : '/icons/icone-192.png')
  trocar('meta[name="apple-mobile-web-app-title"]', 'content', master ? 'LF Master' : 'LicitaForce')
  trocar('meta[name="theme-color"]', 'content', master ? '#09090b' : '#0f172a')
}
