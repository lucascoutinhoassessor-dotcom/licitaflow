import { emAppInstalado } from './pwa'

const chave = () => `lf-app-instalado-${location.pathname.startsWith('/master') ? 'master' : 'usuario'}`

/** Evidência local de instalação; nunca é compartilhada com outros aparelhos da conta. */
export function instalacaoLembrada() {
  if (emAppInstalado()) return true
  try { return localStorage.getItem(chave()) === '1' } catch { return false }
}

export function lembrarInstalacao(instalado: boolean) {
  try {
    if (instalado) localStorage.setItem(chave(), '1')
    else localStorage.removeItem(chave())
  } catch { /* armazenamento indisponível */ }
}

export async function appJaInstalado() {
  if (emAppInstalado()) { lembrarInstalacao(true); return true }
  const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<{ platform: string; url?: string; id?: string }[]> }
  try {
    const manifesto = new URL(location.pathname.startsWith('/master') ? '/master.webmanifest' : '/manifest.webmanifest', location.href).href
    const apps = await nav.getInstalledRelatedApps?.()
    if (apps?.some(a => a.platform === 'webapp' && a.url && new URL(a.url, location.href).href === manifesto)) lembrarInstalacao(true)
  } catch { /* usa a última evidência quando a consulta não está disponível */ }
  return instalacaoLembrada()
}
