import { emCache, excedeuLimite, usuarioLogado } from './protecao.js'
// Análise de empresa sob demanda: itens vencidos (resultados homologados) por CNPJ, direto da fonte oficial
// de dados abertos do Compras.gov.br (Lei 14.133, publicados no PNCP). Nada é guardado no banco.
// Opcional: sanções no Portal da Transparência (CEIS e CNEP), quando PORTAL_TRANSPARENCIA_CHAVE existir.

const FONTE = 'https://dadosabertos.compras.gov.br/modulo-contratacoes/3_consultarResultadoItensContratacoes_PNCP_14133'
const TRANSPARENCIA = 'https://api.portaldatransparencia.gov.br/api-de-dados'
const MAX_PAGINAS = 6 // até 3.000 itens vencidos por consulta
const dataValida = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '') && !Number.isNaN(Date.parse(d))

/** Resume os resultados de itens de um fornecedor. */
export function resumirResultados(resultados) {
  const validos = resultados.filter((r) => !r.dataCancelamentoPncp && r.situacaoCompraItemResultadoId !== 2)
  const valor = (r) => {
    const v = Number(r.valorTotalHomologado)
    return Number.isFinite(v) && v > 0 && v < 1e11 ? v : 0
  }
  const porUf = {}, porOrgao = {}, editais = new Set()
  let total = 0, meEpp = 0
  for (const r of validos) {
    const v = valor(r)
    total += v
    if (r.unidadeOrgaoUfSigla) porUf[r.unidadeOrgaoUfSigla] = (porUf[r.unidadeOrgaoUfSigla] ?? 0) + v
    if (r.orgaoEntidadeCnpj) {
      const o = (porOrgao[r.orgaoEntidadeCnpj] ??= { cnpj: r.orgaoEntidadeCnpj, itens: 0, valor: 0 })
      o.itens += 1; o.valor += v
    }
    if (r.idContratacaoPNCP) editais.add(r.idContratacaoPNCP)
    if (r.aplicacaoBeneficioMeepp) meEpp += 1
  }
  // Sazonalidade: valor e itens vencidos por mês (AAAA-MM).
  const porMes = {}
  for (const r of validos) {
    const mes = String(r.dataResultadoPncp ?? '').slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(mes)) continue
    const m = (porMes[mes] ??= { mes, itens: 0, valor: 0 })
    m.itens += 1; m.valor += valor(r)
  }
  const ordenados = [...validos].sort((a, b) => String(b.dataResultadoPncp).localeCompare(String(a.dataResultadoPncp)))
  return {
    nome: validos[0]?.nomeRazaoSocialFornecedor ?? resultados[0]?.nomeRazaoSocialFornecedor ?? null,
    porte: validos[0]?.porteFornecedorNome ?? null,
    itensVencidos: validos.length,
    editaisVencidos: editais.size,
    valorHomologado: Math.round(total * 100) / 100,
    itensComBeneficioMeEpp: meEpp,
    porUf: Object.entries(porUf).map(([uf, v]) => ({ uf, valor: Math.round(v * 100) / 100 })).sort((a, b) => b.valor - a.valor),
    principaisOrgaos: Object.values(porOrgao).sort((a, b) => b.valor - a.valor).slice(0, 10),
    porMes: Object.values(porMes).map((m) => ({ ...m, valor: Math.round(m.valor * 100) / 100 })).sort((a, b) => a.mes.localeCompare(b.mes)),
    // Compras (edital no PNCP) em que venceu algo, das mais recentes: usadas para ler as atas.
    compras: [...new Set(ordenados.map((r) => r.idContratacaoPNCP ?? r.numeroControlePNCPCompra).filter(Boolean))].slice(0, 40),
    ultimos: ordenados.slice(0, 50).map((r) => ({
      idCompra: String(r.idCompraItem ?? '').slice(0, 17) || null,
      controle: r.idContratacaoPNCP ?? r.numeroControlePNCPCompra, item: r.numeroItemPncp, data: r.dataResultadoPncp,
      uf: r.unidadeOrgaoUfSigla, orgaoCnpj: r.orgaoEntidadeCnpj, quantidade: Number(r.quantidadeHomologada) || null,
      valorUnitario: Number(r.valorUnitarioHomologado) || null, valorTotal: valor(r) || null, meEpp: !!r.aplicacaoBeneficioMeepp,
    })),
  }
}

