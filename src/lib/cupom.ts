import { useSyncExternalStore } from 'react'

/** Cupom como o servidor devolve (prévia pública ou conferência da organização). */
export interface CupomInfo { codigo: string; tipo: 'percentual' | 'valor' | 'dias'; valor: number; plano: string | null; descricao: string | null }

const CHAVE = 'lf-cupom'
const EVENTO = 'lf-cupom'
const FORMATO = /^[A-Z0-9_-]{3,40}$/

/** Código no formato aceito pelo banco (maiúsculas, sem espaços), ou null. */
export function normalizarCupom(valor: string | null | undefined): string | null {
  const c = String(valor ?? '').trim().toUpperCase().replace(/\s/g, '')
  return FORMATO.test(c) ? c : null
}

/** Desconto em centavos sobre uma cobrança; cupom de dias ou de outro plano não desconta. */
export function descontoCupom(c: CupomInfo | null, valorCentavos: number, plano?: string): number {
  if (!c || c.tipo === 'dias' || (c.plano && plano && c.plano !== plano)) return 0
  const d = c.tipo === 'percentual' ? Math.round(valorCentavos * c.valor / 100) : c.valor
  // O servidor nunca cobra menos de R$ 1,00.
  return Math.max(0, Math.min(d, valorCentavos - 100))
}

export function rotuloCupomCliente(c: CupomInfo): string {
  if (c.tipo === 'dias') return `${c.valor} dia${c.valor === 1 ? '' : 's'} de acesso grátis`
  if (c.tipo === 'percentual') return `${c.valor}% de desconto`
  return `${(c.valor / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} de desconto por cobrança`
}

// Cupom vindo de um link (?cupom=) fica guardado no navegador até ser usado: atravessa cadastro,
// confirmação de e-mail, login e checkout.
export function lerCupomPendente(): string | null {
  try { return normalizarCupom(localStorage.getItem(CHAVE)) } catch { return null }
}
export function guardarCupomPendente(codigo: string | null) {
  try {
    const c = normalizarCupom(codigo)
    if (c) localStorage.setItem(CHAVE, c); else localStorage.removeItem(CHAVE)
  } catch { /* navegador sem armazenamento: o cupom vale só nesta página */ }
  window.dispatchEvent(new Event(EVENTO))
}

function assinar(aviso: () => void) {
  const f = (e: StorageEvent | Event) => { if (!(e instanceof StorageEvent) || e.key === CHAVE) aviso() }
  window.addEventListener(EVENTO, f); window.addEventListener('storage', f)
  return () => { window.removeEventListener(EVENTO, f); window.removeEventListener('storage', f) }
}
export function useCupomPendente() {
  return useSyncExternalStore(assinar, lerCupomPendente, () => null)
}

/** Prévia pública do cupom (não precisa de conta): confere validade, tipo e plano. */
export async function previaCupom(codigo: string): Promise<CupomInfo> {
  const r = await fetch('/api/pagamentos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'previa_cupom', codigo }) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'Não foi possível conferir o cupom agora.')
  return j as CupomInfo
}

/** Link para divulgar: cupom de dias leva ao cadastro; cupom de desconto leva ao checkout. */
export function linkCupom(base: string, c: Pick<CupomInfo, 'codigo' | 'tipo' | 'plano'>): string {
  const raiz = base.replace(/\/$/, '')
  if (c.tipo === 'dias') return `${raiz}/cadastro?cupom=${encodeURIComponent(c.codigo)}`
  return `${raiz}/checkout?cupom=${encodeURIComponent(c.codigo)}${c.plano ? `&plano=${encodeURIComponent(c.plano)}` : ''}`
}
