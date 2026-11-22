// Notificações push neste aparelho (lado do cliente). O envio é feito por api/push.js.
import { supabase } from '@/lib/supabase'

export type EstadoPush = 'ativo' | 'inativo' | 'negado' | 'sem-suporte'

export const pushSuportado = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** No iPhone o push só existe com o app instalado na Tela de Início. */
export const precisaInstalar = () =>
  typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches

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
  reg.showNotification('Notificações ativadas', { body: 'Os avisos do LicitaFlow vão chegar aqui na hora, mesmo com o app fechado.', icon: '/icons/icone-192.png', badge: '/icons/badge-96.png', tag: 'licitaflow-ativado' }).catch(() => undefined)
  return 'ativo'
}

export async function desativarPush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await chamar({ acao: 'cancelar', endpoint: sub.endpoint }).catch(() => undefined)
  await sub.unsubscribe().catch(() => undefined)
}

/** Master: dispara o push de um aviso recém-publicado. */
export const enviarPushAviso = (aviso: string) => chamar({ acao: 'enviar', aviso }) as Promise<{ enviados: number; falhas: number }>
