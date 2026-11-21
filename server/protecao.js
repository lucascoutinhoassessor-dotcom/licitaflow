// Proteções comuns às funções que consultam fontes do governo:
// cache curto (respostas iguais não repetem a consulta externa) e limite de pedidos por usuário.

const caches = new Map()
const janelas = new Map()

/** Guarda o resultado de `gerar()` por `ttlMs` (no máximo `max` chaves por espaço). */
export async function emCache(espaco, chave, ttlMs, gerar, max = 300) {
  let mapa = caches.get(espaco)
  if (!mapa) { mapa = new Map(); caches.set(espaco, mapa) }
  const agora = Date.now()
  const atual = mapa.get(chave)
  if (atual && atual.expira > agora) return atual.valor
  const valor = await gerar()
  mapa.set(chave, { valor, expira: agora + ttlMs })
  if (mapa.size > max) mapa.delete(mapa.keys().next().value)
  return valor
}

/** true quando o usuário passou do limite de pedidos na janela (padrão: 30 por minuto). */
export function excedeuLimite(espaco, usuario, limite = 30, janelaMs = 60_000) {
  const chave = `${espaco}:${usuario}`
  const agora = Date.now()
  const lista = (janelas.get(chave) ?? []).filter((t) => t > agora - janelaMs)
  lista.push(agora)
  janelas.set(chave, lista)
  if (janelas.size > 5000) janelas.delete(janelas.keys().next().value)
  return lista.length > limite
}

/** Valida o login no Supabase e devolve o id do usuário (ou null). */
export async function usuarioLogado(base, anon, token) {
  const r = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: token }, signal: AbortSignal.timeout(10000) })
  if (!r.ok) return null
  const u = await r.json().catch(() => null)
  return typeof u?.id === 'string' ? u.id : 'usuario'
}

export function limparProtecoes() { caches.clear(); janelas.clear() }
