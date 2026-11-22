// Camada de dados brutos no Turso (libSQL/SQLite na borda).
// Ideia: o coletor grava aqui, sem pesar no Postgres do Supabase (plano Nano), o JSON bruto de cada edital
// assim que ele muda no PNCP. O Supabase continua sendo o dono do login e das permissões: a API confere a
// sessão no Supabase e só então lê o Turso para montar o que aparece nos painéis.
//
// Fica desligado até existirem TURSO_DATABASE_URL e TURSO_AUTH_TOKEN na Vercel (docs/turso.md).
// Conversa com o Turso pela API HTTP (/v2/pipeline), sem dependência nova.

const PNCP = 'https://pncp.gov.br/api/consulta/v1'
// Modalidades coletadas: pregão eletrônico, dispensa, concorrência eletrônica, concorrência presencial, pregão presencial, inexigibilidade.
export const MODALIDADES = [6, 8, 4, 5, 7, 9]

export const ESQUEMA = [
  `create table if not exists editais_brutos (
    controle text primary key, cnpj text not null, ano integer not null, sequencial integer not null,
    modalidade integer, uf text, municipio text, objeto text, valor real, abertura text, encerramento text,
    atualizado_pncp text, coletado_em text not null, json text not null)`,
  'create index if not exists editais_brutos_encerramento on editais_brutos(encerramento)',
  'create index if not exists editais_brutos_coletado on editais_brutos(coletado_em)',
  'create index if not exists editais_brutos_uf on editais_brutos(uf, encerramento)',
  `create virtual table if not exists editais_busca using fts5(controle unindexed, objeto, tokenize = 'unicode61 remove_diacritics 2')`,
  'create table if not exists coleta_estado (chave text primary key, valor text not null, atualizado_em text not null)',
]

