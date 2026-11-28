// Base de editais no Turso (libSQL/SQLite, banco "licitaforce" em São Paulo).
// O coletor grava aqui, direto do PNCP, os editais com proposta aberta e os itens dos que abrem em até 30 dias,
// sem pesar no Postgres do Supabase (plano Nano, 500 MB). O Supabase cuida do login/permissões e dispara a
// coleta a cada minuto (pg_cron → /api/oportunidades?acao=turso-coletar). A busca da tela de Oportunidades
// (modo "por data de abertura") lê daqui, com os mesmos filtros do buscar_oportunidades do Postgres.
// Conversa com o Turso pela API HTTP (/v2/pipeline), sem dependência nova. Passo a passo em docs/turso.md.
import { createHash } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { compraEnxuta, consultaFts, diaUtil, filtroDescricao, IDS_PORTAIS, PORTAIS_NOVOS, portalDe, tempo, textoEdital, tipoPeloObjeto } from './turso-regras.js'
import { chavesConsumo, cicloAtual, comandoSomar, configCota, nivelCota, peloMenos } from './turso-cota.js'

const PNCP = 'https://pncp.gov.br/api/consulta/v1'
const PNCP_ITENS = 'https://pncp.gov.br/api/pncp/v1/orgaos'
// Todas as modalidades da Lei 14.133 que a tela oferece (as sem edital aberto respondem vazio e passam rápido).
export const MODALIDADES = [6, 8, 4, 12, 5, 7, 9, 1, 2, 3, 10, 11, 13]
const VERSAO_ESQUEMA = '2'
const LIMITE_CARGA = '20991231'
const UA = { Accept: 'application/json', 'User-Agent': 'licitaforce-turso' }
// Histórico de encerrados: 12 meses, sem dispensa (8) e inexigibilidade (9), que são ~65% do volume e não caberiam
// nos 5 GB do plano grátis. Os itens dos encerrados não ficam (só os dos abertos).
export const HISTORICO_DIAS = 365
export const SEM_HISTORICO = [8, 9]
export const MODALIDADES_HISTORICO = MODALIDADES.filter((m) => !SEM_HISTORICO.includes(m))
// Índices da busca no histórico (a base passa de ~36 mil para ~600 mil editais). Criados uma vez (marca em coleta_estado).
export const INDICES_HISTORICO = [
  'create index if not exists editais_modalidade_encerramento on editais(modalidade, encerramento)',
  'create index if not exists editais_orgao_encerramento on editais(orgao_cnpj, encerramento)',
  'create index if not exists editais_publicacao on editais(publicacao)',
]

// itens_completos: 0 = nunca coletados; 1 = completos; 2 = completos, mas o edital mudou e eles serão conferidos de novo
// (a busca continua usando os itens guardados; só regrava se a lista mudou de fato).
// Índices "cobrindo" as colunas dos filtros: contar e paginar lê só o índice, sem abrir cada linha da tabela
// (no Turso cada linha aberta conta como lida). A ordem (encerramento, controle) é a mesma da busca: sem ordenação extra.
const COLUNAS_FILTRO = 'situacao, modalidade, portal, valor, srp, dia_util, modo_disputa, orgao_cnpj, itens_completos, tipo_objeto, tipo_itens'
export const INDICES_EDITAIS = [
  // Um índice largo só (com o histórico são ~600 mil editais: cada índice largo custa uma escrita por edital ao ser
  // criado). Cobre também a UF e o nome do órgão: a lista de órgãos agrupa por aqui sem abrir a tabela.
  `create index if not exists editais_abertos on editais(encerramento, controle, uf, ${COLUNAS_FILTRO}, orgao_nome)`,
  // Fila de itens: só os que faltam (índice parcial pequeno, em vez de varrer os completos a cada rodada).
  'create index if not exists editais_fila_itens on editais(encerramento) where itens_completos <> 1 and itens_tentativas < 5',
  // Os que têm itens guardados (só os abertos e recém-encerrados): a limpeza do histórico e a contagem leem só eles.
  'create index if not exists editais_com_itens on editais(encerramento) where itens_completos <> 0',
]
// Busca por estado: o editais_abertos começa pelo encerramento, então filtrar um estado pequeno (ex.: AC) percorria
// todos os ~36 mil abertos para achar uma centena. Este começa pela UF e cobre os mesmos filtros (sem abrir a tabela).
// Criado uma vez (marca 'indice_uf' em coleta_estado).
export const INDICE_UF = `create index if not exists editais_uf_abertos on editais(uf, encerramento, controle, ${COLUNAS_FILTRO}, orgao_nome)`
// Contagens da busca guardadas no próprio Turso: valem para todas as instâncias da Vercel (a memória de cada uma some
// a cada partida a frio) e evitam recontar dezenas de milhares de linhas a cada filtro repetido.
export const CACHE_BUSCA = [
  'create table if not exists cache_busca (chave text primary key, valor text not null, expira text not null) without rowid',
  'create index if not exists cache_busca_expira on cache_busca(expira)',
]

export const ESQUEMA = [
  'drop table if exists editais_brutos',
  'drop table if exists editais_busca',
  `create table if not exists editais (
    controle text primary key, cnpj text not null, ano integer not null, sequencial integer not null,
    modalidade integer not null, portal text not null, uf text not null, situacao integer, srp integer, modo_disputa integer,
    valor real, orgao_cnpj text not null, orgao_nome text not null, publicacao text, encerramento text,
    tipo_objeto text, tipo_itens text, dia_util integer not null default 0,
    itens_completos integer not null default 0, quantidade_itens integer, itens_tentativas integer not null default 0,
    atualizado_pncp text, coletado_em text not null, compra text not null, hash text, itens_hash text)`,
  ...INDICES_EDITAIS,
  ...INDICES_HISTORICO,
  INDICE_UF,
  `create virtual table if not exists editais_fts using fts5(controle unindexed, texto, tokenize = 'unicode61 remove_diacritics 2')`,
  `create table if not exists itens (
    controle text not null, numero integer not null, descricao text, valor_unitario real, beneficio integer, sigiloso integer not null default 0,
    tipo text, quantidade real, unidade text, valor_total real, beneficio_nome text, criterio text, situacao text, grupo text, lote text,
    primary key (controle, numero)) without rowid`,
  `create virtual table if not exists itens_fts using fts5(controle unindexed, texto, tokenize = 'unicode61 remove_diacritics 2')`,
  'create table if not exists coleta_estado (chave text primary key, valor text not null, atualizado_em text not null)',
  ...CACHE_BUSCA,
  `insert into coleta_estado(chave, valor, atualizado_em) values('esquema', '${VERSAO_ESQUEMA}', datetime('now'))
    on conflict(chave) do update set valor = excluded.valor, atualizado_em = excluded.atualizado_em`,
]

/**
 * Uma vez só: refaz os FTS com o rowid do edital (antes era um rowid qualquer e o apagar procurava por "controle",
 * coluna sem índice, lendo a tabela inteira a cada edital gravado; foi isso que estourou a cota de leituras).
 * Roda com turso.transacao (batch com condições): se um passo falha, os seguintes não rodam e tudo volta atrás;
 * a próxima rodada tenta de novo.
 * Atenção: o rowid implícito de "editais" (chave de texto) pode mudar num VACUUM. O Turso não faz VACUUM sozinho;
 * se um dia alguém rodar, apague 'fts_rowid' de coleta_estado para a migração refazer o vínculo.
 */
export const MIGRAR_FTS_ROWID = [...['editais_fts', 'itens_fts'].flatMap((t) => [
  [`drop table if exists ${t}_n`],
  [`create virtual table ${t}_n using fts5(controle unindexed, texto, tokenize = 'unicode61 remove_diacritics 2')`],
  [`insert into ${t}_n(rowid, controle, texto) select e.rowid, e.controle, f.texto from (select controle, max(texto) as texto from ${t} group by controle) f join editais e on e.controle = f.controle`],
  [`drop table ${t}`],
  [`alter table ${t}_n rename to ${t}`],
]), ["insert into coleta_estado(chave,valor,atualizado_em) values('fts_rowid','1',datetime('now')) on conflict(chave) do update set valor=excluded.valor, atualizado_em=excluded.atualizado_em"]]

