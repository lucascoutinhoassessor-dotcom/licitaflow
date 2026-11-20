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
    ultimos: ordenados.slice(0, 50).map((r) => ({
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
    const u = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: token }, signal: AbortSignal.timeout(10000) })
    if (!u.ok) return res.status(401).json({ error: 'Entre na sua conta' })
    const [{ todos, incompleto }, sancoes] = await Promise.all([buscarResultados(cnpj, de, ate), buscarSancoes(cnpj, env.PORTAL_TRANSPARENCIA_CHAVE).catch(() => null)])
    return res.json({ cnpj, de, ate, incompleto, ...resumirResultados(todos), sancoes, sancoesDisponiveis: !!env.PORTAL_TRANSPARENCIA_CHAVE })
  } catch (e) {
    return res.status(e.status ?? 500).json({ error: e.status ? e.message : 'Não foi possível montar a análise agora.' })
  }
}
