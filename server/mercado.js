import { emCache, excedeuLimite, guardarNoNavegador, usuarioLogado } from './protecao.js'
import { linhaDeCompra, precoValido, precosPorUnidade } from './precos.js'
// Análise de mercado sob demanda: junta as compras homologadas de até 6 itens do catálogo federal
// (materiais por PDM, serviços pelo código) no Painel de Preços e resume por estado, mês, órgão,
// empresa vencedora, marca, esfera e poder. Nada é guardado no banco.

const BASE = 'https://dadosabertos.compras.gov.br/modulo-pesquisa-preco'
const MAX_CODIGOS = 6
const MAX_PAGINAS = 2 // até 1.000 compras por item do catálogo
const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '))
const ESFERAS = new Set(['F', 'E', 'M'])
const PODERES = new Set(['E', 'L', 'J'])
const dataValida = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '') && !Number.isNaN(Date.parse(d))
const arred = (v) => Math.round(v * 100) / 100

/** "M5308,S7250" -> [{ tipo, codigo }] (sem repetições). Devolve null se algo for inválido. */
export function lerCodigos(texto) {
  const partes = String(texto ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!partes.length || partes.length > MAX_CODIGOS) return null
  const lista = []
  for (const p of partes) {
    const m = /^([MS])(\d{1,9})$/.exec(p)
    if (!m) return null
    if (!lista.some((c) => c.tipo === m[1] && c.codigo === Number(m[2]))) lista.push({ tipo: m[1], codigo: Number(m[2]) })
  }
  return lista
}

/** Valor total de uma compra (preço unitário × quantidade; sem quantidade, o preço unitário). */
const valorDe = (l) => { const v = l.preco * (l.quantidade && l.quantidade > 0 ? l.quantidade : 1); return Number.isFinite(v) && v < 1e11 ? v : 0 }

function somar(mapa, chave, base, v) {
  const o = mapa.get(chave) ?? { ...base, itens: 0, valor: 0 }
  o.itens += 1; o.valor += v
  mapa.set(chave, o)
}
const lista = (mapa, limite = 300) => [...mapa.values()].map((o) => ({ ...o, valor: arred(o.valor) })).sort((a, b) => b.valor - a.valor || b.itens - a.itens).slice(0, limite)

/**
 * Resume as compras do Painel de Preços. Cada compra traz `_codigo` ("M5308") indicando de qual item do catálogo veio.
 * `filtros` (opcionais): esfera (F/E/M), poder (E/L/J) e modalidade (código numérico do Compras.gov).
 */
export function resumirMercado(compras, filtros = {}) {
  const vistos = new Set()
  const linhas = []
  for (const c of compras) {
    const chave = c.idCompraItem ?? `${c.idCompra}-${c.numeroItemCompra}-${c.niFornecedor}`
    if (vistos.has(chave)) continue
    vistos.add(chave)
    if (filtros.esfera && c.esfera !== filtros.esfera) continue
    if (filtros.poder && c.poder !== filtros.poder) continue
    if (filtros.modalidade && Number(c.modalidade) !== Number(filtros.modalidade)) continue
    const l = { ...linhaDeCompra(c), esfera: c.esfera ?? null, poder: c.poder ?? null, codigoCatalogo: c._codigo ?? null, nomeCatalogo: c.nomePdm ?? null }
    if (precoValido(l)) linhas.push(l)
  }
  const { mantidas, descartadas } = semPrecosAberrantes(linhas)
  return { descartadas, ...resumirLinhas(mantidas) }
}

/**
 * A fonte tem preços digitados errados (ex.: o valor total lançado como unitário), que distorcem os totais.
 * Em grupos do mesmo item do catálogo e unidade com 4+ compras, descarta preços 50× acima ou abaixo da mediana.
 */
export function semPrecosAberrantes(linhas, fator = 50) {
  const grupos = new Map()
  for (const l of linhas) { const k = `${l.codigoCatalogo}|${l.unidade}`; grupos.set(k, [...(grupos.get(k) ?? []), l.preco]) }
  const medianas = new Map()
  for (const [k, ps] of grupos) {
    if (ps.length < 4) continue
    const v = [...ps].sort((a, b) => a - b), meio = Math.floor(v.length / 2)
    medianas.set(k, v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2)
  }
  const mantidas = linhas.filter((l) => { const m = medianas.get(`${l.codigoCatalogo}|${l.unidade}`); return !m || (l.preco <= m * fator && l.preco >= m / fator) })
  return { mantidas, descartadas: linhas.length - mantidas.length }
}

