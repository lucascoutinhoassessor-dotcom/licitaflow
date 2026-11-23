import { emCache, excedeuLimite, guardarNoNavegador, usuarioLogado } from './protecao.js'
import { cnpjBloqueado } from './bloqueio.js'
// Histórico de preços sob demanda: compras homologadas de um material (PDM) ou serviço do catálogo federal,
// direto do Painel de Preços (dados abertos do Compras.gov.br). Nada é guardado no banco.

const BASE = 'https://dadosabertos.compras.gov.br/modulo-pesquisa-preco'
const MAX_PAGINAS = 4 // até 2.000 compras por consulta
const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '))
const dataValida = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '') && !Number.isNaN(Date.parse(d))

const arred = (v) => Math.round(v * 100) / 100
function estatisticas(valores) {
  const v = [...valores].sort((a, b) => a - b)
  if (!v.length) return null
  const meio = Math.floor(v.length / 2)
  return { n: v.length, minimo: arred(v[0]), maximo: arred(v[v.length - 1]), media: arred(v.reduce((s, x) => s + x, 0) / v.length), mediana: arred(v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2) }
}

/** Uma compra do Painel de Preços no formato usado pelo LicitaForce. */
/**
 * Código da compra (UASG + modalidade + número + ano, 17 dígitos). A fonte manda `idCompra` como número JSON,
 * que passa do limite de precisão do JavaScript (98052305900062026 vira ...2030); por isso vale o texto de
 * `idCompraItem` (código da compra + 5 dígitos do item).
 */
export function idCompraDe(c) {
  const item = String(c.idCompraItem ?? '')
  if (/^\d{20,25}$/.test(item)) return item.slice(0, -5)
  return c.idCompra == null ? '' : String(c.idCompra)
}

export function linhaDeCompra(c) {
  const oculto = cnpjBloqueado(c.niFornecedor)
  return {
    data: c.dataResultado ?? c.dataCompra ?? null, preco: Number(c.precoUnitario), quantidade: Number(c.quantidade) || null,
    unidade: (c.siglaUnidadeFornecimento ?? c.siglaUnidadeMedida ?? c.nomeUnidadeFornecimento ?? c.nomeUnidadeMedida ?? 'UN').toString().trim().toUpperCase() || 'UN',
    descricao: c.descricaoItem ?? '', fornecedor: oculto ? null : c.nomeFornecedor ?? null, cnpj: oculto ? null : c.niFornecedor ?? null, marca: c.marca && c.marca !== 'null' ? c.marca : null,
    orgao: c.nomeOrgao ?? c.nomeUasg ?? null, unidadeCompradora: c.nomeUasg ?? null, uasg: c.codigoUasg ?? null, uf: c.estado ?? null, municipio: c.municipio ?? null, modalidade: c.modalidade ?? null, idCompra: idCompraDe(c),
    numeroItem: Number(c.numeroItemCompra) || null, objeto: c.objetoCompra ?? null, detalhe: c.descricaoDetalhadaItem ?? null, dataCompra: c.dataCompra ?? null,
  }
}
export const precoValido = (l) => Number.isFinite(l.preco) && l.preco > 0 && l.preco < 1e9

/** Estatísticas de preço unitário por unidade de fornecimento. */
export function precosPorUnidade(linhas) {
  const porUnidade = new Map()
  for (const l of linhas) porUnidade.set(l.unidade, [...(porUnidade.get(l.unidade) ?? []), l])
  return [...porUnidade.entries()].map(([unidade, ls]) => ({ unidade, ...estatisticas(ls.map((l) => l.preco)) })).sort((a, b) => b.n - a.n)
}

/** Agrupa as compras por unidade de fornecimento e calcula as estatísticas de preço unitário. */
export function resumirPrecos(compras) {
  const linhas = compras.map(linhaDeCompra).filter(precoValido)
  const unidades = precosPorUnidade(linhas)
  const marcas = {}
  for (const l of linhas) if (l.marca) marcas[l.marca.toUpperCase()] = (marcas[l.marca.toUpperCase()] ?? 0) + 1
  return {
    total: linhas.length,
    unidades,
    marcas: Object.entries(marcas).map(([marca, n]) => ({ marca, n })).sort((a, b) => b.n - a.n).slice(0, 12),
    compras: [...linhas].sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 300),
  }
}

async function buscarCompras(tipo, codigo, filtros) {
  const caminho = tipo === 'M' ? '1_consultarMaterial' : '3_consultarServico'
  const todas = []
  let paginas = 1
  for (let pagina = 1; pagina <= Math.min(paginas, MAX_PAGINAS); pagina++) {
    const p = new URLSearchParams({ pagina: String(pagina), tamanhoPagina: '500' })
    if (tipo === 'M') { p.set('tipo', 'codigoPdm'); p.set('codigo', String(codigo)) } else p.set('codigoItemCatalogo', String(codigo))
    if (filtros.uf) p.set('estado', filtros.uf)
    if (filtros.de) p.set('dataCompraInicio', filtros.de)
    if (filtros.ate) p.set('dataCompraFim', filtros.ate)
    const r = await fetch(`${BASE}/${caminho}?${p}`, { headers: { Accept: 'application/json', 'User-Agent': 'licitaforce-precos' }, signal: AbortSignal.timeout(25000) })
    if (!r.ok) throw Object.assign(new Error('A consulta de preços não respondeu. Tente novamente em instantes.'), { status: 502 })
    const j = await r.json()
    if (!Array.isArray(j.resultado)) throw Object.assign(new Error('A consulta de preços respondeu em formato inesperado.'), { status: 502 })
    todas.push(...j.resultado)
    paginas = Number(j.totalPaginas) || 1
  }
  return { todas, incompleto: paginas > MAX_PAGINAS }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' })
  const env = process.env
  const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
  const token = req.headers.authorization
  if (!base || !anon) return res.status(503).json({ error: 'Configuração Supabase ausente no servidor' })
  if (!/^Bearer \S+$/.test(token ?? '')) return res.status(401).json({ error: 'Entre na sua conta' })
  const q = req.query ?? {}
  const tipo = q.tipo, codigo = Number(q.codigo), uf = q.uf ?? '', de = q.de ?? '', ate = q.ate ?? ''
  if (!['M', 'S'].includes(tipo) || !Number.isInteger(codigo) || codigo <= 0) return res.status(400).json({ error: 'Escolha um material ou serviço do catálogo.' })
  if (uf && !UFS.has(uf)) return res.status(400).json({ error: 'UF inválida.' })
  if ((de && !dataValida(de)) || (ate && !dataValida(ate)) || (de && ate && de > ate)) return res.status(400).json({ error: 'Período inválido.' })
  try {
    const usuario = await usuarioLogado(base, anon, token)
    if (!usuario) return res.status(401).json({ error: 'Entre na sua conta' })
    if (excedeuLimite('precos', usuario)) return res.status(429).json({ error: 'Muitas consultas em pouco tempo. Aguarde um minuto e tente de novo.' })
    const corpo = await emCache('precos', `${tipo}|${codigo}|${uf}|${de}|${ate}`, 10 * 60_000, async () => {
      const { todas, incompleto } = await buscarCompras(tipo, codigo, { uf, de, ate })
      return { tipo, codigo, incompleto, ...resumirPrecos(todas) }
    })
    guardarNoNavegador(res, 600)
    return res.json(corpo)
  } catch (e) {
    return res.status(e.status ?? 500).json({ error: e.status ? e.message : 'Não foi possível consultar os preços agora.' })
  }
}
