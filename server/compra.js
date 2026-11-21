import { emCache, excedeuLimite, usuarioLogado } from './protecao.js'
// Detalhe de uma compra do governo federal (Lei 14.133) a partir do código do Painel de Preços (idCompra):
// edital no PNCP, itens, vencedores por item (valores, porte, ordem de classificação) e marca de cada item vencido.
// Tudo consultado na hora nos dados abertos do Compras.gov.br; nada é guardado no banco.

const BASE = 'https://dadosabertos.compras.gov.br'
const MAX_MARCAS = 15 // consultas de marca por compra (uma por PDM/serviço distinto)

async function obter(caminho, params) {
  const r = await fetch(`${BASE}/${caminho}?${new URLSearchParams(params)}`, { headers: { Accept: 'application/json', 'User-Agent': 'licitaflow-compra' }, signal: AbortSignal.timeout(25000) })
  if (r.status === 204) return []
  if (!r.ok) throw Object.assign(new Error('Os dados abertos do Compras.gov.br não responderam. Tente novamente em instantes.'), { status: 502 })
  const j = await r.json()
  return Array.isArray(j.resultado) ? j.resultado : []
}

/** Marca e fornecedor por número do item, vindos do Painel de Preços. */
async function marcasDaCompra(idCompra, itens) {
  const chaves = new Map()
  for (const i of itens) {
    if (i.materialOuServico === 'M' && i.codigoPdm) chaves.set(`M${i.codigoPdm}`, { tipo: 'M', codigo: i.codigoPdm })
    else if (i.materialOuServico === 'S' && i.codItemCatalogo) chaves.set(`S${i.codItemCatalogo}`, { tipo: 'S', codigo: i.codItemCatalogo })
  }
  const marcas = {}
  await Promise.all([...chaves.values()].slice(0, MAX_MARCAS).map(async (k) => {
    try {
      const lista = k.tipo === 'M'
        ? await obter('modulo-pesquisa-preco/1_consultarMaterial', { pagina: '1', tamanhoPagina: '500', tipo: 'codigoPdm', codigo: String(k.codigo), idCompra })
        : await obter('modulo-pesquisa-preco/3_consultarServico', { pagina: '1', tamanhoPagina: '500', codigoItemCatalogo: String(k.codigo), idCompra })
      for (const p of lista) {
        const n = Number(p.numeroItemCompra)
        if (Number.isInteger(n)) marcas[n] = { marca: p.marca && p.marca !== 'null' ? p.marca : null, fornecedor: p.nomeFornecedor ?? null, cnpj: p.niFornecedor ?? null }
      }
    } catch { /* marca é complemento: segue sem ela */ }
  }))
  return marcas
}

