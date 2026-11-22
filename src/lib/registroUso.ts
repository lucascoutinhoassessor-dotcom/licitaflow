// Registro de uso por usuário (aparece no master em Logs → Uso dos clientes).
// Captura sozinho, sem mexer em cada tela: páginas abertas, gravações no banco e chamadas às funções,
// erros (requisições que falham, erros de JavaScript e mensagens de erro mostradas ao usuário) e lentidão.
// Não guarda corpo de requisição nem filtros (podem ter dados pessoais): só caminho, método, status e tempo.
// Os eventos vão em lotes para /api/oportunidades?acao=turso-logs-registrar, que grava no Turso.
import { toast } from 'sonner'
import { supabase } from './supabase'

export type TipoLog = 'pagina' | 'acao' | 'erro' | 'lento'
interface Evento { tipo: TipoLog; mensagem: string; area: string; em: string; detalhe?: unknown; duracao_ms?: number }

const ENDPOINT = '/api/oportunidades?acao=turso-logs-registrar'
export const LIMITE_LENTO_MS = 4000
const MAX_FILA = 200
let fila: Evento[] = []
let iniciado = false
let enviando = false
const ultimos = new Map<string, number>()

const area = () => (typeof location === 'undefined' ? '' : location.pathname)

/** Põe um evento na fila. Repetições idênticas em 5 s são ignoradas (um erro em laço não enche o registro). */
export function registrar(tipo: TipoLog, mensagem: string, extra: { detalhe?: unknown; duracao_ms?: number } = {}) {
  const msg = String(mensagem ?? '').trim().slice(0, 500)
  if (!msg) return
  const chave = `${tipo}|${msg}|${area()}`
  const agora = Date.now()
  if ((ultimos.get(chave) ?? 0) > agora - 5000) return
  ultimos.set(chave, agora)
  if (ultimos.size > 500) ultimos.clear()
  fila.push({ tipo, mensagem: msg, area: area(), em: new Date(agora).toISOString(), ...extra })
  if (fila.length > MAX_FILA) fila = fila.slice(-MAX_FILA)
  if (fila.length >= 20 || tipo === 'erro') agendar(1500)
}

let timer: ReturnType<typeof setTimeout> | null = null
function agendar(ms: number) {
  if (timer) return
  timer = setTimeout(() => { timer = null; void enviar() }, ms)
}

/** Manda o que está na fila. Sem sessão, guarda (os erros da tela de entrada vão depois do login). */
export async function enviar(saindo = false) {
  if (enviando || !fila.length) return
  enviando = true
  const lote = fila.slice(0, 50)
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return
    let org: string | null = null
    try { org = localStorage.getItem('lf-org') } catch { /* armazenamento indisponível */ }
    const r = await fetchOriginal(ENDPOINT, { method: 'POST', keepalive: saindo, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ org, eventos: lote }) })
    // Só descarta se o servidor recebeu (ou recusou de vez); falha de rede tenta de novo depois.
    if (r.ok || (r.status >= 400 && r.status < 500 && r.status !== 429)) fila = fila.slice(lote.length)
  } catch { /* sem rede: tenta de novo na próxima rodada */ } finally {
    enviando = false
    if (fila.length >= 20) agendar(3000)
  }
}

/** Descreve uma requisição sem a query string (que pode ter CNPJ, e-mail, termos buscados). */
export function descreverRequisicao(url: string, metodo: string): { rotulo: string; escrita: boolean; ignorar: boolean } {
  let u: URL
  try { u = new URL(url, location.origin) } catch { return { rotulo: `${metodo} ?`, escrita: false, ignorar: true } }
  const p = u.pathname
  if (u.pathname.startsWith('/api/') && u.searchParams.get('acao')?.startsWith('turso-logs')) return { rotulo: '', escrita: false, ignorar: true }
  const escrita = metodo !== 'GET' && metodo !== 'HEAD' && metodo !== 'OPTIONS'
  let m: RegExpMatchArray | null
  if ((m = p.match(/\/rest\/v1\/rpc\/([\w-]+)/))) return { rotulo: `função ${m[1]}`, escrita: true, ignorar: false }
  if ((m = p.match(/\/rest\/v1\/([\w-]+)/))) {
    const verbo = ({ POST: 'gravou', PATCH: 'alterou', PUT: 'gravou', DELETE: 'excluiu' } as Record<string, string>)[metodo] ?? 'leu'
    return { rotulo: `${verbo} ${m[1]}`, escrita, ignorar: false }
  }
  if (p.includes('/auth/v1/')) {
    const g = u.searchParams.get('grant_type')
    if (p.endsWith('/token') && g === 'password') return { rotulo: 'entrou na conta', escrita: true, ignorar: false }
    if (p.endsWith('/logout')) return { rotulo: 'saiu da conta', escrita: true, ignorar: false }
    return { rotulo: `autenticação ${p.split('/auth/v1/')[1]}${g ? ` (${g})` : ''}`, escrita: false, ignorar: false }
  }
  if (p.includes('/storage/v1/')) return { rotulo: `${escrita ? 'enviou arquivo' : 'abriu arquivo'} ${p.split('/storage/v1/object/')[1]?.split('/')[0] ?? ''}`.trim(), escrita, ignorar: false }
  if (p.startsWith('/api/')) {
    const acao = u.searchParams.get('acao')
    return { rotulo: `${p.slice(5)}${acao ? ` · ${acao}` : ''}`, escrita: true, ignorar: false }
  }
  if (u.origin !== location.origin) return { rotulo: `${metodo} ${u.host}`, escrita: false, ignorar: false }
  return { rotulo: '', escrita: false, ignorar: true }
}