async function buscarResultados(cnpj, de, ate) {
  const todos = []
  let paginas = 1
  for (let pagina = 1; pagina <= Math.min(paginas, MAX_PAGINAS); pagina++) {
    const u = `${FONTE}?pagina=${pagina}&tamanhoPagina=500&niFornecedor=${cnpj}&dataResultadoPncpInicial=${de}&dataResultadoPncpFinal=${ate}`
    const r = await fetch(u, { headers: { Accept: 'application/json', 'User-Agent': 'licitaflow-analise' }, signal: AbortSignal.timeout(25000) })
    if (!r.ok) throw Object.assign(new Error('A fonte de resultados (Compras.gov.br) não respondeu. Tente novamente em instantes.'), { status: 502 })
    const j = await r.json()
    if (!Array.isArray(j.resultado)) throw Object.assign(new Error('A fonte de resultados respondeu em formato inesperado.'), { status: 502 })
    todos.push(...j.resultado)
    paginas = Number(j.totalPaginas) || 1
  }
  return { todos, incompleto: paginas > MAX_PAGINAS }
}

const DADOS = 'https://dadosabertos.compras.gov.br'
async function obterDados(caminho, params) {
  const r = await fetch(`${DADOS}/${caminho}?${new URLSearchParams(params)}`, { headers: { Accept: 'application/json', 'User-Agent': 'licitaflow-analise' }, signal: AbortSignal.timeout(15000) })
  if (!r.ok) return []
  const j = await r.json().catch(() => null)
  return Array.isArray(j?.resultado) ? j.resultado : []
}

/**
 * Perfil da empresa a partir das maiores compras vencidas: o que mais vende (padrão descritivo do catálogo)
 * e com quais marcas venceu (Painel de Preços). Limitado para responder em poucos segundos.
 */
export async function perfilEmpresa(cnpj, resultados, { maxCompras = 12, maxMarcas = 24 } = {}) {
  const valor = (r) => { const v = Number(r.valorTotalHomologado); return Number.isFinite(v) && v > 0 && v < 1e11 ? v : 0 }
  const venceu = new Map() // idCompra -> Map(numeroItem -> valor)
  for (const r of resultados) {
    if (r.dataCancelamentoPncp) continue
    const id = String(r.idCompraItem ?? '').slice(0, 17)
    if (!/^\d{17}$/.test(id)) continue
    const m = venceu.get(id) ?? new Map(); m.set(Number(r.numeroItemPncp), valor(r)); venceu.set(id, m)
  }
  const maiores = [...venceu.entries()].map(([id, m]) => [id, m, [...m.values()].reduce((s, v) => s + v, 0)]).sort((a, b) => b[2] - a[2]).slice(0, maxCompras)
  const fortes = {}, marcas = {}, marcaPorItem = {}
  const consultasMarca = []
  await Promise.all(maiores.map(async ([idCompra, itensVencidos]) => {
    const itens = await obterDados('modulo-contratacoes/2.1_consultarItensContratacoes_PNCP_14133_Id', { tipo: 'idCompra', codigo: idCompra }).catch(() => [])
    const vistos = new Set() // a fonte pode repetir o mesmo item (versões)
    for (const i of itens) {
      const n = Number(i.numeroItemPncp)
      if (!itensVencidos.has(n) || vistos.has(n)) continue
      vistos.add(n)
      const nome = (i.nomePdm || i.itemCategoriaNome || i.descricaoResumida || '').toString().trim().toUpperCase().slice(0, 80)
      if (nome) { const f = (fortes[nome] ??= { nome, itens: 0, valor: 0 }); f.itens += 1; f.valor += itensVencidos.get(n) ?? 0 }
      if (i.materialOuServico === 'M' && i.codigoPdm) consultasMarca.push({ idCompra, codigoPdm: i.codigoPdm, numeroItemCompra: Number(i.numeroItemCompra), numero: n })
    }
  }))
  const unicas = new Map()
  for (const c of consultasMarca) unicas.set(`${c.idCompra}-${c.codigoPdm}`, c)
  await Promise.all([...unicas.values()].slice(0, maxMarcas).map(async (c) => {
    const lista = await obterDados('modulo-pesquisa-preco/1_consultarMaterial', { pagina: '1', tamanhoPagina: '500', tipo: 'codigoPdm', codigo: String(c.codigoPdm), idCompra: c.idCompra }).catch(() => [])
    for (const p of lista) {
      if (String(p.niFornecedor) !== cnpj || !p.marca || p.marca === 'null') continue
      const marca = String(p.marca).trim().toUpperCase()
      marcas[marca] = (marcas[marca] ?? 0) + 1
      marcaPorItem[`${c.idCompra}-${p.numeroItemCompra}`] = marca
    }
  }))
  return {
    fortes: Object.values(fortes).map((f) => ({ ...f, valor: Math.round(f.valor * 100) / 100 })).sort((a, b) => b.valor - a.valor).slice(0, 10),
    marcas: Object.entries(marcas).map(([marca, n]) => ({ marca, n })).sort((a, b) => b.n - a.n || a.marca.localeCompare(b.marca)).slice(0, 30),
    marcaPorItem,
  }
}