/**
 * Uma vez só, em bases criadas antes da economia de cota: colunas de hash (para não regravar o que não mudou),
 * índices que cobrem os filtros, fila parcial de itens e a tabela de cache das contagens.
 * Tudo idempotente: se cair no meio, a próxima rodada termina.
 */
export async function migrarOtimizacao(turso) {
  const colunas = new Set((await turso.consultar('pragma table_info(editais)')).map((c) => c.name))
  const comandos = []
  for (const c of ['hash', 'itens_hash']) if (!colunas.has(c)) comandos.push([`alter table editais add column ${c} text`])
  comandos.push(...['editais_encerramento', 'editais_uf_encerramento', 'editais_itens_pendentes'].map((i) => [`drop index if exists ${i}`]),
    ...INDICES_EDITAIS.map((s) => [s]), ...CACHE_BUSCA.map((s) => [s]),
    ["insert into coleta_estado(chave,valor,atualizado_em) values('otimizacao','1',datetime('now')) on conflict(chave) do update set valor=excluded.valor, atualizado_em=excluded.atualizado_em"])
  await turso.pipeline(comandos)
}

/** Resumo curto e estável de um valor (detecta mudança real sem comparar o JSON inteiro). */
export const resumo = (v) => createHash('sha1').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('base64url').slice(0, 16)

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

// Consumo ainda não somado no banco, por banco (a instância da Vercel atende vários pedidos seguidos).
const PENDENTE = new Map()
// Banco bloqueado pelo Turso (cota do mês estourada): até quando esta instância nem tenta.
const BLOQUEIO = new Map()
const ESPERA_BLOQUEIO_MS = 15 * 60_000

/** O Turso recusa com o código BLOCKED quando o mês passa da cota de linhas lidas/escritas (ou do espaço). */
export const ehBloqueio = (erro) => /blocked/i.test(String(erro?.code ?? '')) || /blocked|limit exceeded|quota|forbidden/i.test(String(erro?.message ?? erro?.error ?? ''))

/** Erro de banco bloqueado: o app manda a busca para o Postgres e a coleta espera, sem martelar o Turso. */
export class BloqueioTurso extends Error {
  constructor(mensagem, ate) { super(mensagem); this.status = 503; this.bloqueado = true; this.ate = ate }
}

/** Até quando o banco está marcado como bloqueado nesta instância (ou null). */
export function bloqueadoAte(env = process.env) {
  const base = urlHttp(env.TURSO_DATABASE_URL), ate = base ? BLOQUEIO.get(base) : null
  return ate && ate > Date.now() ? new Date(ate).toISOString() : null
}

/** Linhas lidas/escritas que o Turso informa em cada resposta do pipeline (execute e batch). */
export function consumoDaResposta(j) {
  let lidas = 0, escritas = 0
  const somar = (r) => { if (r) { lidas += Number(r.rows_read) || 0; escritas += Number(r.rows_written) || 0 } }
  for (const x of j?.results ?? []) {
    if (x?.type !== 'ok') continue
    if (x.response?.type === 'execute') somar(x.response.result)
    else if (x.response?.type === 'batch') for (const s of x.response.result?.step_results ?? []) somar(s)
  }
  return { lidas, escritas }
}

