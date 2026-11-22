// Base de editais no Turso (libSQL/SQLite, banco "licitaforce" em São Paulo).
// O coletor grava aqui, direto do PNCP, os editais com proposta aberta e os itens dos que abrem em até 30 dias,
// sem pesar no Postgres do Supabase (plano Nano, 500 MB). O Supabase cuida do login/permissões e dispara a
// coleta a cada minuto (pg_cron → /api/oportunidades?acao=turso-coletar). A busca da tela de Oportunidades
// (modo "por data de abertura") lê daqui, com os mesmos filtros do buscar_oportunidades do Postgres.
// Conversa com o Turso pela API HTTP (/v2/pipeline), sem dependência nova. Passo a passo em docs/turso.md.
import { compraEnxuta, consultaFts, diaUtil, IDS_PORTAIS, portalDe, tempo, textoEdital, tipoPeloObjeto } from './turso-regras.js'

const PNCP = 'https://pncp.gov.br/api/consulta/v1'
const PNCP_ITENS = 'https://pncp.gov.br/api/pncp/v1/orgaos'
// Todas as modalidades da Lei 14.133 que a tela oferece (as sem edital aberto respondem vazio e passam rápido).
export const MODALIDADES = [6, 8, 4, 12, 5, 7, 9, 1, 2, 3, 10, 11, 13]
const VERSAO_ESQUEMA = '2'
const UA = { Accept: 'application/json', 'User-Agent': 'licitaflow-turso' }

export const ESQUEMA = [
  'drop table if exists editais_brutos',
  'drop table if exists editais_busca',
  `create table if not exists editais (
    controle text primary key, cnpj text not null, ano integer not null, sequencial integer not null,
    modalidade integer not null, portal text not null, uf text not null, situacao integer, srp integer, modo_disputa integer,
    valor real, orgao_cnpj text not null, orgao_nome text not null, publicacao text, encerramento text,
    tipo_objeto text, tipo_itens text, dia_util integer not null default 0,
    itens_completos integer not null default 0, quantidade_itens integer, itens_tentativas integer not null default 0,
    atualizado_pncp text, coletado_em text not null, compra text not null)`,
  'create index if not exists editais_encerramento on editais(encerramento)',
  'create index if not exists editais_uf_encerramento on editais(uf, encerramento)',
  'create index if not exists editais_itens_pendentes on editais(itens_completos, encerramento)',
  `create virtual table if not exists editais_fts using fts5(controle unindexed, texto, tokenize = 'unicode61 remove_diacritics 2')`,
  `create table if not exists itens (
    controle text not null, numero integer not null, descricao text, valor_unitario real, beneficio integer, sigiloso integer not null default 0,
    tipo text, quantidade real, unidade text, valor_total real, beneficio_nome text, criterio text, situacao text, grupo text, lote text,
    primary key (controle, numero)) without rowid`,
  `create virtual table if not exists itens_fts using fts5(controle unindexed, texto, tokenize = 'unicode61 remove_diacritics 2')`,
  'create table if not exists coleta_estado (chave text primary key, valor text not null, atualizado_em text not null)',
  `insert into coleta_estado(chave, valor, atualizado_em) values('esquema', '${VERSAO_ESQUEMA}', datetime('now'))
    on conflict(chave) do update set valor = excluded.valor, atualizado_em = excluded.atualizado_em`,
]

