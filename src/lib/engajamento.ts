// Rastreio do aparelho para o master: app instalado, permissão de notificações e push ativo.
// O banco (registrar_aparelho) só grava um evento quando algo muda.
import { supabase } from '@/lib/supabase'
import { descreverAparelho, estadoPush, pushSuportado } from '@/lib/push'

const CHAVE = 'lf-aparelho-id'

/** Identificador aleatório deste navegador (não identifica a pessoa; só separa os aparelhos dela). */
export function idAparelho() {
  try {
    let id = localStorage.getItem(CHAVE)
    if (!id || !/^[A-Za-z0-9-]{8,64}$/.test(id)) {
      id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
      localStorage.setItem(CHAVE, id)
    }
    return id
  } catch { return null }
}

export const emAplicativo = () => typeof window !== 'undefined'
  && (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

async function appInstalado() {
  if (emAplicativo()) return true
  const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<{ platform: string }[]> }
  try { return !!(await nav.getInstalledRelatedApps?.())?.some(a => a.platform === 'webapp') } catch { return false }
}

/** Envia o estado atual deste aparelho. `instalado` força verdadeiro (evento appinstalled). */
export async function registrarAparelho(instalado = false) {
  const id = idAparelho()
  if (!id) return
  const [inst, push] = await Promise.all([instalado ? Promise.resolve(true) : appInstalado(), estadoPush().catch(() => 'inativo' as const)])
  const permissao = pushSuportado() ? Notification.permission : 'sem-suporte'
  await supabase.rpc('registrar_aparelho', { p_aparelho: id, p_instalado: inst, p_permissao: permissao, p_push: push === 'ativo', p_plataforma: descreverAparelho(navigator.userAgent) })
}