/** Cliente mínimo. Devolve null quando o Turso não está configurado. */
export function clienteTurso(env = process.env, fetcher = fetch) {
  const base = urlHttp(env.TURSO_DATABASE_URL), token = env.TURSO_AUTH_TOKEN
  if (!base || !token) return null
  const cota = configCota(env)
  const pend = PENDENTE.get(base) ?? { lidas: 0, escritas: 0, em: Date.now() }
  PENDENTE.set(base, pend)
  /**
   * O consumo medido vai junto do próximo pedido (sem ida extra ao banco): no máximo uma vez por minuto,
   * ou já quando acumula bastante, ou quando a coleta pede (fim da rodada).
   */
  const marcarBloqueio = (erro) => {
    const ate = Date.now() + ESPERA_BLOQUEIO_MS
    BLOQUEIO.set(base, ate)
    return new BloqueioTurso(`Turso bloqueou o banco: ${String(erro?.message ?? 'cota do mês estourada').slice(0, 160)}`, new Date(ate).toISOString())
  }
  /** Erro de uma resposta: vira BloqueioTurso se o Turso disse que o banco está bloqueado. */
  const falha = (erro) => ehBloqueio(erro) ? marcarBloqueio(erro) : Object.assign(new Error(`Turso: ${erro?.message ?? 'erro'}`), { status: 502 })
  async function enviar(requests, ms = 25000, descarregar = false) {
    const bloq = BLOQUEIO.get(base)
    if (bloq && bloq > Date.now()) throw new BloqueioTurso('Turso bloqueou o banco (cota do mês)', new Date(bloq).toISOString())
    const somar = []
    const lidas = pend.lidas, escritas = pend.escritas
    if ((lidas || escritas) && (descarregar || lidas >= 100_000 || escritas >= 2_000 || Date.now() - pend.em >= 60_000)) {
      const k = chavesConsumo(cicloAtual(new Date(), cota.diaCiclo).chave)
      for (const [chave, n] of [[k.lidas, lidas], [k.escritas, escritas]]) if (n) { const [sql, args] = comandoSomar(chave, n); somar.push({ type: 'execute', stmt: { sql, args: args.map(valor) } }) }
      // Reserva já: dois pedidos ao mesmo tempo não somam o mesmo consumo duas vezes. Se falhar, devolve.
      pend.lidas -= lidas; pend.escritas -= escritas; pend.em = Date.now()
    }
    const devolver = () => { if (somar.length) { pend.lidas += lidas; pend.escritas += escritas } }
    let r, j
    try {
      r = await fetcher(`${base}/v2/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ requests: [...requests, ...somar, { type: 'close' }] }), signal: AbortSignal.timeout(ms) })
      j = await r.json().catch(() => null)
    } catch (e) { devolver(); throw e }
    if (!r.ok || !j) {
      devolver()
      const e = j?.error ?? j
      if (ehBloqueio(e)) throw marcarBloqueio(e)
      throw Object.assign(new Error(`Turso respondeu ${r.status}`), { status: 502 })
    }
    BLOQUEIO.delete(base)
    if (somar.length && !j.results?.slice(requests.length, requests.length + somar.length).every((x) => x?.type === 'ok')) devolver()
    const c = consumoDaResposta(j)
    pend.lidas += c.lidas; pend.escritas += c.escritas
    return j
  }
  /** Transação de verdade: no pipeline um erro não para os passos seguintes; no batch, cada passo só roda se o anterior deu certo. */
  async function transacao(comandos) {
    const n = comandos.length
    const steps = [{ stmt: { sql: 'begin' } },
      ...comandos.map(([sql, args = []], i) => ({ condition: { type: 'ok', step: i }, stmt: { sql, args: args.map(valor) } })),
      { condition: { type: 'ok', step: n }, stmt: { sql: 'commit' } },
      { condition: { type: 'not', cond: { type: 'ok', step: n + 1 } }, stmt: { sql: 'rollback' } }]
    const j = await enviar([{ type: 'batch', batch: { steps } }], 55000)
    const res = j.results?.[0]
    if (res?.type === 'error') throw falha(res.error)
    const b = res?.response?.result
    const erro = b?.step_errors?.find(Boolean)
    if (erro) throw falha(erro)
    if (!b?.step_results?.[n + 1]) throw Object.assign(new Error('Turso: transação não confirmada'), { status: 502 })
  }
  async function pipeline(comandos, { descarregar = false } = {}) {
    const j = await enviar(comandos.map(([sql, args = []]) => ({ type: 'execute', stmt: { sql, args: args.map(valor) } })), 25000, descarregar)
    const erro = j.results?.slice(0, comandos.length).find((x) => x.type === 'error')
    if (erro) throw falha(erro.error)
    return j.results.slice(0, comandos.length)
  }
  return {
    pipeline, transacao, cota,
    /** O que esta instância já leu/escreveu e ainda não somou no banco. */
    pendente: () => ({ lidas: pend.lidas, escritas: pend.escritas }),
    consultar: async (sql, args) => linhas((await pipeline([[sql, args]]))[0]),
    /** Várias consultas numa ida só; devolve as linhas de cada uma. */
    lote: async (comandos) => (await pipeline(comandos)).map(linhas),
    prepararEsquema: () => pipeline(ESQUEMA.map((s) => [s])),
  }
}

// ======================================================================================= coleta

const agoraIso = () => new Date().toISOString()
// Mantém filtros/FTS pesquisáveis; compacta apenas o documento exibido pela tela.
export function compactarCompra(json) {
  const comprimido = 'gz:' + gzipSync(json).toString('base64')
  return Buffer.byteLength(comprimido) < Buffer.byteLength(json) ? comprimido : json
}
export const lerCompra = (texto) => JSON.parse(texto.startsWith('gz:')
  ? gunzipSync(Buffer.from(texto.slice(3), 'base64'), { maxOutputLength: 2_000_000 }).toString('utf8') : texto)

/** Migração gradual: no máximo 50 documentos por rodada, sem reescrever índices ou o FTS. */
export async function compactarBase(turso, cursor = 0) {
  const lista = await turso.consultar('select rowid as id, compra from editais where rowid > ? order by rowid limit 50', [Number(cursor) || 0])
  if (!lista.length) return 0
  const comandos = []
  let poupados = 0
  for (const l of lista) {
    if (l.compra.startsWith('gz:')) continue
    const menor = compactarCompra(l.compra)
    if (menor === l.compra) continue
    poupados += Buffer.byteLength(l.compra) - Buffer.byteLength(menor)
    // Evita sobrescrever uma atualização concorrente do coletor.
    comandos.push(['update editais set compra = ? where rowid = ? and compra = ?', [menor, l.id, l.compra]])
  }
  comandos.push(guardar('compactacao_cursor', lista.at(-1).id))
  await turso.pipeline(comandos)
  return poupados
}
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

/** Resumo do que a busca usa de um edital: se não mudou, a nova data do PNCP não regrava a linha nem o FTS. */
const hashEdital = (n) => resumo([n.modalidade, n.portal, n.uf, n.situacao, n.srp, n.modo_disputa, n.valor, n.orgao_nome, n.publicacao, n.encerramento, n.tipo_objeto, n.compra, n.texto])

/**
 * Grava uma página de editais: só os novos ou que mudaram na fonte (economiza escrita no Turso).
 * Mudou só a data no PNCP (arquivo novo, item alterado...)? Uma escrita: anota a data e põe os itens para conferir.
 * Mudou o conteúdo? Regrava a linha e o FTS. Em nenhum caso apaga os itens: eles são conferidos de novo e só
 * regravados se a lista mudou (itens_completos = 2 enquanto isso; a busca segue usando os guardados).
 */
export async function gravarEditais(turso, lista, agora = agoraIso()) {
  // Encerrados há mais de 2 dias só entram no histórico (12 meses, sem dispensa/inexigibilidade); os demais a limpeza
  // apagaria logo depois.
  const corte = new Date(Date.now() - 2 * 86400_000).toISOString(), corteHistorico = new Date(Date.now() - HISTORICO_DIAS * 86400_000).toISOString()
  const novos = lista.map(linhaEdital).filter((n) => n && (!n.encerramento || n.encerramento >= corte || (!SEM_HISTORICO.includes(n.modalidade) && n.encerramento >= corteHistorico)))
  if (!novos.length) return 0
  const existentes = new Map((await turso.consultar(`select controle, atualizado_pncp, hash from editais where controle in (${novos.map(() => '?').join(',')})`, novos.map((n) => n.controle))).map((l) => [l.controle, l]))
  const mudaram = novos.filter((n) => !existentes.has(n.controle) || (n.atualizado_pncp ?? '') > (existentes.get(n.controle).atualizado_pncp ?? ''))
  if (!mudaram.length) return 0
  const comandos = []
  for (const n of mudaram) {
    n.hash = hashEdital(n)
    if (existentes.get(n.controle)?.hash === n.hash) {
      comandos.push(['update editais set atualizado_pncp = ?, coletado_em = ?, itens_completos = case when itens_completos = 0 then 0 else 2 end, itens_tentativas = 0 where controle = ?', [n.atualizado_pncp, agora, n.controle]])
      continue
    }
    comandos.push([`insert into editais(controle,cnpj,ano,sequencial,modalidade,portal,uf,situacao,srp,modo_disputa,valor,orgao_cnpj,orgao_nome,publicacao,encerramento,tipo_objeto,dia_util,atualizado_pncp,coletado_em,compra,hash)
      values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      on conflict(controle) do update set modalidade=excluded.modalidade,portal=excluded.portal,uf=excluded.uf,situacao=excluded.situacao,srp=excluded.srp,
        modo_disputa=coalesce(excluded.modo_disputa,editais.modo_disputa),valor=excluded.valor,orgao_nome=excluded.orgao_nome,publicacao=excluded.publicacao,
        encerramento=excluded.encerramento,tipo_objeto=excluded.tipo_objeto,dia_util=excluded.dia_util,atualizado_pncp=excluded.atualizado_pncp,
        coletado_em=excluded.coletado_em,compra=excluded.compra,hash=excluded.hash,
        itens_completos=case when editais.itens_completos = 0 then 0 else 2 end,itens_tentativas=0`,
    [n.controle, n.cnpj, n.ano, n.sequencial, n.modalidade, n.portal, n.uf, n.situacao, n.srp, n.modo_disputa, n.valor, n.orgao_cnpj, n.orgao_nome, n.publicacao, n.encerramento, n.tipo_objeto, n.dia_util, n.atualizado_pncp, agora, compactarCompra(n.compra), n.hash]])
    // As linhas do FTS usam o rowid do edital: apagar por "controle" (coluna sem índice) lia a tabela inteira a cada edital.
    comandos.push(['delete from editais_fts where rowid = (select rowid from editais where controle = ?)', [n.controle]],
      ['insert into editais_fts(rowid, controle, texto) select rowid, controle, ? from editais where controle = ?', [n.texto, n.controle]])
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

/**
 * Itens de um edital (até 1.000), gravados de uma vez. Devolve false se a fonte falhou.
 * Se a lista é a mesma já guardada (mesmo resumo), só marca como completa: uma escrita em vez de centenas.
 */
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
  const linhasItens = unicos.map((i) => {
    const sigilo = i.orcamentoSigiloso === true
    return [e.controle, i.numeroItem, String(i.descricao ?? '').slice(0, 2048), sigilo ? null : Number(i.valorUnitarioEstimado) || null, Number(i.tipoBeneficio) || null, sigilo ? 1 : 0,
      i.materialOuServico ?? null, Number(i.quantidade) || null, i.unidadeMedida ?? null, sigilo ? null : Number(i.valorTotal) || null, i.tipoBeneficioNome ?? null,
      i.criterioJulgamentoNome ?? null, i.situacaoCompraItemNome ?? null, i.numeroGrupo != null ? String(i.numeroGrupo) : null, i.numeroLote != null ? String(i.numeroLote) : null]
  })
  const hash = resumo(linhasItens)
  if (e.itens_hash && e.itens_hash === hash) {
    await turso.pipeline([['update editais set itens_completos = 1, itens_tentativas = 0 where controle = ?', [e.controle]]])
    return true
  }
  const comandos = [['delete from itens where controle = ?', [e.controle]], ['delete from itens_fts where rowid = (select rowid from editais where controle = ?)', [e.controle]]]
  for (const l of linhasItens) comandos.push(['insert into itens(controle,numero,descricao,valor_unitario,beneficio,sigiloso,tipo,quantidade,unidade,valor_total,beneficio_nome,criterio,situacao,grupo,lote) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', l])
  if (unicos.length) comandos.push(['insert into itens_fts(rowid, controle, texto) select rowid, controle, ? from editais where controle = ?', [unicos.map((i) => i.descricao ?? '').join(' ').slice(0, 400000), e.controle]])
  comandos.push(['update editais set itens_completos = 1, itens_tentativas = 0, quantidade_itens = ?, tipo_itens = ?, itens_hash = ? where controle = ?', [unicos.length, tipos, hash, e.controle]])
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
 * Uma rodada (até ~40 s e no máximo 45 consultas ao PNCP, espaçadas):
 * 1. carga completa dos editais com proposta aberta, uma vez por dia, continuando de onde parou (é ela que libera a busca);
 * 2. editais atualizados hoje, 3 modalidades por rodada em rodízio (a última página fica aberta para pegar o que entrou depois);
 * 3. itens dos editais que abrem em até 30 dias, os mais próximos primeiro;
 * 4. limpeza dos encerrados há mais de 2 dias.
 * Uma falha do PNCP numa etapa não derruba as outras; um 429 pausa a coleta por 3 minutos.
 */
export async function coletarRodada(turso, { prazo = Date.now() + 40_000, fetcher = fetch, hoje = new Date(), maxConsultas = 45, intervaloMs = 300 } = {}) {
  let estadoLinhas
  try { estadoLinhas = await turso.consultar('select chave, valor from coleta_estado') } catch { estadoLinhas = [] }
  let estado = Object.fromEntries(estadoLinhas.map((l) => [l.chave, l.valor]))
  if (estado.esquema !== VERSAO_ESQUEMA) { await turso.prepararEsquema(); estado = {} }
  if (estado.fts_rowid !== '1') await turso.transacao(MIGRAR_FTS_ROWID)
  if (estado.indices_historico !== '1') await turso.pipeline([...INDICES_HISTORICO.map((s) => [s]), guardar('indices_historico', '1')])
  if (estado.otimizacao !== '1') await migrarOtimizacao(turso)
  if (estado.indice_uf !== '1') await turso.pipeline([[INDICE_UF], guardar('indice_uf', '1')])
  if (estado.pausado_ate && estado.pausado_ate > agoraIso()) return [{ pausado: estado.pausado_ate }]
  // Cota do mês (server/turso-cota.js): freia antes de o Turso bloquear o banco.
  const cota = nivelCota(estado, turso.cota ?? configCota(), { agora: hoje, pendente: turso.pendente?.() })
  if (cota.nivel === 'parado') {
    await turso.pipeline([guardar('cota_nivel', 'parado')], { descarregar: true })
    return [{ cota: 'parado', leituras: cota.usoLeituras, escritas: cota.usoEscritas }]
  }
  // Reindexação gradual (órgão, CNPJ e número de volta à busca por palavra), só com escrita folgada.
  // Lê documentos compactados sem JSON no banco; o cache de buscas só é limpo no fim, para não multiplicar leituras.
  if (estado.fts_orgao !== '1' && !peloMenos(cota.escritasNivel, 'economia')) {
    const lote = await turso.consultar('select rowid as id, controle, compra, hash from editais where rowid > ? order by rowid limit 250', [Number(estado.fts_orgao_cursor) || 0])
    await turso.transacao([
      ...lote.flatMap(l => [
        // Não sobrescreve uma versão mais recente gravada por outra rodada do coletor.
        ['delete from editais_fts where rowid = ? and exists(select 1 from editais where rowid = ? and hash is ?)', [l.id, l.id, l.hash]],
        ['insert into editais_fts(rowid, controle, texto) select rowid, controle, ? from editais where rowid = ? and hash is ?', [textoEdital(lerCompra(l.compra)), l.id, l.hash]],
      ]),
      guardar('fts_orgao_cursor', lote.at(-1)?.id ?? estado.fts_orgao_cursor ?? 0),
      ...(lote.length < 250 ? [guardar('fts_orgao', '1'), ['delete from cache_busca']] : []),
    ])
  }
  // Portais novos (28/11/2026): reclassifica aos poucos os editais que estavam em "outros". Só grava o que muda.
  if (estado.portal_v2 !== '1' && !peloMenos(cota.escritasNivel, 'economia')) {
    const lote = await turso.consultar("select rowid as id, compra from editais where portal = 'outros' and rowid > ? order by rowid limit 250", [Number(estado.portal_v2_cursor) || 0])
    const mudam = lote.map((l) => [l.id, portalDe(lerCompra(l.compra))]).filter(([, p]) => p !== 'outros')
    await turso.transacao([
      ...mudam.map(([id, p]) => ["update editais set portal = ? where rowid = ? and portal = 'outros'", [p, id]]),
      guardar('portal_v2_cursor', lote.at(-1)?.id ?? estado.portal_v2_cursor ?? 0),
      ...(lote.length < 250 ? [guardar('portal_v2', '1'), ['delete from cache_busca']] : []),
    ])
  }
  // Em economia de escrita, roda em minutos alternados (metade das gravações; o atraso máximo vira 2 min).
  if (peloMenos(cota.escritasNivel, 'economia') && hoje.getUTCMinutes() % 2 === 1) return [{ cota: cota.nivel, pulada: true }]
  // Em nível crítico, só acompanha as atualizações do dia (o que mais importa para o cliente) e limpa.
  const enxuta = peloMenos(cota.nivel, 'critico')
  const data = dia(hoje), feitos = [], tempoAte = (fracao) => Date.now() < prazo - (1 - fracao) * 40_000
  const pncp = pncpComLimite(fetcher, maxConsultas, intervaloMs)
  let pausar = false
  async function etapa(nome, fn) {
    if (pausar) return
    try { await fn() } catch (e) {
      if (e.bloqueado) throw e // banco bloqueado pelo Turso: encerra a rodada (o endereço responde "bloqueado")
      if (e.pausa) { pausar = true; feitos.push({ etapa: nome, pausado: true }) }
      else if (!e.fim) feitos.push({ etapa: nome, erro: String(e.message ?? e).slice(0, 120) })
    }
  }

  // 1. Carga completa diária (até 55% do tempo e metade das consultas). Cursor "dia:índice da modalidade:página".
  if (!enxuta) await etapa('carga', async () => {
    let [diaCarga, im, pg] = String(estado.carga ?? '').split(':')
    // Uma carga grande pode atravessar a meia-noite. Só começa outra depois de terminar a anterior.
    const pendente = /^\d{8}$/.test(diaCarga ?? '') && Number(im) < MODALIDADES.length
    if (!pendente && !(estado.carga_completa_em ?? '').startsWith(hoje.toISOString().slice(0, 10))) { diaCarga = data; im = 0; pg = 1 }
    // Credenciamentos ficam abertos por anos: a lista vai até 2099 (até 2027 faltavam ~3,4 mil).
    // Na troca do limite, refaz já a partir do credenciamento, sem esperar o dia seguinte.
    const comandosLimite = []
    if (estado.carga_limite !== LIMITE_CARGA) {
      if (estado.carga) { diaCarga = data; im = MODALIDADES.indexOf(12); pg = 1 }
      comandosLimite.push(guardar('carga_limite', LIMITE_CARGA))
    }
    im = Number(im) || 0; pg = Number(pg) || 1
    if (comandosLimite.length) await turso.pipeline([...comandosLimite, guardar('carga', `${diaCarga}:${im}:${pg}`)])
    const limiteData = LIMITE_CARGA
    while (diaCarga && im < MODALIDADES.length && tempoAte(0.55) && pncp.restantes() > Math.floor(maxConsultas / 2)) {
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
  // 3. Histórico: editais publicados nos últimos 12 meses, do dia mais recente para o mais antigo (o que mais se
  // procura fica pronto primeiro). Só depois da carga do dia e com no máximo 3 páginas por rodada (cada página do
  // PNCP leva de 7 a 15 s). Cursor "dia de publicação:índice da modalidade:página".
  //    É a etapa que mais escreve: fica de fora já na economia de escrita (e no nível crítico).
  if (!enxuta && !peloMenos(cota.escritasNivel, 'economia') && (estado.carga_completa_em ?? '').startsWith(hoje.toISOString().slice(0, 10))) await etapa('historico', async () => {
    const limite = dia(new Date(hoje.getTime() - HISTORICO_DIAS * 86400_000))
    let [diaHist, im, pg] = String(estado.historico ?? '').split(':')
    if (!/^\d{8}$/.test(diaHist ?? '')) { diaHist = dia(new Date(hoje.getTime() - 86400_000)); im = 0; pg = 1 }
    im = Number(im) || 0; pg = Number(pg) || 1
    for (let k = 0; k < 3 && diaHist >= limite && tempoAte(0.7) && pncp.restantes() > 3; k++) {
      const m = MODALIDADES_HISTORICO[im]
      const { lista, paginas } = await lerPagina(pncp, `${PNCP}/contratacoes/publicacao?dataInicial=${diaHist}&dataFinal=${diaHist}&codigoModalidadeContratacao=${m}&pagina=${pg}&tamanhoPagina=50`)
      const gravados = await gravarEditais(turso, lista)
      feitos.push({ etapa: 'historico', dia: diaHist, modalidade: m, pagina: pg, de: paginas, gravados })
      if (!lista.length || pg >= paginas) { im++; pg = 1 } else pg++
      if (im >= MODALIDADES_HISTORICO.length) { im = 0; diaHist = dia(new Date(Date.UTC(+diaHist.slice(0, 4), +diaHist.slice(4, 6) - 1, +diaHist.slice(6, 8)) - 86400_000)) }
      const comandos = [guardar('historico', `${diaHist}:${im}:${pg}`)]
      if (diaHist < limite) comandos.push(guardar('historico_completo_em', agoraIso()))
      await turso.pipeline(comandos)
    }
  })
  // 4. Itens dos que abrem em até 30 dias (3 por vez), com as consultas que sobraram.
  //    A fila usa o índice parcial editais_fila_itens: lê só os que faltam (nunca coletados ou para conferir).
  if (!enxuta) await etapa('itens', async () => {
    const ate30 = new Date(Date.now() + 30 * 86400_000).toISOString()
    let total = 0, falhas = 0
    while (tempoAte(0.9) && pncp.restantes() > 0) {
      const fila = await turso.consultar('select controle, cnpj, ano, sequencial, itens_hash from editais where itens_completos <> 1 and itens_tentativas < 5 and encerramento >= ? and encerramento <= ? order by encerramento limit ?', [agoraIso(), ate30, Math.min(9, pncp.restantes())])
      if (!fila.length) break
      for (let k = 0; k < fila.length && tempoAte(0.9) && pncp.restantes() > 0; k += 3) {
        const lote = fila.slice(k, k + 3)
        const res = await Promise.all(lote.map(async (e) => ({ e, ok: await coletarItens(turso, e, pncp).catch((err) => { if (err.pausa || err.fim || err.bloqueado) throw err; return false }) })))
        total += res.length
        const ruins = res.filter((r) => !r.ok)
        falhas += ruins.length
        if (ruins.length) await turso.pipeline(ruins.map((r) => ['update editais set itens_tentativas = itens_tentativas + 1 where controle = ?', [r.e.controle]]))
      }
    }
    if (total) feitos.push({ etapa: 'itens', editais: total, falhas })
  })
  // 5. Limpeza, no máximo 300 por rodada (cada consulta usa um índice e lê só o que vai apagar):
  //    apaga os encerrados há mais de 2 dias que não entram no histórico (dispensa/inexigibilidade) e os que saíram
  //    dos 12 meses; dos que ficam no histórico, apaga só os itens.
  await etapa('limpeza', async () => {
    const corte = new Date(Date.now() - 2 * 86400_000).toISOString(), corteHistorico = new Date(Date.now() - HISTORICO_DIAS * 86400_000).toISOString()
    const [foraHistorico, antigos, comItens] = await turso.lote([
      [`select controle from editais where modalidade in (${SEM_HISTORICO.join(',')}) and encerramento < ? limit 300`, [corte]],
      ['select controle from editais where encerramento < ? limit 300', [corteHistorico]],
      ['select controle from editais where itens_completos <> 0 and encerramento < ? limit 300', [corte]],
    ])
    const velhos = [...new Set([...foraHistorico, ...antigos].map((l) => l.controle))].slice(0, 300)
    const semItens = comItens.map((l) => l.controle).filter((c) => !velhos.includes(c))
    const comandos = []
    if (velhos.length) {
      const marcas = velhos.map(() => '?').join(',')
      comandos.push([`delete from itens where controle in (${marcas})`, velhos], [`delete from itens_fts where rowid in (select rowid from editais where controle in (${marcas}))`, velhos], [`delete from editais_fts where rowid in (select rowid from editais where controle in (${marcas}))`, velhos], [`delete from editais where controle in (${marcas})`, velhos])
    }
    if (semItens.length) {
      const marcas = semItens.map(() => '?').join(',')
      comandos.push([`delete from itens where controle in (${marcas})`, semItens], [`delete from itens_fts where rowid in (select rowid from editais where controle in (${marcas}))`, semItens], [`update editais set itens_completos = 0, quantidade_itens = null, itens_hash = null where controle in (${marcas})`, semItens])
    }
    if (!comandos.length) return
    await turso.pipeline(comandos)
    feitos.push({ etapa: 'limpeza', editais: velhos.length, itensDe: semItens.length })
  })
  // Contagens que antes cada busca (e o cartão do master, a cada 5 min) refazia, lendo dezenas de milhares de linhas:
  // agora a coleta conta e guarda em coleta_estado; a busca e o cartão só leem o resultado.
  //   cobertura dos itens (até 30 dias): a cada hora; tamanho da base: a cada 6 h.
  const idade = (v) => { try { return Date.now() - Date.parse(JSON.parse(v).em) } catch { return Infinity } }
  if (!enxuta && idade(estado.cobertura) >= 60 * 60_000) await etapa('cobertura', async () => {
    const c = await contarCobertura(turso)
    feitos.push({ etapa: 'cobertura', ...c })
  })
  if (!enxuta && idade(estado.contagem) >= 6 * 3600_000) await etapa('situacao', async () => {
    const s = await recontarBase(turso)
    feitos.push({ etapa: 'situacao', editais: s.editais, abertos: s.abertos, comItens: s.comItens })
  })
  if (cota.nivel === 'normal' && tempoAte(0.95)) await etapa('compactacao', async () => {
    feitos.push({ etapa: 'compactacao', bytes: await compactarBase(turso, estado.compactacao_cursor) })
  })
  const fim = [guardar('ultima_coleta_em', agoraIso()), guardar('cota_nivel', cota.nivel),
    ['delete from cache_busca where expira < ?', [agoraIso()]]]
  if (pausar) fim.push(guardar('pausado_ate', new Date(Date.now() + 3 * 60_000).toISOString()))
  await turso.pipeline(fim, { descarregar: true })
  if (cota.nivel !== 'normal') feitos.push({ cota: cota.nivel, leituras: Math.round(cota.usoLeituras * 1000) / 10, escritas: Math.round(cota.usoEscritas * 1000) / 10 })
  return feitos
}

/** Itens de um edital guardados no Turso, no formato do PNCP (reserva da página do edital). null se ainda não coletados. */
export async function itensTurso(turso, controle) {
  const [[e], itens] = await turso.lote([
    ['select itens_completos from editais where controle = ?', [controle]],
    ['select numero, descricao, valor_unitario, beneficio, sigiloso, tipo, quantidade, unidade, valor_total, beneficio_nome, criterio, situacao, grupo, lote from itens where controle = ? order by numero', [controle]],
  ])
  if (!e?.itens_completos) return null
  return itens.map((i) => ({
    numeroItem: i.numero, descricao: i.descricao ?? '', valorUnitarioEstimado: i.valor_unitario, valorTotal: i.valor_total, orcamentoSigiloso: !!i.sigiloso,
    tipoBeneficio: i.beneficio ?? undefined, tipoBeneficioNome: i.beneficio_nome ?? undefined, materialOuServico: i.tipo ?? undefined,
    quantidade: i.quantidade ?? undefined, unidadeMedida: i.unidade ?? undefined, criterioJulgamentoNome: i.criterio ?? undefined,
    situacaoCompraItemNome: i.situacao ?? undefined, numeroGrupo: i.grupo ?? undefined, numeroLote: i.lote ?? undefined,
  }))
}

// ======================================================================================= busca

const TODAS_MODALIDADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
const DATA = /^\d{4}-\d{2}-\d{2}$/
const numero = (v) => (v === '' || v === null || v === undefined ? null : Number(v))
const inicioDiaSP = (d) => new Date(`${d}T00:00:00-03:00`).toISOString()
const fimDiaSP = (d) => new Date(new Date(`${d}T00:00:00-03:00`).getTime() + 86400_000).toISOString()
/** Data (AAAA-MM-DD) de um instante ISO no horário de Brasília. */
const diaSP = (iso) => new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10)
/**
 * A contagem para aqui, em toda busca: contar tudo leria todos os editais que passam no filtro (~36 mil abertos, ou
 * centenas de milhares no histórico) a cada filtro novo. Eram ~80 mil linhas lidas por busca, quase toda a cota do Turso.
 */
export const LIMITE_CONTAGEM = 1000
export const LIMITE_CONTAGEM_HISTORICO = LIMITE_CONTAGEM
/**
 * Com folga de cota (plano Developer: 2,5 bi de leituras/mês), a busca volta a contar tudo e a paginar até o fim:
 * o teto de 1.000 fazia a lista parar na página 50 e parecia que a base tinha encolhido. O limite de 1.000 volta
 * sozinho quando a cota de leituras entra em economia. A contagem fica 10 min em cache por filtro.
 */
export const LIMITE_CONTAGEM_FOLGA = 50_000
export const limiteContagem = (nivelLeituras) => (peloMenos(nivelLeituras ?? 'normal', 'economia') ? LIMITE_CONTAGEM : LIMITE_CONTAGEM_FOLGA)

export class FiltroInvalido extends Error {}

/** Monta o WHERE da busca (modo "por data de abertura") com os mesmos filtros do buscar_oportunidades. */
export function montarFiltros(f, agora = agoraIso()) {
  const termo = String(f.busca ?? '').trim(), excluir = String(f.excluir ?? '').trim(), tipo = String(f.tipoItem ?? '')
  if (termo.length > 300 || excluir.length > 300 || !['', 'M', 'S'].includes(tipo)) throw new FiltroInvalido('Filtros inválidos')
  const mods = (Array.isArray(f.modalidades) ? f.modalidades : TODAS_MODALIDADES).map(Number).filter((m) => Number.isInteger(m))
  const portais = (Array.isArray(f.portais) ? f.portais : IDS_PORTAIS).map(String).filter((p) => IDS_PORTAIS.includes(p))
  // Filtro salvo antes dos portais novos: marcava "outros", onde esses editais estavam, e nenhum dos novos.
  if (portais.includes('outros') && !PORTAIS_NOVOS.some((p) => portais.includes(p))) portais.push(...PORTAIS_NOVOS)
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
  // Pelo rowid (o mesmo do edital): ler "controle" faria o FTS abrir a tabela de conteúdo, mais uma linha lida por resultado.
  if (q) { onde.push('e.rowid in (select rowid from editais_fts where editais_fts match ? union select rowid from itens_fts where itens_fts match ?)'); args.push(q, q) }
  if (qEx) { onde.push('e.rowid not in (select rowid from editais_fts where editais_fts match ?)'); args.push(qEx) }
  // "+" tira a modalidade da escolha de índice: o índice (modalidade, encerramento) é da limpeza; na busca ele faria o
  // SQLite ler o período inteiro e ordenar em memória, em vez de seguir o índice de encerramento e parar na página.
  onde.push(`+e.modalidade in (${mods.map(() => '?').join(',')})`, `e.portal in (${portais.map(() => '?').join(',')})`); args.push(...mods, ...portais)
  // Vários estados de uma vez (ufs); buscas antigas mandam só "uf".
  const ufs = [...new Set((Array.isArray(f.ufs) && f.ufs.length ? f.ufs : [f.uf]).map(String).filter((u) => /^[A-Z]{2}$/.test(u)))]
  if (ufs.length > 27) throw new FiltroInvalido('Filtros inválidos')
  if (ufs.length === 1) { onde.push('e.uf = ?'); args.push(ufs[0]) }
  else if (ufs.length > 1) { onde.push(`e.uf in (${ufs.map(() => '?').join(',')})`); args.push(...ufs) }
  if (/^\d{14}$/.test(f.orgao ?? '')) { onde.push('e.orgao_cnpj = ?'); args.push(f.orgao) }
  // Período: "por data de publicação" (qualquer situação) ou "por data de abertura". Na abertura, um início antes de
  // hoje (Brasília) traz também os encerrados guardados no histórico; sem início, ou a partir de hoje, só os abertos.
  const porPublicacao = f.situacao === 'publicacoes'
  let historico = porPublicacao
  if (porPublicacao) {
    const de = DATA.test(f.inicio ?? '') ? f.inicio : null, ate = DATA.test(f.fim ?? '') ? f.fim : null
    if (!de || !ate || de > ate) throw new FiltroInvalido('Período de publicação inválido')
    onde.push('e.publicacao >= ?', 'e.publicacao < ?'); args.push(inicioDiaSP(de), fimDiaSP(ate))
  } else {
    historico = !!abDe && abDe < diaSP(agora)
    const desde = historico ? inicioDiaSP(abDe) : abDe && inicioDiaSP(abDe) > agora ? inicioDiaSP(abDe) : agora
    onde.push('e.encerramento >= ?'); args.push(desde)
    if (abAte) { onde.push('e.encerramento < ?'); args.push(fimDiaSP(abAte)) }
    if (historico) { onde.push('(e.encerramento < ? or coalesce(e.situacao, 1) = 1)'); args.push(agora) }
    else onde.push('coalesce(e.situacao, 1) = 1')
  }
  if (f.diasUteis === true && !porPublicacao) onde.push('e.dia_util = 1')
  if (f.excluirSrp === true) onde.push('e.srp = 0')
  if (modos.length) { onde.push(`e.modo_disputa in (${modos.map(() => '?').join(',')})`); args.push(...modos) }
  if (f.naoDivulgado === true) onde.push('coalesce(e.valor, 0) = 0')
  else {
    if (vMin !== null) { onde.push('e.valor > 0 and e.valor >= ?'); args.push(vMin) }
    if (vMax !== null) { onde.push('e.valor > 0 and e.valor <= ?'); args.push(vMax) }
  }
  // Filtros que não dependem dos itens; os de item entram depois (para contar os pendentes, como no Postgres).
  const base = { onde: [...onde], args: [...args] }
  if (tipo) { onde.push("instr(coalesce(nullif(e.tipo_itens, ''), e.tipo_objeto, ''), ?) > 0"); args.push(tipo) }
  if (q && (tipo || porItem)) {
    // Se o termo só aparece nos itens, ele deve estar no item que satisfaz os filtros.
    const texto = filtroDescricao(termo), cond = ['i.controle = e.controle', texto.sql]
    const valores = [...texto.args]
    if (tipo) { cond.push("coalesce(i.tipo, case when e.tipo_itens in ('M','S') then e.tipo_itens when e.tipo_itens is null then e.tipo_objeto end) = ?"); valores.push(tipo) }
    if (f.exclusivo === true) cond.push('i.beneficio = 1')
    if (iMin !== null || iMax !== null) cond.push('i.sigiloso = 0 and i.valor_unitario > 0')
    if (iMin !== null) { cond.push('i.valor_unitario >= ?'); valores.push(iMin) }
    if (iMax !== null) { cond.push('i.valor_unitario <= ?'); valores.push(iMax) }
    onde.push(`(e.rowid in (select rowid from editais_fts where editais_fts match ?) or exists (select 1 from itens i where ${cond.join(' and ')}))`)
    args.push(q, ...valores)
  }
  if (porItem) {
    onde.push('e.itens_completos >= 1')
    if (maxItens !== null) { onde.push('e.quantidade_itens <= ?'); args.push(maxItens) }
    if (iMin !== null || iMax !== null || f.exclusivo === true) {
      const cond = ['i.controle = e.controle']
      if (tipo) { cond.push("coalesce(i.tipo, case when e.tipo_itens in ('M','S') then e.tipo_itens when e.tipo_itens is null then e.tipo_objeto end) = ?"); args.push(tipo) }
      if (f.exclusivo === true) cond.push('i.beneficio = 1')
      if (iMin !== null || iMax !== null) cond.push('i.sigiloso = 0 and i.valor_unitario > 0')
      if (iMin !== null) { cond.push('i.valor_unitario >= ?'); args.push(iMin) }
      if (iMax !== null) { cond.push('i.valor_unitario <= ?'); args.push(iMax) }
      onde.push(`exists (select 1 from itens i where ${cond.join(' and ')})`)
    }
  }
  // A chave do cache não pode levar o "agora" (mudava a cada milissegundo e o cache das contagens nunca acertava).
  const argsChave = args.map((a) => (a === agora ? 'agora' : a))
  return { onde, args, base, porItem, comTermo: !!q, inverter: f.inverter === true, historico, porPublicacao, chave: JSON.stringify([onde, argsChave, porItem]) }
}

const lerJson = (v) => { try { return JSON.parse(v) } catch { return null } }

/** Cobertura dos itens nos editais que abrem em até 30 dias (usa o índice editais_abertos, sem abrir a tabela). Guarda em coleta_estado. */
export async function contarCobertura(turso) {
  const agora = agoraIso(), ate30 = new Date(Date.now() + 30 * 86400_000).toISOString()
  const [c] = await turso.consultar('select count(*) as total, coalesce(sum(itens_completos >= 1), 0) as com from editais where encerramento >= ? and encerramento <= ?', [agora, ate30])
  const r = { total: c?.total ?? 0, com: c?.com ?? 0, em: agora }
  await turso.pipeline([guardar('cobertura', JSON.stringify(r))])
  return r
}

/**
 * Tamanho da base (só a coleta chama, a cada 6 h). Guarda em coleta_estado.
 * A contagem real usa o índice da chave; o maior rowid não representa o tamanho após exclusões.
 * Só roda na coleta a cada 6 h, nunca por busca ou por visualização do painel.
 */
export async function recontarBase(turso) {
  const agora = agoraIso()
  const [[n], [abertos], [itens]] = await turso.lote([
    ['select count(*) as n from editais'],
    ['select count(*) as n from editais where encerramento >= ?', [agora]],
    ['select count(*) as n from editais where itens_completos <> 0'],
  ])
  const r = { editais: n?.n ?? 0, abertos: abertos?.n ?? 0, comItens: itens?.n ?? 0, em: agora }
  await turso.pipeline([guardar('contagem', JSON.stringify(r))])
  return r
}

/** Consumo do ciclo e nível de economia (server/turso-cota.js) a partir do estado guardado. */
export function cotaTurso(turso, estado, agora = new Date()) {
  return nivelCota(estado, turso.cota ?? configCota(), { agora, pendente: turso.pendente?.() })
}

/** Situação da base para o cartão do master: só lê coleta_estado (as contagens vêm da coleta). */
export async function situacaoTurso(turso, { recontar = false } = {}) {
  const linhasEstado = await turso.consultar('select chave, valor from coleta_estado')
  const e = Object.fromEntries(linhasEstado.map((l) => [l.chave, l.valor]))
  const contagem = recontar || !e.contagem ? await recontarBase(turso) : lerJson(e.contagem) ?? {}
  const [diaHist] = String(e.historico ?? '').split(':')
  return {
    editais: contagem.editais ?? 0, abertos: contagem.abertos ?? 0, comItens: contagem.comItens ?? 0, contadoEm: contagem.em ?? null,
    ultimaColeta: e.ultima_coleta_em ?? null, cargaCompletaEm: e.carga_completa_em ?? null, pausadoAte: e.pausado_ate ?? null, carga: e.carga ?? null,
    historicoAte: /^\d{8}$/.test(diaHist ?? '') ? `${diaHist.slice(0, 4)}-${diaHist.slice(4, 6)}-${diaHist.slice(6, 8)}` : null, historicoCompletoEm: e.historico_completo_em ?? null,
    cota: cotaTurso(turso, e),
  }
}

/** A cota do mês está no fim: a busca responde pelo Postgres (o app já sabe voltar para lá). */
export class CotaTurso extends Error {}

/** Modalidades válidas (1 a 13), sem repetição e em ordem; vazio = todas. Também serve de chave de cache. */
export function modalidadesResumo(valor) {
  const lista = [...new Set(String(valor ?? '').split(',').map(Number).filter((m) => TODAS_MODALIDADES.includes(m)))].sort((a, b) => a - b)
  return lista.length === TODAS_MODALIDADES.length ? [] : lista
}

/**
 * Só agrega o dia atual pelo índice de publicação; não lê os documentos/itens individuais.
 * `mods` = modalidades liberadas no plano do cliente (a busca esconde as outras): os números batem com a lista.
 */
export async function resumoHoje(turso, agora = new Date(), mods = []) {
  const data = diaSP(agora.toISOString())
  const de = inicioDiaSP(data), ate = fimDiaSP(data)
  // Tipo e faixas usam as mesmas regras da busca (montarFiltros): o número do cartão bate com a lista ao clicar.
  // Valor 0 ou ausente = não divulgado (fica fora das faixas, como no filtro de valor).
  const tipo = "coalesce(nullif(tipo_itens, ''), tipo_objeto, '')"
  const porMod = mods.length ? ` and modalidade in (${mods.map(() => '?').join(',')})` : ''
  const [[r], ufs, [abertura], estado] = await turso.lote([
    [`select count(*) as editais, coalesce(sum(quantidade_itens),0) as itens,
      coalesce(sum(itens_completos <> 0),0) as editaisComItens,
      coalesce(sum(instr(${tipo}, 'S') > 0),0) as servicos,
      coalesce(sum(instr(${tipo}, 'M') > 0),0) as materiais,
      coalesce(sum(valor > 0 and valor <= 50000),0) as ate50mil,
      coalesce(sum(valor > 50000 and valor <= 250000),0) as ate250mil,
      coalesce(sum(valor > 250000),0) as acima250mil,
      coalesce(sum(coalesce(valor, 0) = 0),0) as naoDivulgado,
      coalesce(sum(case when valor > 0 then valor else 0 end),0) as valorTotal
      from editais where publicacao >= ? and publicacao < ?${porMod}`, [de, ate, ...mods]],
    [`select uf, count(*) as n from editais where publicacao >= ? and publicacao < ?${porMod} and uf is not null and uf <> '' group by uf order by n desc limit 6`, [de, ate, ...mods]],
    // Sessões que ainda abrem hoje (índice de encerramento, só o resto do dia).
    [`select count(*) as n from editais where encerramento >= ? and encerramento < ? and coalesce(situacao, 1) = 1${porMod}`, [agora.toISOString(), ate, ...mods]],
    ["select chave, valor from coleta_estado where chave in ('ultima_coleta_em','carga_completa_em','pausado_ate')"],
  ])
  const e = Object.fromEntries(estado.map(l => [l.chave, l.valor]))
  return { ...r, ufs: ufs.map(u => ({ uf: u.uf, n: u.n })), abremHoje: abertura?.n ?? 0, data, atualizadoEm: e.ultima_coleta_em ?? null, cargaCompleta: !!e.carga_completa_em, pausadoAte: e.pausado_ate ?? null }
}

/** Quantas licitações publicadas hoje citam as palavras-chave da empresa (mesma busca da tela; para em 1.000). */
export async function perfilHoje(turso, termos, agora = new Date(), mods = []) {
  const data = diaSP(agora.toISOString())
  const { onde, args } = montarFiltros({ busca: termos, situacao: 'publicacoes', inicio: data, fim: data, ...(mods.length ? { modalidades: mods } : {}) })
  const [r] = await turso.consultar(`select count(*) as n from (select 1 from editais e where ${onde.join(' and ')} limit ${LIMITE_CONTAGEM + 1})`, args)
  const n = r?.n ?? 0
  return { data, compativeis: Math.min(n, LIMITE_CONTAGEM), limitado: n > LIMITE_CONTAGEM }
}

const POR_FILTRO = new WeakMap(), NIVEL = new Map()
const chaveNivel = (turso) => turso.cota ? `${turso.cota.plano}:${turso.cota.leituras}` : 'padrao'

/** Último nível visto por esta instância (evita até a primeira leitura quando a cota já está no fim). */
export function nivelConhecido(turso) {
  const n = NIVEL.get(chaveNivel(turso))
  return n && Date.now() - n.em < 5 * 60_000 ? n : null
}

/** Busca no Turso no formato de resposta do buscar_oportunidades (ResultadoIndice). */
export async function buscarTurso(turso, filtros, pagina = 1, tamanho = 20) {
  if (!Number.isInteger(pagina) || pagina < 1 || pagina > 100000) throw new FiltroInvalido('Filtros inválidos')
  const conhecido = nivelConhecido(turso)
  if (conhecido && peloMenos(conhecido.leituras, 'critico')) throw new CotaTurso('Cota do Turso no fim do mês')
  const { onde, args, base, porItem, comTermo, inverter, historico, porPublicacao, chave } = montarFiltros(filtros ?? {})
  const ordem = porPublicacao ? (inverter ? 'e.publicacao asc, e.controle asc' : 'e.publicacao desc, e.controle desc')
    : inverter ? 'e.encerramento desc, e.controle desc' : 'e.encerramento asc, e.controle asc'
  // Contagens param no limite (L + 1 linhas). Os pendentes (sem itens coletados) são contados na mesma janela dos
  // primeiros L + 1 editais do filtro base: servem para comparar com o total, que também para no limite.
  let L = LIMITE_CONTAGEM
  const contar = (w, a) => [`select count(*) as n from (select 1 from editais e where ${w} limit ${L + 1})`, a]
  // Total e pendentes dependem só dos filtros (não da página): ficam em memória e também no Turso (cache_busca),
  // compartilhados entre as instâncias. A lista de órgãos saiu daqui: só é lida quando alguém abre o filtro (orgaosTurso).
  const porFiltro = POR_FILTRO.get(turso) ?? new Map(), chaveFiltro = resumo(chave)
  POR_FILTRO.set(turso, porFiltro)
  let contagem = porFiltro.get(chaveFiltro)
  if (contagem && Date.now() > contagem.expira) { porFiltro.delete(chaveFiltro); contagem = undefined }
  const comandos = [
    [`select e.compra, e.modo_disputa, e.tipo_itens, e.tipo_objeto from editais e where ${onde.join(' and ')} order by ${ordem} limit ? offset ?`, [...args, tamanho, (pagina - 1) * tamanho]],
    ['select chave, valor from coleta_estado'],
  ]
  if (!contagem) comandos.push(['select valor, expira from cache_busca where chave = ? and expira > ?', [chaveFiltro, agoraIso()]])
  const [paginaLinhas, estadoLinhas, guardada] = await turso.lote(comandos)
  const e = Object.fromEntries(estadoLinhas.map((l) => [l.chave, l.valor]))
  const cota = cotaTurso(turso, e)
  NIVEL.set(chaveNivel(turso), { em: Date.now(), leituras: cota.leituras, escritas: cota.escritasNivel })
  if (peloMenos(cota.leituras, 'critico')) throw new CotaTurso('Cota do Turso no fim do mês')
  // Em economia, as contagens valem 30 min (normal: 10 min) e param em 1.000.
  const validade = (peloMenos(cota.leituras, 'economia') ? 30 : 10) * 60_000
  L = limiteContagem(cota.leituras)
  // Contagem feita com outro limite (ex.: guardada antes da troca) não vale: um total "1.001" pararia a lista ali.
  if (contagem && contagem.limite !== L) { porFiltro.delete(chaveFiltro); contagem = undefined }
  if (!contagem && guardada?.[0]) {
    const v = lerJson(guardada[0].valor)
    if (v && v.limite === L) contagem = { ...v, expira: Date.parse(guardada[0].expira) }
  }
  if (!contagem) {
    const r = await turso.lote([contar(onde.join(' and '), args),
      ...(porItem ? [[`select count(*) as n from (select e.itens_completos from editais e where ${base.onde.join(' and ')} limit ${L + 1}) where itens_completos = 0`, base.args]] : [])])
    contagem = { total: r[0][0]?.n ?? 0, pendentes: porItem ? r[1][0]?.n ?? 0 : 0, limite: L, expira: Date.now() + validade }
    // Guarda para as outras instâncias (uma escrita), a não ser que a cota de escrita já esteja no fim.
    if (!peloMenos(cota.escritasNivel, 'critico')) {
      const { expira, ...valor } = contagem
      await turso.pipeline([['insert into cache_busca(chave, valor, expira) values(?,?,?) on conflict(chave) do update set valor = excluded.valor, expira = excluded.expira', [chaveFiltro, JSON.stringify(valor), new Date(expira).toISOString()]]]).catch(() => undefined)
    }
  }
  if (porFiltro.size >= 300) porFiltro.delete(porFiltro.keys().next().value)
  porFiltro.set(chaveFiltro, contagem)
  const { total, pendentes } = contagem
  const n = Math.min(total ?? 0, L)
  const [diaHist] = String(e.historico ?? '').split(':')
  // Tamanho da base e cobertura dos itens vêm prontos da coleta (coleta_estado).
  const cobertura = lerJson(e.cobertura), base0 = lerJson(e.contagem)
  return {
    data: paginaLinhas.map((l) => {
      const c = lerCompra(l.compra), tipo = l.tipo_itens ?? l.tipo_objeto
      return { ...c, ...(l.modo_disputa != null ? { modoDisputaId: l.modo_disputa } : {}), ...(tipo ? { materialOuServico: tipo } : {}), ...(!l.tipo_itens && l.tipo_objeto ? { tipoEstimado: true } : {}) }
    }),
    // Órgãos vazios: o app pede a lista (acao=turso-orgaos) quando o usuário abre o seletor.
    totalRegistros: n, totalPaginas: Math.ceil(n / tamanho), orgaos: [], orgaosSobDemanda: true, historico, totalLimitado: (total ?? 0) > L,
    catalogo: {
      iniciado_em: null, ultima_coleta_em: e.ultima_coleta_em ?? null, ultima_carga_completa_em: e.carga_completa_em ?? null,
      carga_inicial_concluida: !!e.carga_completa_em, editais_indexados: base0?.editais ?? 0, editais_com_itens: 0, paginas_coletadas: 0, paginas_planejadas: 0,
      pausado_ate: e.pausado_ate ?? null, aviso: null, fonte: 'turso',
      // Dia de publicação até onde o histórico já foi carregado (a carga anda do mais recente para o mais antigo).
      historico_ate: e.historico_completo_em ? null : /^\d{8}$/.test(diaHist ?? '') ? `${diaHist.slice(0, 4)}-${diaHist.slice(4, 6)}-${diaHist.slice(6, 8)}` : 'pendente',
    },
    detalhesPendentes: porItem ? pendentes : 0,
    coberturaItens: cobertura?.total ? (cobertura.com ?? 0) / cobertura.total : 0, comTermo,
  }
}


/**
 * Órgãos dos editais que passam no filtro (seletor "Órgão encontrado na consulta"). Só é lida quando alguém abre o
 * seletor: agrupar todos os abertos lê ~36 mil linhas. Fica 30 min em cache (memória e cache_busca).
 * No histórico, olha só os primeiros 2.000 editais do filtro (o período inteiro leria centenas de milhares).
 */
export async function orgaosTurso(turso, filtros) {
  const conhecido = nivelConhecido(turso)
  if (conhecido && peloMenos(conhecido.leituras, 'critico')) throw new CotaTurso('Cota do Turso no fim do mês')
  const agora = agoraIso()
  const { base, historico } = montarFiltros(filtros ?? {}, agora)
  // A chave não leva o "agora" (senão mudaria a cada chamada e o cache nunca acertaria).
  const chaveOrgaos = `orgaos:${resumo(JSON.stringify([base.onde, base.args.map((a) => (a === agora ? 'agora' : a))]))}`
  const porFiltro = POR_FILTRO.get(turso) ?? new Map()
  POR_FILTRO.set(turso, porFiltro)
  const memoria = porFiltro.get(chaveOrgaos)
  if (memoria && Date.now() < memoria.expira) return memoria.orgaos
  const [guardada] = await turso.consultar('select valor from cache_busca where chave = ? and expira > ?', [chaveOrgaos, agora])
  let orgaos = guardada ? lerJson(guardada.valor) : null
  if (!Array.isArray(orgaos)) {
    orgaos = await turso.consultar(historico
      ? `select cnpj, min(nome) as razaoSocial from (select e.orgao_cnpj as cnpj, e.orgao_nome as nome from editais e where ${base.onde.join(' and ')} limit ${2 * LIMITE_CONTAGEM}) group by cnpj order by 2 limit 200`
      // "+" no agrupamento: sem ele o SQLite prefere o índice de órgão (já agrupado) e abre a tabela a cada edital.
      : `select e.orgao_cnpj as cnpj, min(e.orgao_nome) as razaoSocial from editais e where ${base.onde.join(' and ')} group by +e.orgao_cnpj order by 2 limit 200`, base.args)
    const expira = new Date(Date.now() + 30 * 60_000).toISOString()
    await turso.pipeline([['insert into cache_busca(chave, valor, expira) values(?,?,?) on conflict(chave) do update set valor = excluded.valor, expira = excluded.expira', [chaveOrgaos, JSON.stringify(orgaos), expira]]]).catch(() => undefined)
  }
  if (porFiltro.size >= 300) porFiltro.delete(porFiltro.keys().next().value)
  porFiltro.set(chaveOrgaos, { orgaos, expira: Date.now() + 30 * 60_000 })
  return orgaos
}