/** libsql://banco-org.turso.io → https://banco-org.turso.io */
export function urlHttp(url) {
  const u = String(url ?? '').trim().replace(/^libsql:\/\//, 'https://').replace(/\/+$/, '')
  return /^https:\/\/[a-z0-9.-]+$/i.test(u) ? u : null
}

const valor = (v) => v === null || v === undefined ? { type: 'null' }
  : typeof v === 'boolean' ? { type: 'integer', value: v ? '1' : '0' }
  : typeof v === 'number' ? (Number.isInteger(v) ? { type: 'integer', value: String(v) } : { type: 'float', value: v })
  : { type: 'text', value: String(v) }

/** Linhas da resposta do pipeline como objetos { coluna: valor }. */
export function linhas(resultado) {
  const r = resultado?.response?.result
  if (!r) return []
  const nomes = r.cols.map((c) => c.name)
  return r.rows.map((linha) => Object.fromEntries(linha.map((c, i) => [nomes[i], c.type === 'null' ? null : c.type === 'integer' ? Number(c.value) : c.value])))
}

/** Cliente mínimo. Devolve null quando o Turso não está configurado. */
export function clienteTurso(env = process.env, fetcher = fetch) {
  const base = urlHttp(env.TURSO_DATABASE_URL), token = env.TURSO_AUTH_TOKEN
  if (!base || !token) return null
  async function pipeline(comandos) {
    const requests = [...comandos.map(([sql, args = []]) => ({ type: 'execute', stmt: { sql, args: args.map(valor) } })), { type: 'close' }]
    const r = await fetcher(`${base}/v2/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }), signal: AbortSignal.timeout(25000) })
    const j = await r.json().catch(() => null)
    if (!r.ok || !j) throw Object.assign(new Error(`Turso respondeu ${r.status}`), { status: 502 })
    const erro = j.results?.find((x) => x.type === 'error')
    if (erro) throw Object.assign(new Error(`Turso: ${erro.error?.message ?? 'erro'}`), { status: 502 })
    return j.results.slice(0, comandos.length)
  }
  return {
    pipeline,
    consultar: async (sql, args) => linhas((await pipeline([[sql, args]]))[0]),
    /** Várias consultas numa ida só; devolve as linhas de cada uma. */
    lote: async (comandos) => (await pipeline(comandos)).map(linhas),
    prepararEsquema: () => pipeline(ESQUEMA.map((s) => [s])),
  }
}

// ======================================================================================= coleta

const agoraIso = () => new Date().toISOString()
const dia = (d) => d.toISOString().slice(0, 10).replace(/-/g, '')
const guardar = (chave, valor) => ['insert into coleta_estado(chave,valor,atualizado_em) values(?,?,?) on conflict(chave) do update set valor=excluded.valor, atualizado_em=excluded.atualizado_em', [chave, String(valor), agoraIso()]]

/** Colunas de um edital do PNCP. null se faltar identificação. */
export function linhaEdital(c) {
  const controle = c?.numeroControlePNCP, cnpj = c?.orgaoEntidade?.cnpj
  if (!/^\d{14}-\d-\d+\/\d{4}$/.test(controle ?? '') || !/^\d{14}$/.test(cnpj ?? '') || c.objetoCompra == null) return null
  const encerramento = tempo(c.dataEncerramentoProposta)
  return {
    controle, cnpj, ano: Number(c.anoCompra) || 0, sequencial: Number(c.sequencialCompra) || 0, modalidade: Number(c.modalidadeId) || 0,
    portal: portalDe(c), uf: c.unidadeOrgao?.ufSigla ?? '', situacao: Number(c.situacaoCompraId) || null, srp: c.srp === true ? 1 : c.srp === false ? 0 : null,
    modo_disputa: /^\d{1,2}$/.test(String(c.modoDisputaId ?? '')) ? Number(c.modoDisputaId) : null,
    valor: Number(c.valorTotalEstimado) || null, orgao_cnpj: cnpj, orgao_nome: c.orgaoEntidade?.razaoSocial ?? '',
    publicacao: tempo(c.dataPublicacaoPncp), encerramento, tipo_objeto: tipoPeloObjeto(c.objetoCompra), dia_util: diaUtil(encerramento),
    atualizado_pncp: tempo(c.dataAtualizacaoGlobal ?? c.dataAtualizacao), compra: JSON.stringify(compraEnxuta(c)), texto: textoEdital(c),
  }
}

/**
 * Grava uma página de editais: só os novos ou que mudaram na fonte (economiza escrita no Turso).
 * Edital que mudou perde os itens (são coletados de novo).
 */
export async function gravarEditais(turso, lista, agora = agoraIso()) {
  const novos = lista.map(linhaEdital).filter(Boolean)
  if (!novos.length) return 0
  const existentes = new Map((await turso.consultar(`select controle, atualizado_pncp from editais where controle in (${novos.map(() => '?').join(',')})`, novos.map((n) => n.controle))).map((l) => [l.controle, l.atualizado_pncp]))
  const mudaram = novos.filter((n) => !existentes.has(n.controle) || (n.atualizado_pncp ?? '') > (existentes.get(n.controle) ?? ''))
  if (!mudaram.length) return 0
  const comandos = []
  for (const n of mudaram) {
    comandos.push([`insert into editais(controle,cnpj,ano,sequencial,modalidade,portal,uf,situacao,srp,modo_disputa,valor,orgao_cnpj,orgao_nome,publicacao,encerramento,tipo_objeto,dia_util,atualizado_pncp,coletado_em,compra)
      values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      on conflict(controle) do update set modalidade=excluded.modalidade,portal=excluded.portal,uf=excluded.uf,situacao=excluded.situacao,srp=excluded.srp,
        modo_disputa=coalesce(excluded.modo_disputa,editais.modo_disputa),valor=excluded.valor,orgao_nome=excluded.orgao_nome,publicacao=excluded.publicacao,
        encerramento=excluded.encerramento,tipo_objeto=excluded.tipo_objeto,dia_util=excluded.dia_util,atualizado_pncp=excluded.atualizado_pncp,
        coletado_em=excluded.coletado_em,compra=excluded.compra,itens_completos=0,quantidade_itens=null,tipo_itens=null,itens_tentativas=0`,
    [n.controle, n.cnpj, n.ano, n.sequencial, n.modalidade, n.portal, n.uf, n.situacao, n.srp, n.modo_disputa, n.valor, n.orgao_cnpj, n.orgao_nome, n.publicacao, n.encerramento, n.tipo_objeto, n.dia_util, n.atualizado_pncp, agora, n.compra]])
    comandos.push(['delete from editais_fts where controle = ?', [n.controle]], ['insert into editais_fts(controle, texto) values(?, ?)', [n.controle, n.texto]])
    if (existentes.has(n.controle)) comandos.push(['delete from itens where controle = ?', [n.controle]], ['delete from itens_fts where controle = ?', [n.controle]])
  }
  await turso.pipeline(comandos)
  return mudaram.length
}

async function lerPagina(fetcher, url) {
  const r = await fetcher(url, { headers: UA, signal: AbortSignal.timeout(20000) })
  if (r.status === 204) return { lista: [], paginas: 0 }
  if (r.status === 429) throw Object.assign(new Error('PNCP pediu para esperar'), { pausa: true })
  if (!r.ok) throw Object.assign(new Error(`PNCP ${r.status}`), { status: r.status })
  const j = await r.json()
  return { lista: Array.isArray(j.data) ? j.data : [], paginas: Number(j.totalPaginas) || 0 }
}

/** Itens de um edital (até 1.000), gravados de uma vez. Devolve false se a fonte falhou. */
async function coletarItens(turso, e, fetcher) {
  const itens = []
  for (let pagina = 1; pagina <= 2; pagina++) {
    const r = await fetcher(`${PNCP_ITENS}/${e.cnpj}/compras/${e.ano}/${e.sequencial}/itens?pagina=${pagina}&tamanhoPagina=500`, { headers: UA, signal: AbortSignal.timeout(20000) })
    if (r.status === 429) throw Object.assign(new Error('PNCP pediu para esperar'), { pausa: true })
    if (r.status === 204 || r.status === 404) break
    if (!r.ok) return false
    const lista = await r.json().catch(() => null)
    if (!Array.isArray(lista)) return false
    itens.push(...lista)
    if (lista.length < 500) break
  }
  const unicos = [...new Map(itens.filter((i) => Number.isInteger(i?.numeroItem)).map((i) => [i.numeroItem, i])).values()]
  const tipos = [...new Set(unicos.map((i) => i.materialOuServico).filter((t) => t === 'M' || t === 'S'))].sort().join('') || null
  const comandos = [['delete from itens where controle = ?', [e.controle]], ['delete from itens_fts where controle = ?', [e.controle]]]
  for (const i of unicos) {
    const sigilo = i.orcamentoSigiloso === true
    comandos.push(['insert into itens(controle,numero,descricao,valor_unitario,beneficio,sigiloso,tipo,quantidade,unidade,valor_total,beneficio_nome,criterio,situacao,grupo,lote) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [e.controle, i.numeroItem, String(i.descricao ?? '').slice(0, 2048), sigilo ? null : Number(i.valorUnitarioEstimado) || null, Number(i.tipoBeneficio) || null, sigilo ? 1 : 0,
        i.materialOuServico ?? null, Number(i.quantidade) || null, i.unidadeMedida ?? null, sigilo ? null : Number(i.valorTotal) || null, i.tipoBeneficioNome ?? null,
        i.criterioJulgamentoNome ?? null, i.situacaoCompraItemNome ?? null, i.numeroGrupo != null ? String(i.numeroGrupo) : null, i.numeroLote != null ? String(i.numeroLote) : null]])
  }
  if (unicos.length) comandos.push(['insert into itens_fts(controle, texto) values(?, ?)', [e.controle, unicos.map((i) => i.descricao ?? '').join(' ').slice(0, 400000)]])
  comandos.push(['update editais set itens_completos = 1, quantidade_itens = ?, tipo_itens = ? where controle = ?', [unicos.length, tipos, e.controle]])
  await turso.pipeline(comandos)
  return true
}

/**
 * Limita e espaça as consultas ao PNCP numa rodada (o PNCP responde 429 quando recebe muitas seguidas).
 * Passado o limite, a consulta falha com { fim: true } e a rodada encerra a etapa.
 */
export function pncpComLimite(fetcher, maximo = 20, intervaloMs = 300) {
  let feitas = 0, ultima = 0
  const f = async (url, opcoes) => {
    if (feitas >= maximo) throw Object.assign(new Error('Limite da rodada'), { fim: true })
    feitas++
    const espera = ultima + intervaloMs - Date.now()
    if (espera > 0) await new Promise((r) => setTimeout(r, espera))
    ultima = Date.now()
    return fetcher(url, opcoes)
  }
  f.restantes = () => maximo - feitas
  return f
}

/**
 * Uma rodada (até ~40 s e no máximo 30 consultas ao PNCP, espaçadas):
 * 1. carga completa dos editais com proposta aberta, uma vez por dia, continuando de onde parou (é ela que libera a busca);
 * 2. editais atualizados hoje, 3 modalidades por rodada em rodízio (a última página fica aberta para pegar o que entrou depois);
 * 3. itens dos editais que abrem em até 30 dias, os mais próximos primeiro;
 * 4. limpeza dos encerrados há mais de 2 dias.
 * Uma falha do PNCP numa etapa não derruba as outras; um 429 pausa a coleta por 3 minutos.
 */
export async function coletarRodada(turso, { prazo = Date.now() + 40_000, fetcher = fetch, hoje = new Date(), maxConsultas = 30, intervaloMs = 300 } = {}) {
  let estadoLinhas
  try { estadoLinhas = await turso.consultar('select chave, valor from coleta_estado') } catch { estadoLinhas = [] }
  let estado = Object.fromEntries(estadoLinhas.map((l) => [l.chave, l.valor]))
  if (estado.esquema !== VERSAO_ESQUEMA) { await turso.prepararEsquema(); estado = {} }
  if (estado.pausado_ate && estado.pausado_ate > agoraIso()) return [{ pausado: estado.pausado_ate }]
  const data = dia(hoje), feitos = [], tempoAte = (fracao) => Date.now() < prazo - (1 - fracao) * 40_000
  const pncp = pncpComLimite(fetcher, maxConsultas, intervaloMs)
  let pausar = false
  async function etapa(nome, fn) {
    if (pausar) return
    try { await fn() } catch (e) {
      if (e.pausa) { pausar = true; feitos.push({ etapa: nome, pausado: true }) }
      else if (!e.fim) feitos.push({ etapa: nome, erro: String(e.message ?? e).slice(0, 120) })
    }
  }

  // 1. Carga completa diária (até 55% do tempo e metade das consultas). Cursor "dia:índice da modalidade:página".
  await etapa('carga', async () => {
    let [diaCarga, im, pg] = String(estado.carga ?? '').split(':')
    if (diaCarga !== data && !(estado.carga_completa_em ?? '').startsWith(hoje.toISOString().slice(0, 10))) { diaCarga = data; im = 0; pg = 1 }
    im = Number(im) || 0; pg = Number(pg) || 1
    const limiteData = `${hoje.getUTCFullYear() + 1}1231`
    while (diaCarga === data && im < MODALIDADES.length && tempoAte(0.55) && pncp.restantes() > Math.floor(maxConsultas / 2)) {
      const { lista, paginas } = await lerPagina(pncp, `${PNCP}/contratacoes/proposta?dataFinal=${limiteData}&codigoModalidadeContratacao=${MODALIDADES[im]}&pagina=${pg}&tamanhoPagina=50`)
      const gravados = await gravarEditais(turso, lista)
      feitos.push({ etapa: 'carga', modalidade: MODALIDADES[im], pagina: pg, de: paginas, gravados })
      if (!lista.length || pg >= paginas) { im++; pg = 1 } else pg++
      const comandos = [guardar('carga', `${diaCarga}:${im}:${pg}`)]
      if (im >= MODALIDADES.length) comandos.push(guardar('carga_completa_em', agoraIso()))
      await turso.pipeline(comandos)
    }
  })
  // 2. Atualizações do dia: 3 modalidades por rodada, em rodízio.
  await etapa('atualizacao', async () => {
    const vez = Number(estado.atualizacao_vez) || 0
    for (let k = 0; k < 3 && tempoAte(0.65); k++) {
      const m = MODALIDADES[(vez + k) % MODALIDADES.length], chave = `atualizacao-${m}`
      let [diaVisto, pagina] = String(estado[chave] ?? '').split(':')
      pagina = diaVisto === data ? Math.max(1, Number(pagina) || 1) : 1
      const { lista, paginas } = await lerPagina(pncp, `${PNCP}/contratacoes/atualizacao?dataInicial=${data}&dataFinal=${data}&codigoModalidadeContratacao=${m}&pagina=${pagina}&tamanhoPagina=50`)
      const gravados = await gravarEditais(turso, lista)
      const proxima = lista.length === 50 && pagina < paginas ? pagina + 1 : pagina
      await turso.pipeline([guardar(chave, `${data}:${proxima}`), guardar('atualizacao_vez', (vez + k + 1) % MODALIDADES.length)])
      feitos.push({ etapa: 'atualizacao', modalidade: m, pagina, editais: lista.length, gravados })
    }
  })
  // 3. Itens dos que abrem em até 30 dias (2 por vez), com as consultas que sobraram.
  await etapa('itens', async () => {
    const ate30 = new Date(Date.now() + 30 * 86400_000).toISOString()
    let total = 0, falhas = 0
    while (tempoAte(0.9) && pncp.restantes() > 0) {
      const fila = await turso.consultar('select controle, cnpj, ano, sequencial from editais where itens_completos = 0 and itens_tentativas < 5 and encerramento >= ? and encerramento <= ? order by encerramento limit ?', [agoraIso(), ate30, Math.min(6, pncp.restantes())])
      if (!fila.length) break
      for (let k = 0; k < fila.length && tempoAte(0.9) && pncp.restantes() > 0; k += 2) {
        const lote = fila.slice(k, k + 2)
        const res = await Promise.all(lote.map(async (e) => ({ e, ok: await coletarItens(turso, e, pncp).catch((err) => { if (err.pausa || err.fim) throw err; return false }) })))
        total += res.length
        const ruins = res.filter((r) => !r.ok)
        falhas += ruins.length
        if (ruins.length) await turso.pipeline(ruins.map((r) => ['update editais set itens_tentativas = itens_tentativas + 1 where controle = ?', [r.e.controle]]))
      }
    }
    if (total) feitos.push({ etapa: 'itens', editais: total, falhas })
  })
  // 4. Limpeza (encerrados há mais de 2 dias), no máximo 300 por rodada.
  await etapa('limpeza', async () => {
    const velhos = (await turso.consultar('select controle from editais where encerramento < ? limit 300', [new Date(Date.now() - 2 * 86400_000).toISOString()])).map((l) => l.controle)
    if (!velhos.length) return
    const marcas = velhos.map(() => '?').join(',')
    await turso.pipeline([[`delete from itens where controle in (${marcas})`, velhos], [`delete from itens_fts where controle in (${marcas})`, velhos], [`delete from editais_fts where controle in (${marcas})`, velhos], [`delete from editais where controle in (${marcas})`, velhos]])
    feitos.push({ etapa: 'limpeza', editais: velhos.length })
  })
  const fim = [guardar('ultima_coleta_em', agoraIso())]
  if (pausar) fim.push(guardar('pausado_ate', new Date(Date.now() + 3 * 60_000).toISOString()))
  await turso.pipeline(fim)
  return feitos
}

// ======================================================================================= busca

const TODAS_MODALIDADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
const DATA = /^\d{4}-\d{2}-\d{2}$/
const numero = (v) => (v === '' || v === null || v === undefined ? null : Number(v))
const inicioDiaSP = (d) => new Date(`${d}T00:00:00-03:00`).toISOString()
const fimDiaSP = (d) => new Date(new Date(`${d}T00:00:00-03:00`).getTime() + 86400_000).toISOString()

export class FiltroInvalido extends Error {}

/** Monta o WHERE da busca (modo "por data de abertura") com os mesmos filtros do buscar_oportunidades. */
export function montarFiltros(f, agora = agoraIso()) {
  const termo = String(f.busca ?? '').trim(), excluir = String(f.excluir ?? '').trim(), tipo = String(f.tipoItem ?? '')
  if (termo.length > 300 || excluir.length > 300 || !['', 'M', 'S'].includes(tipo)) throw new FiltroInvalido('Filtros inválidos')
  const mods = (Array.isArray(f.modalidades) ? f.modalidades : TODAS_MODALIDADES).map(Number).filter((m) => Number.isInteger(m))
  const portais = (Array.isArray(f.portais) ? f.portais : IDS_PORTAIS).map(String).filter((p) => IDS_PORTAIS.includes(p))
  if (!mods.length || !portais.length) throw new FiltroInvalido('Selecione modalidade e portal')
  const abDe = DATA.test(f.aberturaDe ?? '') ? f.aberturaDe : null, abAte = DATA.test(f.aberturaAte ?? '') ? f.aberturaAte : null
  if (abDe && abAte && abDe > abAte) throw new FiltroInvalido('Período de abertura inválido')
  const vMin = numero(f.minimo), vMax = numero(f.maximo), iMin = numero(f.itemMinimo), iMax = numero(f.itemMaximo), maxItens = numero(f.maxItens)
  if ([vMin, vMax, iMin, iMax].some((v) => v !== null && (!Number.isFinite(v) || v < 0)) || (vMin !== null && vMax !== null && vMin > vMax) || (iMin !== null && iMax !== null && iMin > iMax) || (maxItens !== null && !(maxItens >= 1))) throw new FiltroInvalido('Valores inválidos')
  const q = consultaFts(termo), qEx = consultaFts(excluir)
  if (termo && !q) throw new FiltroInvalido('Informe uma palavra-chave para pesquisar')
  const modos = (Array.isArray(f.modosDisputa) ? f.modosDisputa : []).map(Number).filter(Number.isInteger)
  const porItem = iMin !== null || iMax !== null || maxItens !== null || f.exclusivo === true

  const onde = [], args = []
  if (q) { onde.push('e.controle in (select controle from editais_fts where editais_fts match ? union select controle from itens_fts where itens_fts match ?)'); args.push(q, q) }
  if (qEx) { onde.push('e.controle not in (select controle from editais_fts where editais_fts match ?)'); args.push(qEx) }
  onde.push(`e.modalidade in (${mods.map(() => '?').join(',')})`, `e.portal in (${portais.map(() => '?').join(',')})`); args.push(...mods, ...portais)
  if (/^[A-Z]{2}$/.test(f.uf ?? '')) { onde.push('e.uf = ?'); args.push(f.uf) }
  if (/^\d{14}$/.test(f.orgao ?? '')) { onde.push('e.orgao_cnpj = ?'); args.push(f.orgao) }
  const desde = abDe && inicioDiaSP(abDe) > agora ? inicioDiaSP(abDe) : agora
  onde.push('e.encerramento >= ?'); args.push(desde)
  if (abAte) { onde.push('e.encerramento < ?'); args.push(fimDiaSP(abAte)) }
  onde.push('coalesce(e.situacao, 1) = 1')
  if (f.diasUteis === true) onde.push('e.dia_util = 1')
  if (f.excluirSrp === true) onde.push('e.srp = 0')
  if (modos.length) { onde.push(`e.modo_disputa in (${modos.map(() => '?').join(',')})`); args.push(...modos) }
  if (f.naoDivulgado === true) onde.push('coalesce(e.valor, 0) = 0')
  else {
    if (vMin !== null) { onde.push('e.valor > 0 and e.valor >= ?'); args.push(vMin) }
    if (vMax !== null) { onde.push('e.valor > 0 and e.valor <= ?'); args.push(vMax) }
  }
  // Filtros que não dependem dos itens; os de item entram depois (para contar os pendentes, como no Postgres).
  const base = { onde: [...onde], args: [...args] }
  if (tipo) { onde.push("instr(coalesce(e.tipo_itens, '') || coalesce(e.tipo_objeto, ''), ?) > 0"); args.push(tipo) }
  if (porItem) {
    onde.push('e.itens_completos = 1')
    if (maxItens !== null) { onde.push('e.quantidade_itens <= ?'); args.push(maxItens) }
    if (iMin !== null || iMax !== null || f.exclusivo === true) {
      const cond = ['i.controle = e.controle']
      if (f.exclusivo === true) cond.push('i.beneficio = 1')
      if (iMin !== null || iMax !== null) cond.push('i.sigiloso = 0 and i.valor_unitario > 0')
      if (iMin !== null) { cond.push('i.valor_unitario >= ?'); args.push(iMin) }
      if (iMax !== null) { cond.push('i.valor_unitario <= ?'); args.push(iMax) }
      onde.push(`exists (select 1 from itens i where ${cond.join(' and ')})`)
    }
  }
  return { onde, args, base, porItem, comTermo: !!q, inverter: f.inverter === true }
}

/** Situação da base para a tela (mesmo formato do status do catálogo do Postgres). */
export async function situacaoTurso(turso) {
  const [[n], [abertos], [itens], estado] = await turso.lote([
    ['select count(*) as n from editais'],
    ['select count(*) as n from editais where encerramento >= ?', [agoraIso()]],
    ['select count(*) as n from editais where itens_completos = 1'],
    ['select chave, valor from coleta_estado'],
  ])
  const e = Object.fromEntries(estado.map((l) => [l.chave, l.valor]))
  return { editais: n?.n ?? 0, abertos: abertos?.n ?? 0, comItens: itens?.n ?? 0, ultimaColeta: e.ultima_coleta_em ?? null, cargaCompletaEm: e.carga_completa_em ?? null, pausadoAte: e.pausado_ate ?? null, carga: e.carga ?? null }
}

/** Busca no Turso no formato de resposta do buscar_oportunidades (ResultadoIndice). */
export async function buscarTurso(turso, filtros, pagina = 1, tamanho = 20) {
  if (!Number.isInteger(pagina) || pagina < 1 || pagina > 100000) throw new FiltroInvalido('Filtros inválidos')
  const { onde, args, base, porItem, comTermo, inverter } = montarFiltros(filtros ?? {})
  const ordem = inverter ? 'e.encerramento desc, e.controle' : 'e.encerramento asc, e.controle'
  const comandos = [
    [`select e.compra, e.modo_disputa, e.tipo_itens, e.tipo_objeto from editais e where ${onde.join(' and ')} order by ${ordem} limit ? offset ?`, [...args, tamanho, (pagina - 1) * tamanho]],
    [`select count(*) as n from editais e where ${onde.join(' and ')}`, args],
    [`select e.orgao_cnpj as cnpj, min(e.orgao_nome) as razaoSocial from editais e where ${base.onde.join(' and ')} group by e.orgao_cnpj order by 2 limit 200`, base.args],
    ['select chave, valor from coleta_estado'],
    ['select count(*) as n from editais'],
  ]
  // Cobertura dos itens nos editais que abrem em até 30 dias (a palavra-chave também procura nos itens).
  const agora = agoraIso(), ate30 = new Date(Date.now() + 30 * 86400_000).toISOString()
  comandos.push(['select count(*) as total, sum(itens_completos) as com from editais where encerramento >= ? and encerramento <= ?', [agora, ate30]])
  if (porItem) comandos.push([`select count(*) as n from editais e where ${base.onde.join(' and ')} and e.itens_completos = 0`, base.args])
  const [paginaLinhas, [total], orgaos, estado, [indexados], [cobertura], pendentes] = await turso.lote(comandos)
  const e = Object.fromEntries(estado.map((l) => [l.chave, l.valor]))
  const n = total?.n ?? 0
  return {
    data: paginaLinhas.map((l) => {
      const c = JSON.parse(l.compra), tipo = l.tipo_itens ?? l.tipo_objeto
      return { ...c, ...(l.modo_disputa != null ? { modoDisputaId: l.modo_disputa } : {}), ...(tipo ? { materialOuServico: tipo } : {}), ...(!l.tipo_itens && l.tipo_objeto ? { tipoEstimado: true } : {}) }
    }),
    totalRegistros: n, totalPaginas: Math.ceil(n / tamanho), orgaos,
    catalogo: {
      iniciado_em: null, ultima_coleta_em: e.ultima_coleta_em ?? null, ultima_carga_completa_em: e.carga_completa_em ?? null,
      carga_inicial_concluida: !!e.carga_completa_em, editais_indexados: indexados?.n ?? 0, editais_com_itens: 0, paginas_coletadas: 0, paginas_planejadas: 0,
      pausado_ate: e.pausado_ate ?? null, aviso: null, fonte: 'turso',
    },
    detalhesPendentes: porItem ? (pendentes?.[0]?.n ?? 0) : 0,
    coberturaItens: cobertura?.total ? (cobertura.com ?? 0) / cobertura.total : 0, comTermo,
  }
}