/** Junta contratação, itens, resultados e marcas no formato da tela. */
export function montarCompra(contratacao, itens, resultados, marcas) {
  const porItem = new Map()
  for (const r of resultados) {
    if (r.dataCancelamentoPncp) continue
    const n = Number(r.numeroItemPncp)
    porItem.set(n, [...(porItem.get(n) ?? []), {
      fornecedor: r.nomeRazaoSocialFornecedor ?? null, cnpj: r.niFornecedor ?? null, porte: r.porteFornecedorNome ?? null,
      quantidade: Number(r.quantidadeHomologada) || null, valorUnitario: Number(r.valorUnitarioHomologado) || null,
      valorTotal: Number(r.valorTotalHomologado) || null, ordem: r.ordemClassificacaoSrp ?? null, meEpp: !!r.aplicacaoBeneficioMeepp,
      desconto: Number(r.percentualDesconto) || null, situacao: r.situacaoCompraItemResultadoNome ?? null,
    }])
  }
  for (const lista of porItem.values()) lista.sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999) || (a.valorUnitario ?? 0) - (b.valorUnitario ?? 0))
  const c = contratacao ?? {}
  return {
    idCompra: c.idCompra ?? null, controle: c.numeroControlePNCP ?? null,
    objeto: c.objetoCompra ?? null, orgao: c.orgaoEntidadeRazaoSocial ?? null, unidade: c.unidadeOrgaoNomeUnidade ?? null,
    uf: c.unidadeOrgaoUfSigla ?? null, municipio: c.unidadeOrgaoMunicipioNome ?? null, modalidade: c.modalidadeNome ?? null,
    numero: c.numeroCompra ?? null, ano: c.anoCompraPncp ?? null, srp: c.srp ?? null, situacao: c.situacaoCompraNomePncp ?? null,
    valorEstimado: Number(c.valorTotalEstimado) || null, valorHomologado: Number(c.valorTotalHomologado) || null,
    abertura: c.dataAberturaPropostaPncp ?? null, encerramento: c.dataEncerramentoPropostaPncp ?? null, publicacao: c.dataPublicacaoPncp ?? null,
    itens: [...itens].sort((a, b) => a.numeroItemPncp - b.numeroItemPncp).map((i) => ({
      numero: i.numeroItemPncp, descricao: i.descricaodetalhada || i.descricaoResumida || '', resumo: i.descricaoResumida ?? null,
      tipo: i.materialOuServicoNome ?? null, quantidade: Number(i.quantidade) || null, unidade: i.unidadeMedida ?? null,
      valorEstimado: Number(i.valorUnitarioEstimado) || null, sigiloso: !!i.orcamentoSigiloso, situacao: i.situacaoCompraItemNome ?? null,
      criterio: i.criterioJulgamentoNome ?? null, beneficio: i.tipoBeneficioNome ?? null, grupo: i.numeroGrupo ?? null,
      marca: marcas[i.numeroItemCompra]?.marca ?? marcas[i.numeroItemPncp]?.marca ?? null,
      resultados: porItem.get(Number(i.numeroItemPncp)) ?? [],
    })),
  }
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
  const idCompra = String(req.query?.idCompra ?? '')
  if (!/^\d{15,20}$/.test(idCompra)) return res.status(400).json({ error: 'Código da compra inválido.' })
  try {
    const usuario = await usuarioLogado(base, anon, token)
    if (!usuario) return res.status(401).json({ error: 'Entre na sua conta' })
    if (excedeuLimite('compra', usuario)) return res.status(429).json({ error: 'Muitas consultas em pouco tempo. Aguarde um minuto e tente de novo.' })
    if (req.query?.so === 'controle') {
      const c = await emCache('compra-controle', idCompra, 60 * 60_000, async () => (await obter('modulo-contratacoes/1.1_consultarContratacoes_PNCP_14133_Id', { tipo: 'idCompra', codigo: idCompra }))[0] ?? null)
      if (!c?.numeroControlePNCP) return res.status(404).json({ error: 'Esta compra não tem edital no PNCP (pode ser anterior à Lei 14.133).' })
      return res.json({ controle: c.numeroControlePNCP })
    }
    const corpo = await emCache('compra', idCompra, 10 * 60_000, async () => {
    const [contratacoes, itens, resultados] = await Promise.all([
      obter('modulo-contratacoes/1.1_consultarContratacoes_PNCP_14133_Id', { tipo: 'idCompra', codigo: idCompra }),
      obter('modulo-contratacoes/2.1_consultarItensContratacoes_PNCP_14133_Id', { tipo: 'idCompra', codigo: idCompra }),
      obter('modulo-contratacoes/3.1_consultarResultadoItensContratacoes_PNCP_14133_Id', { tipo: 'idCompra', codigo: idCompra }),
    ])
    if (!contratacoes.length && !itens.length) throw Object.assign(new Error('Compra não encontrada nos dados abertos (pode ser anterior à Lei 14.133).'), { status: 404 })
    const marcas = await marcasDaCompra(idCompra, itens)
    return montarCompra(contratacoes[0], itens, resultados, marcas)
    })
    return res.json(corpo)
  } catch (e) {
    return res.status(e.status ?? 500).json({ error: e.status ? e.message : 'Não foi possível abrir a compra agora.' })
  }
}