function resumirLinhas(linhas) {
  const porUf = new Map(), porMes = new Map(), orgaos = new Map(), empresas = new Map(), marcas = new Map()
  const catalogo = new Map(), esferas = new Map(), poderes = new Map(), modalidades = new Map(), compras_ = new Set()
  let total = 0
  for (const l of linhas) {
    const v = valorDe(l)
    total += v
    compras_.add(l.idCompra)
    if (l.uf && UFS.has(l.uf)) somar(porUf, l.uf, { uf: l.uf }, v)
    const mes = String(l.data ?? '').slice(0, 7)
    if (/^\d{4}-\d{2}$/.test(mes)) somar(porMes, mes, { mes }, v)
    if (l.orgao) somar(orgaos, `${l.uasg ?? ''}|${l.orgao}`, { nome: l.orgao, unidade: l.unidadeCompradora, uasg: l.uasg, uf: l.uf }, v)
    if (l.cnpj) {
      somar(empresas, l.cnpj, { cnpj: String(l.cnpj), nome: l.fornecedor }, v)
    }
    if (l.marca) { const m = l.marca.trim().toUpperCase(); if (m) somar(marcas, m, { marca: m }, v) }
    if (l.codigoCatalogo) somar(catalogo, l.codigoCatalogo, { codigo: l.codigoCatalogo }, v)
    if (l.esfera) somar(esferas, l.esfera, { id: l.esfera }, v)
    if (l.poder) somar(poderes, l.poder, { id: l.poder }, v)
    if (l.modalidade != null) somar(modalidades, String(l.modalidade), { id: Number(l.modalidade) }, v)
  }
  const recentes = [...linhas].sort((a, b) => String(b.data).localeCompare(String(a.data)))
  return {
    itens: linhas.length,
    compras: compras_.size,
    valorTotal: arred(total),
    porUf: lista(porUf, 27),
    porMes: [...porMes.values()].map((m) => ({ ...m, valor: arred(m.valor) })).sort((a, b) => a.mes.localeCompare(b.mes)),
    totalOrgaos: orgaos.size, orgaos: lista(orgaos),
    totalEmpresas: empresas.size, empresas: lista(empresas),
    totalMarcas: marcas.size, marcas: lista(marcas),
    catalogo: lista(catalogo, MAX_CODIGOS),
    esferas: lista(esferas, 10), poderes: lista(poderes, 10), modalidades: lista(modalidades, 20),
    unidades: precosPorUnidade(linhas).slice(0, 4),
    recentes: recentes.slice(0, 300).map(({ esfera: _e, poder: _p, ...l }) => l),
  }
}

async function buscarCodigo({ tipo, codigo }, { uf, de, ate }) {
  const caminho = tipo === 'M' ? '1_consultarMaterial' : '3_consultarServico'
  const todas = []
  let paginas = 1
  for (let pagina = 1; pagina <= Math.min(paginas, MAX_PAGINAS); pagina++) {
    const p = new URLSearchParams({ pagina: String(pagina), tamanhoPagina: '500' })
    if (tipo === 'M') { p.set('tipo', 'codigoPdm'); p.set('codigo', String(codigo)) } else p.set('codigoItemCatalogo', String(codigo))
    if (uf) p.set('estado', uf)
    if (de) p.set('dataCompraInicio', de)
    if (ate) p.set('dataCompraFim', ate)
    const r = await fetch(`${BASE}/${caminho}?${p}`, { headers: { Accept: 'application/json', 'User-Agent': 'licitaflow-mercado' }, signal: AbortSignal.timeout(25000) })
    if (!r.ok) throw Object.assign(new Error('A consulta de compras não respondeu. Tente novamente em instantes.'), { status: 502 })
    const j = await r.json()
    if (!Array.isArray(j.resultado)) throw Object.assign(new Error('A consulta de compras respondeu em formato inesperado.'), { status: 502 })
    for (const c of j.resultado) todas.push({ ...c, _codigo: `${tipo}${codigo}` })
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
  const codigos = lerCodigos(q.codigos)
  const uf = q.uf ?? '', de = q.de ?? '', ate = q.ate ?? ''
  const filtros = { esfera: q.esfera ?? '', poder: q.poder ?? '', modalidade: q.modalidade ?? '' }
  if (!codigos) return res.status(400).json({ error: `Escolha de 1 a ${MAX_CODIGOS} itens do catálogo.` })
  if (uf && !UFS.has(uf)) return res.status(400).json({ error: 'UF inválida.' })
  if ((filtros.esfera && !ESFERAS.has(filtros.esfera)) || (filtros.poder && !PODERES.has(filtros.poder)) || (filtros.modalidade && !/^\d{1,2}$/.test(filtros.modalidade))) return res.status(400).json({ error: 'Filtro inválido.' })
  if (!dataValida(de) || !dataValida(ate) || de > ate || Date.parse(ate) - Date.parse(de) > 3 * 366 * 86_400_000) return res.status(400).json({ error: 'Período inválido (máximo de 3 anos).' })
  try {
    const usuario = await usuarioLogado(base, anon, token)
    if (!usuario) return res.status(401).json({ error: 'Entre na sua conta' })
    if (excedeuLimite('mercado', usuario, 20)) return res.status(429).json({ error: 'Muitas consultas em pouco tempo. Aguarde um minuto e tente de novo.' })
    const partes = await Promise.all(codigos.map((c) => emCache('mercado', `${c.tipo}${c.codigo}|${uf}|${de}|${ate}`, 15 * 60_000, () => buscarCodigo(c, { uf, de, ate }), 120)))
    const todas = partes.flatMap((p) => p.todas)
    guardarNoNavegador(res, 900)
    return res.json({ de, ate, uf, ...filtros, incompleto: partes.some((p) => p.incompleto), ...resumirMercado(todas, filtros) })
  } catch (e) {
    return res.status(e.status ?? 500).json({ error: e.status ? e.message : 'Não foi possível montar a análise de mercado agora.' })
  }
}