/** libsql://banco-org.turso.io → https://banco-org.turso.io */
export function urlHttp(url) {
  const u = String(url ?? '').trim().replace(/^libsql:\/\//, 'https://').replace(/\/+$/, '')
  return /^https:\/\/[a-z0-9.-]+$/i.test(u) ? u : null
}

const valor = (v) => v === null || v === undefined ? { type: 'null' }
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
    const r = await fetcher(`${base}/v2/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }), signal: AbortSignal.timeout(20000) })
    const j = await r.json().catch(() => null)
    if (!r.ok || !j) throw Object.assign(new Error(`Turso respondeu ${r.status}`), { status: 502 })
    const erro = j.results?.find((x) => x.type === 'error')
    if (erro) throw Object.assign(new Error(`Turso: ${erro.error?.message ?? 'erro'}`), { status: 502 })
    return j.results.slice(0, comandos.length)
  }
  return {
    pipeline,
    consultar: async (sql, args) => linhas((await pipeline([[sql, args]]))[0]),
    prepararEsquema: () => pipeline(ESQUEMA.map((s) => [s])),
  }
}

/** Comandos que gravam (ou atualizam) um edital bruto do PNCP. */
export function comandosEdital(c, agora = new Date().toISOString()) {
  const controle = c?.numeroControlePNCP
  if (!/^\d{14}-\d-\d+\/\d{4}$/.test(controle ?? '')) return []
  const objeto = String(c.objetoCompra ?? '').slice(0, 4000)
  return [
    [`insert into editais_brutos(controle,cnpj,ano,sequencial,modalidade,uf,municipio,objeto,valor,abertura,encerramento,atualizado_pncp,coletado_em,json)
      values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      on conflict(controle) do update set modalidade=excluded.modalidade,uf=excluded.uf,municipio=excluded.municipio,objeto=excluded.objeto,
        valor=excluded.valor,abertura=excluded.abertura,encerramento=excluded.encerramento,atualizado_pncp=excluded.atualizado_pncp,
        coletado_em=excluded.coletado_em,json=excluded.json`,
    [controle, c.orgaoEntidade?.cnpj ?? '', Number(c.anoCompra) || 0, Number(c.sequencialCompra) || 0, Number(c.modalidadeId) || null,
      c.unidadeOrgao?.ufSigla ?? null, c.unidadeOrgao?.municipioNome ?? null, objeto, Number(c.valorTotalEstimado) || null,
      c.dataAberturaProposta ?? null, c.dataEncerramentoProposta ?? null, c.dataAtualizacaoGlobal ?? c.dataAtualizacao ?? null, agora, JSON.stringify(c)]],
    ['delete from editais_busca where controle = ?', [controle]],
    ['insert into editais_busca(controle, objeto) values(?, ?)', [controle, objeto]],
  ]
}

const dia = (d) => d.toISOString().slice(0, 10).replace(/-/g, '')

/**
 * Uma rodada de coleta: para cada modalidade, lê as páginas de "atualizadas hoje" do PNCP a partir da última
 * página vista e grava o bruto no Turso. Para no prazo (as funções da Vercel têm tempo curto).
 */
export async function coletarRodada(turso, { prazo = Date.now() + 40_000, fetcher = fetch, hoje = new Date() } = {}) {
  await turso.prepararEsquema()
  const estado = Object.fromEntries((await turso.consultar('select chave, valor from coleta_estado')).map((l) => [l.chave, l.valor]))
  const data = dia(hoje), feitos = []
  for (const m of MODALIDADES) {
    const chave = `pncp-atualizacao-${m}`
    let [diaVisto, pagina] = String(estado[chave] ?? '').split(':')
    pagina = diaVisto === data ? Math.max(1, Number(pagina) || 1) : 1
    while (Date.now() < prazo) {
      const r = await fetcher(`${PNCP}/contratacoes/atualizacao?dataInicial=${data}&dataFinal=${data}&codigoModalidadeContratacao=${m}&pagina=${pagina}&tamanhoPagina=50`, { headers: { Accept: 'application/json', 'User-Agent': 'licitaflow-turso' }, signal: AbortSignal.timeout(20000) })
      if (r.status === 204) break
      if (!r.ok) { feitos.push({ modalidade: m, pagina, erro: r.status }); break }
      const j = await r.json()
      const lista = Array.isArray(j.data) ? j.data : []
      const agora = new Date().toISOString()
      const comandos = lista.flatMap((c) => comandosEdital(c, agora))
      // A última página fica "aberta": volta nela na próxima rodada para pegar o que entrou depois.
      const proxima = lista.length === 50 && pagina < (j.totalPaginas ?? pagina) ? pagina + 1 : pagina
      comandos.push(['insert into coleta_estado(chave,valor,atualizado_em) values(?,?,?) on conflict(chave) do update set valor=excluded.valor, atualizado_em=excluded.atualizado_em', [chave, `${data}:${proxima}`, agora]])
      await turso.pipeline(comandos)
      feitos.push({ modalidade: m, pagina, editais: lista.length })
      if (proxima === pagina) break
      pagina = proxima
    }
  }
  return feitos
}

/** Busca rápida no bruto (palavras do objeto, UF, só com proposta aberta). */
export async function buscarBruto(turso, { termo = '', uf = '', limite = 20 } = {}) {
  const palavras = String(termo).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9]{3,}/g)?.slice(0, 6) ?? []
  const agora = new Date().toISOString().slice(0, 19)
  const args = [agora], filtros = ['e.encerramento >= ?']
  if (/^[A-Z]{2}$/.test(uf)) { filtros.push('e.uf = ?'); args.push(uf) }
  const sql = palavras.length
    ? `select e.json from editais_busca b join editais_brutos e on e.controle = b.controle where editais_busca match ? and ${filtros.join(' and ')} order by e.encerramento limit ?`
    : `select e.json from editais_brutos e where ${filtros.join(' and ')} order by e.encerramento limit ?`
  const linhasAchadas = await turso.consultar(sql, [...(palavras.length ? [palavras.map((p) => `"${p}"*`).join(' AND ')] : []), ...args, Math.min(50, Math.max(1, limite))])
  return linhasAchadas.map((l) => { try { return JSON.parse(l.json) } catch { return null } }).filter(Boolean)
}

/** Números para o painel master. */
export async function situacaoTurso(turso) {
  const [total] = await turso.consultar('select count(*) as n, max(coletado_em) as ultima from editais_brutos')
  const abertos = await turso.consultar('select count(*) as n from editais_brutos where encerramento >= ?', [new Date().toISOString().slice(0, 19)])
  return { editais: total?.n ?? 0, abertos: abertos[0]?.n ?? 0, ultimaColeta: total?.ultima ?? null }
}
