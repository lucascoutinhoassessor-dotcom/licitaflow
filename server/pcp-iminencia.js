// "Iminência de deserto" do Portal de Compras Públicas (PCP): processos ainda abertos em que nenhum fornecedor
// cadastrou proposta. O PCP mostra essa lista na própria busca pública (processos?status=4); o PNCP não tem essa
// informação. Lemos as páginas públicas, sem login, poucas vezes por hora (o resultado fica em cache).

const BASE = 'https://www.portaldecompraspublicas.com.br'
const MAX_PAGINAS = 30 // 12 processos por página
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; LicitaForce/1.0)', Accept: 'text/html' }

const entidades = { '&amp;': '&', '&quot;': '"', '&#x27;': "'", '&#39;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' }
const texto = (html) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, '\n').replace(/&[#\w]+;/g, (e) => entidades[e] ?? e)
  .split('\n').map((s) => s.trim()).filter(Boolean)

/** "03/12/2026 às 08:00" (horário de Brasília) → ISO. */
export function dataPCP(s) {
  const m = /(\d{2})\/(\d{2})\/(\d{4})(?:\s*às\s*(\d{2}):(\d{2}))?/.exec(s ?? '')
  if (!m) return null
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 0) + 3, +(m[5] ?? 0))).toISOString()
}

/** Processos de uma página de resultados da busca pública do PCP. */
export function lerPaginaPCP(html) {
  const processos = []
  const re = /aria-label="Acessar processo ([^"]*)" href="(\/processos\/[^"]+)"/g
  let m
  while ((m = re.exec(html))) {
    const antes = html.slice(Math.max(0, m.index - 4000), m.index)
    const ini = antes.lastIndexOf('Nº do Processo')
    if (ini < 0) continue
    const partes = texto(antes.slice(ini))
    const valor = (rotulo) => { const i = partes.findIndex((p) => p.startsWith(rotulo)); return i < 0 ? null : (partes[i].slice(rotulo.length).replace(/^:\s*/, '') || partes[i + 1]?.replace(/^:\s*/, '') || null) }
    const iAbertura = partes.findIndex((p) => p.startsWith('Abertura'))
    // Depois do número vêm a situação e o objeto, até "Abertura das Propostas".
    const meio = partes.slice(1, iAbertura < 0 ? undefined : iAbertura).filter((p) => p !== ':' && p !== m[1] && !/^Nº do Processo/.test(p))
    const caminho = m[2]
    const uf = /^\/processos\/([a-z]{2})\//i.exec(caminho)?.[1]?.toUpperCase() ?? null
    processos.push({
      numero: m[1], situacao: meio[0] ?? null, objeto: meio.slice(1).join(' ') || null,
      abertura: dataPCP(valor('Abertura das Propostas')), modalidade: valor('Modalidade'), comprador: valor('Comprador'),
      uf, link: BASE + caminho,
    })
  }
  const paginas = Number(/\\?"pageCount\\?":(\d+)/.exec(html)?.[1]) || 1
  const total = Number(/(\d[\d.]*)(?:<!-- -->)?\s*registros/.exec(html)?.[1]?.replace(/\./g, '')) || processos.length
  return { processos, paginas, total }
}

export const PAGINAS_PCP = MAX_PAGINAS
/** Uma página da lista (cada página leva ~5 s no PCP: a coleta lê uma por rodada). */
export async function paginaIminenciaPCP(fetcher, n) {
  const r = await fetcher(`${BASE}/processos?filtroEspecial=&pagina=${n}&status=4`, { headers: UA, signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error(`PCP respondeu ${r.status}`)
  return lerPaginaPCP(await r.text())
}

/** Todos os processos em iminência de deserto (até 30 páginas), sem repetir. Leva ~1 min: só para diagnóstico. */
export async function iminenciaDesertoPCP(fetcher = fetch, { intervaloMs = 300 } = {}) {
  const pagina = (n) => paginaIminenciaPCP(fetcher, n)
  const primeira = await pagina(1)
  const todos = [...primeira.processos]
  for (let n = 2; n <= Math.min(primeira.paginas, MAX_PAGINAS); n++) {
    await new Promise((r) => setTimeout(r, intervaloMs))
    try { todos.push(...(await pagina(n)).processos) } catch { break }
  }
  const vistos = new Set()
  const processos = todos.filter((p) => !vistos.has(p.link) && vistos.add(p.link))
  return { processos, total: primeira.total, lidoEm: new Date().toISOString() }
}