async function buscarSancoes(cnpj, chave) {
  if (!chave) return null
  const consulta = async (base) => {
    const r = await fetch(`${TRANSPARENCIA}/${base}?codigoSancionado=${cnpj}&pagina=1`, { headers: { 'chave-api-dados': chave, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) })
    if (!r.ok) return null
    const lista = await r.json()
    return Array.isArray(lista) ? lista.map((s) => ({
      cadastro: base.toUpperCase(), tipo: s.tipoSancao?.descricaoResumida ?? s.tipoSancao?.descricaoPortal ?? null,
      orgao: s.orgaoSancionador?.nome ?? null, inicio: s.dataInicioSancao ?? null, fim: s.dataFimSancao ?? null,
    })) : null
  }
  const [ceis, cnep] = await Promise.all([consulta('ceis'), consulta('cnep')])
  if (ceis === null && cnep === null) return null
  return [...(ceis ?? []), ...(cnep ?? [])]
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
  const cnpj = String(req.query?.cnpj ?? '').replace(/\D/g, '')
  const { de, ate } = req.query ?? {}
  if (!/^\d{14}$/.test(cnpj)) return res.status(400).json({ error: 'Informe um CNPJ com 14 dígitos.' })
  if (!dataValida(de) || !dataValida(ate) || de > ate || Date.parse(ate) - Date.parse(de) > 400 * 86_400_000) return res.status(400).json({ error: 'Período inválido (máximo de 1 ano).' })
  try {
    const usuario = await usuarioLogado(base, anon, token)
    if (!usuario) return res.status(401).json({ error: 'Entre na sua conta' })
    if (excedeuLimite('resultados', usuario)) return res.status(429).json({ error: 'Muitas consultas em pouco tempo. Aguarde um minuto e tente de novo.' })
    const corpo = await emCache('resultados', `${cnpj}|${de}|${ate}`, 10 * 60_000, async () => {
      const [{ todos, incompleto }, sancoes] = await Promise.all([buscarResultados(cnpj, de, ate), buscarSancoes(cnpj, env.PORTAL_TRANSPARENCIA_CHAVE).catch(() => null)])
      const resumo = resumirResultados(todos)
      const perfil = await perfilEmpresa(cnpj, todos).catch(() => ({ fortes: [], marcas: [], marcaPorItem: {} }))
      const ultimos = resumo.ultimos.map((u) => ({ ...u, marca: perfil.marcaPorItem[`${u.idCompra}-${u.item}`] ?? null }))
      return { cnpj, de, ate, incompleto, ...resumo, ultimos, fortes: perfil.fortes, marcas: perfil.marcas, sancoes, sancoesDisponiveis: !!env.PORTAL_TRANSPARENCIA_CHAVE }
    })
    return res.json(corpo)
  } catch (e) {
    return res.status(e.status ?? 500).json({ error: e.status ? e.message : 'Não foi possível montar a análise agora.' })
  }
}
