// Notificações push neste aparelho (lado do cliente). O envio é feito por api/push.js.
import { supabase } from '@/lib/supabase'
import { emAppInstalado } from '@/lib/pwa'

export type EstadoPush = 'ativo' | 'inativo' | 'negado' | 'sem-suporte'

export const pushSuportado = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** No iPhone o push só existe com o app instalado na Tela de Início. */
export const precisaInstalar = () =>
  typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) && !emAppInstalado()

/** Permissão e inscrição são estados diferentes: uma falha de rede não revoga a permissão. */
export const notificacoesPermitidas = () => typeof Notification !== 'undefined' && Notification.permission === 'granted'

export function devePedirNotificacoes(estado: EstadoPush, instalado: boolean) {
  if (notificacoesPermitidas() || estado === 'ativo') return false
  return estado === 'inativo' || estado === 'negado' || (estado === 'sem-suporte' && precisaInstalar() && !instalado)
}

export function chaveParaBytes(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const bruto = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bruto, c => c.charCodeAt(0))
}

async function chamar(corpo: object) {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Entre na sua conta')
  const r = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify(corpo) })
  const json = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(json.error || 'Não foi possível concluir agora')
  return json
}

async function registro() {
  return (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }))
}

export async function estadoPush(): Promise<EstadoPush> {
  if (!pushSuportado()) return 'sem-suporte'
  if (Notification.permission === 'denied') return 'negado'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'ativo' : 'inativo'
}

/** Pede a permissão do sistema, inscreve o aparelho e mostra uma notificação de confirmação. */
export async function ativarPush(): Promise<EstadoPush> {
  if (!pushSuportado()) return 'sem-suporte'
  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') return permissao === 'denied' ? 'negado' : 'inativo'
  return inscreverPush(true)
}

/** Recupera a inscrição sem abrir o pedido de permissão nem exibir confirmação no login. */
async function inscreverPush(confirmar: boolean): Promise<EstadoPush> {
  const r = await fetch('/api/push', { cache: 'no-store' })
  if (!r.ok) throw new Error('Não foi possível ativar agora')
  const { chave } = await r.json()
  const reg = await registro()
  await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  // Inscrição feita com outra chave (ex.: chaves trocadas no servidor) não recebe nada: refaz.
  const atual = sub?.options.applicationServerKey
  if (sub && atual && btoa(String.fromCharCode(...new Uint8Array(atual))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== chave) { await sub.unsubscribe(); sub = null }
  sub = sub || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chave) }))
  await chamar({ acao: 'inscrever', inscricao: sub.toJSON() })
  if (confirmar) reg.showNotification('Notificações ativadas', { body: 'Avisos das suas IAs e comunicados do LicitaForce chegam aqui, mesmo com o app fechado. Configure em Agentes de IA.', icon: '/icons/icone-192.png', badge: '/icons/badge-96.png', tag: 'licitaforce-ativado' }).catch(() => undefined)
  return 'ativo'
}

/**
 * Ao entrar: se este aparelho já está inscrito, regrava a inscrição para a conta atual (o servidor pode ter
 * apagado uma inscrição vencida, ou outra pessoa usou o aparelho). Não pede permissão nem mostra nada.
 */
export async function sincronizarPush(): Promise<EstadoPush> {
  const estado = await estadoPush()
  if (estado === 'inativo' && notificacoesPermitidas()) return inscreverPush(false).catch(() => estado)
  if (estado !== 'ativo') return estado
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) await chamar({ acao: 'inscrever', inscricao: sub.toJSON() }).catch(() => undefined)
  return 'ativo'
}

/** Avisa quando o usuário muda a permissão de notificações nas configurações do navegador. */
export function observarPermissao(aoMudar: () => void) {
  let status: PermissionStatus | null = null
  let ativo = true
  const permissoes = typeof navigator !== 'undefined' ? navigator.permissions : undefined
  permissoes?.query({ name: 'notifications' as PermissionName }).then((s) => { if (ativo) { status = s; s.addEventListener('change', aoMudar) } }).catch(() => undefined)
  const visivel = () => { if (document.visibilityState === 'visible') aoMudar() }
  document.addEventListener('visibilitychange', visivel)
  window.addEventListener('focus', aoMudar)
  window.addEventListener('pageshow', aoMudar)
  return () => {
    ativo = false
    status?.removeEventListener('change', aoMudar)
    document.removeEventListener('visibilitychange', visivel)
    window.removeEventListener('focus', aoMudar)
    window.removeEventListener('pageshow', aoMudar)
  }
}

export async function desativarPush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await chamar({ acao: 'cancelar', endpoint: sub.endpoint }).catch(() => undefined)
  await sub.unsubscribe().catch(() => undefined)
}

export interface ErroPush { status: number; motivo: string }
export interface ResultadoTeste { aparelho: string; ok: boolean; status: number; motivo?: string }

/** Master: dispara o push de um aviso recém-publicado. */
export const enviarPushAviso = (aviso: string) => chamar({ acao: 'enviar', aviso }) as Promise<{ enviados: number; falhas: number; erros?: ErroPush[] }>

/** Manda uma notificação de teste para todos os aparelhos inscritos da conta logada. */
export const testarPush = () => chamar({ acao: 'testar' }) as Promise<{ enviados: number; falhas: number; removidos: number; resultados: ResultadoTeste[] }>

/** "Android · Chrome", "Windows · Edge"… a partir do user-agent gravado na inscrição. */
export function descreverAparelho(ua: string) {
  const so = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Aparelho'
  const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ''
  return nav ? `${so} · ${nav}` : so
}

/** Motivo de falha do serviço de push em português. */
export function explicarErroPush(status: number) {
  if (status === 404 || status === 410) return 'inscrição vencida (o aparelho saiu ou bloqueou); foi removida. Ative as notificações de novo nele'
  if (status === 403) return 'chave do servidor não confere com a do aparelho. Desative e ative as notificações de novo nele'
  if (status === 413) return 'texto grande demais'
  if (status === 429) return 'muitos envios seguidos; tente em alguns minutos'
  if (status >= 500) return 'serviço de push do navegador fora do ar; tente de novo'
  return 'sem resposta do serviço de push'
}