/** Respostas de erro que fazem parte do fluxo normal (a busca rápida avisa que o Postgres assume, etc.). */
function erroEsperado(url: string, status: number) {
  if (status === 409 && /acao=turso-(buscar|itens)/.test(url)) return true
  if (status === 404 && /acao=turso-itens/.test(url)) return true
  if (status === 416) return true // paginação além do fim
  return false
}

let fetchOriginal: typeof fetch = (input, init) => fetch(input, init)

/** Liga a captura. Chamar uma vez, no main.tsx. */
export function iniciarRegistroUso() {
  if (iniciado || typeof window === 'undefined') return
  iniciado = true
  const original = window.fetch.bind(window)
  fetchOriginal = original

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const metodo = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const d = descreverRequisicao(url, metodo)
    if (d.ignorar) return original(input, init)
    const inicio = performance.now()
    try {
      const r = await original(input, init)
      const ms = performance.now() - inicio
      if (!r.ok && !erroEsperado(url, r.status)) {
        let texto = ''
        try { texto = (await r.clone().text()).slice(0, 400) } catch { /* corpo indisponível */ }
        let msg = texto
        try { const j = JSON.parse(texto); msg = j.error ?? j.message ?? j.msg ?? j.error_description ?? texto } catch { /* não é JSON */ }
        registrar('erro', `${d.rotulo} respondeu ${r.status}`, { detalhe: { status: r.status, metodo, resposta: String(msg).slice(0, 300) }, duracao_ms: ms })
      } else if (d.escrita && r.ok) registrar('acao', d.rotulo, { duracao_ms: ms })
      if (ms >= LIMITE_LENTO_MS) registrar('lento', `${d.rotulo} levou ${(ms / 1000).toFixed(1)} s`, { detalhe: { metodo, status: r.status }, duracao_ms: ms })
      return r
    } catch (e) {
      const ms = performance.now() - inicio
      if ((e as Error)?.name !== 'AbortError') registrar('erro', `${d.rotulo} falhou: ${(e as Error)?.message ?? e}`, { detalhe: { metodo, online: navigator.onLine }, duracao_ms: ms })
      throw e
    }
  }

  // Erros de JavaScript.
  window.addEventListener('error', (e) => {
    if (!e.message) return
    registrar('erro', `Erro na tela: ${e.message}`, { detalhe: { arquivo: e.filename?.split('/').pop(), linha: e.lineno, pilha: String(e.error?.stack ?? '').slice(0, 1200) } })
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as Error | undefined
    if (r?.name === 'AbortError') return
    registrar('erro', `Erro não tratado: ${r?.message ?? String(e.reason)}`, { detalhe: { pilha: String(r?.stack ?? '').slice(0, 1200) } })
  })

  // Mensagens de erro que o usuário viu na tela (toast.error é usado no app inteiro).
  const toastErro = toast.error
  toast.error = ((mensagem: unknown, opcoes?: unknown) => {
    if (typeof mensagem === 'string') registrar('erro', `Mensagem de erro exibida: ${mensagem}`)
    return (toastErro as (m: unknown, o?: unknown) => string | number)(mensagem, opcoes)
  }) as typeof toast.error

  // Páginas abertas (mudança de rota do React Router) e tempo de carregamento.
  let ultimaPagina = ''
  const pagina = () => {
    if (location.pathname === ultimaPagina) return
    ultimaPagina = location.pathname
    registrar('pagina', `Abriu ${location.pathname}`)
  }
  for (const nome of ['pushState', 'replaceState'] as const) {
    const orig = history[nome].bind(history)
    history[nome] = ((...args: Parameters<History['pushState']>) => { const r = orig(...args); setTimeout(pagina, 0); return r }) as History['pushState']
  }
  window.addEventListener('popstate', pagina)
  pagina()
  window.addEventListener('load', () => setTimeout(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const ms = nav ? nav.loadEventEnd - nav.startTime : 0
    if (ms >= LIMITE_LENTO_MS * 2) registrar('lento', `Carregamento inicial levou ${(ms / 1000).toFixed(1)} s`, { duracao_ms: ms, detalhe: { conexao: (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType } })
  }, 0))

  setInterval(() => void enviar(), 15_000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void enviar(true) })
}
