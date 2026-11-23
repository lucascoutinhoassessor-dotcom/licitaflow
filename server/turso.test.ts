import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { buscarTurso, clienteTurso, coletarRodada, itensTurso, linhas, montarFiltros, urlHttp } from './turso.js'
import { consultaFts, diaUtil, portalDe, raiz, tempo, tipoPeloObjeto } from './turso-regras.js'
import { criarHandler } from './oportunidades.js'

/** "Turso" local: o mesmo SQL rodando no SQLite do Node, com a resposta no formato do /v2/pipeline. */
function tursoLocal() {
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
  const db = new DatabaseSync(':memory:')
  const tipo = (v: unknown) => v === null ? { type: 'null' } : typeof v === 'number' || typeof v === 'bigint' ? (Number.isInteger(Number(v)) ? { type: 'integer', value: String(v) } : { type: 'float', value: Number(v) }) : { type: 'text', value: String(v) }
  async function pipeline(comandos: [string, unknown[]?][]) {
    return comandos.map(([sql, args = []]) => {
      const st = db.prepare(sql)
      const rows = st.all(...(args.map((a) => (typeof a === 'boolean' ? Number(a) : a)) as never[])) as Record<string, unknown>[]
      const cols = rows.length ? Object.keys(rows[0]) : []
      return { type: 'ok', response: { type: 'execute', result: { cols: cols.map((name) => ({ name })), rows: rows.map((r) => cols.map((c) => tipo(r[c]))) } } }
    })
  }
  async function transacao(comandos: [string, unknown[]?][]) {
    db.exec('begin')
    try { await pipeline(comandos); db.exec('commit') } catch (e) { db.exec('rollback'); throw e }
  }
  return {
    db, pipeline, transacao,
    consultar: async (sql: string, args?: unknown[]) => linhas((await pipeline([[sql, args]]))[0]),
    lote: async (comandos: [string, unknown[]?][]) => (await pipeline(comandos)).map(linhas),
    prepararEsquema: async () => { const { ESQUEMA } = await import('./turso.js'); return pipeline(ESQUEMA.map((s: string) => [s])) },
  }
}

const dias = (n: number) => new Date(Date.now() + n * 86400_000)
const pncpData = (d: Date) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 19) // horário de Brasília, sem fuso
function edital(seq: number, extra: Record<string, unknown> = {}) {
  return {
    numeroControlePNCP: `12345678000199-1-${String(seq).padStart(6, '0')}/2026`, orgaoEntidade: { cnpj: '12345678000199', razaoSocial: 'PREFEITURA DE VARGINHA' },
    anoCompra: 2026, sequencialCompra: seq, numeroCompra: String(seq), modalidadeId: 6, modalidadeNome: 'Pregão - Eletrônico', situacaoCompraId: 1,
    unidadeOrgao: { ufSigla: 'MG', municipioNome: 'Varginha' }, objetoCompra: 'Aquisição de material de escritório', valorTotalEstimado: 1000, srp: false,
    linkSistemaOrigem: 'https://www.portaldecompraspublicas.com.br/processos/x', dataPublicacaoPncp: pncpData(dias(-2)), dataEncerramentoProposta: pncpData(dias(5)),
    dataAtualizacaoGlobal: pncpData(dias(-1)), ...extra,
  }
}

describe('regras da base rápida', () => {
  it('portal pelo link e, na falta, pelo nome do sistema', () => {
    expect(portalDe({ linkSistemaOrigem: 'https://cnetmobile.estaleiro.serpro.gov.br/x' })).toBe('comprasnet')
    expect(portalDe({ usuarioNome: 'BLL Compras' })).toBe('bll')
    expect(portalDe({})).toBe('outros')
  })
  it('palavra-chave vira consulta por prefixo, com plural reduzido e ";" como "ou"', () => {
    expect(raiz('computadores')).toBe('computador')
    expect(raiz('licitacoes')).toBe('licitac')
    expect(consultaFts('Notebooks de 15"; cadeira')).toBe('("notebook"* AND "15"*) OR ("cadeira"*)')
    expect(consultaFts('de da')).toBeNull()
  })
  it('tipo pelo objeto, horário de Brasília e dia útil', () => {
    expect(tipoPeloObjeto('Prestação de serviços de limpeza')).toBe('S')
    expect(tipoPeloObjeto('Aquisição de notebooks')).toBe('M')
    expect(tempo('2026-11-23T09:00:00')).toBe('2026-11-23T12:00:00.000Z')
    expect(diaUtil('2026-11-23T12:00:00.000Z')).toBe(1) // segunda
    expect(diaUtil('2026-11-20T15:00:00.000Z')).toBe(0) // Consciência Negra
    expect(diaUtil('2026-11-22T15:00:00.000Z')).toBe(0) // domingo
    expect(urlHttp('libsql://licitaforce-x.aws-sa-east-1.turso.io')).toBe('https://licitaforce-x.aws-sa-east-1.turso.io')
    expect(clienteTurso({})).toBeNull()
  })
  it('recusa filtros inválidos', () => {
    expect(() => montarFiltros({ modalidades: [] })).toThrow('Selecione')
    expect(() => montarFiltros({ minimo: '10', maximo: '5' })).toThrow('Valores')
  })
})

describe('coleta e busca no Turso', () => {
  async function preparar() {
    const turso = tursoLocal()
    const editais = [
      edital(1, { objetoCompra: 'Aquisição de computadores e notebooks para a secretaria' }),
      edital(2, { objetoCompra: 'Prestação de serviços de limpeza predial', unidadeOrgao: { ufSigla: 'SP', municipioNome: 'Campinas' }, valorTotalEstimado: 50000 }),
      edital(3, { objetoCompra: 'Registro de preços para futura aquisição de material de consumo', srp: true }),
      edital(4, { objetoCompra: 'Aquisição de cadeiras', dataEncerramentoProposta: pncpData(dias(-5)) }), // já encerrado
    ]
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('/contratacoes/proposta') && url.includes('codigoModalidadeContratacao=6&pagina=1')) return new Response(JSON.stringify({ data: editais, totalPaginas: 1 }))
      if (url.includes('/compras/2026/3/itens')) return new Response(JSON.stringify([{ numeroItem: 1, descricao: 'Notebook i5 16GB', materialOuServico: 'M', valorUnitarioEstimado: 4500, tipoBeneficio: 1, quantidade: 10 }, { numeroItem: 2, descricao: 'Grampeador', materialOuServico: 'M', valorUnitarioEstimado: 30, tipoBeneficio: 4 }]))
      if (url.includes('/itens?')) return new Response('[]')
      return new Response(null, { status: 204 })
    })
    const feitos = await coletarRodada(turso as never, { fetcher: fetcher as never, prazo: Date.now() + 40_000, maxConsultas: 60, intervaloMs: 0 })
    return { turso, feitos }
  }

  it('carga completa grava os editais, os itens e marca a carga como concluída', async () => {
    const { turso, feitos } = await preparar()
    expect(feitos).toContainEqual(expect.objectContaining({ etapa: 'carga', modalidade: 6, gravados: 3 })) // o encerrado há 5 dias não entra
    expect(feitos).toContainEqual(expect.objectContaining({ etapa: 'itens' }))
    const [e] = await turso.consultar('select count(*) n, sum(itens_completos) c from editais where encerramento >= ?', [new Date().toISOString()])
    expect(e).toEqual({ n: 3, c: 3 })
    expect((await turso.consultar("select valor from coleta_estado where chave = 'carga_completa_em'")).length).toBe(1)
    expect((await turso.consultar("select portal, tipo_objeto from editais where sequencial = 1"))[0]).toEqual({ portal: 'pcp', tipo_objeto: 'M' })
  })

  it('migra o FTS antigo para o rowid do edital e apaga sem varrer a tabela', async () => {
    const { turso } = await preparar()
    const { MIGRAR_FTS_ROWID, gravarEditais } = await import('./turso.js')
    // Simula a base antiga: linhas do FTS com rowid que não bate com o do edital.
    turso.db.exec("create table v as select controle, texto from editais_fts; delete from editais_fts; insert into editais_fts(rowid, controle, texto) select 1000 + rowid, controle, texto from v; delete from coleta_estado where chave = 'fts_rowid'")
    await turso.transacao(MIGRAR_FTS_ROWID as never)
    expect(await turso.consultar('select count(*) n from editais_fts f join editais e on e.rowid = f.rowid and e.controle = f.controle')).toEqual([{ n: 3 }])
    expect(await turso.consultar('select count(*) n from itens_fts f join editais e on e.rowid = f.rowid and e.controle = f.controle')).toEqual([{ n: 1 }])
    expect((await buscarTurso(turso as never, { busca: 'grampeador' })).data.map((c) => c.sequencialCompra)).toEqual([3])
    // Edital que mudou: troca a linha do FTS, sem duplicar.
    expect(await gravarEditais(turso as never, [edital(1, { objetoCompra: 'Aquisição de impressoras', dataAtualizacaoGlobal: pncpData(dias(0)) })])).toBe(1)
    expect(await turso.consultar('select count(*) n from editais_fts')).toEqual([{ n: 3 }])
    expect((await buscarTurso(turso as never, { busca: 'impressora' })).totalRegistros).toBe(1)
    expect((await buscarTurso(turso as never, { busca: 'computador' })).totalRegistros).toBe(0)
    const plano = turso.db.prepare("explain query plan delete from editais_fts where rowid = (select rowid from editais where controle = 'x')").all() as { detail: string }[]
    expect(plano[0].detail).toContain('VIRTUAL TABLE INDEX 0:=') // busca pelo rowid; o antigo era 'INDEX 0:' (varredura)
  })

  it('não regrava edital que não mudou na fonte', async () => {
    const { turso } = await preparar()
    const { gravarEditais } = await import('./turso.js')
    expect(await gravarEditais(turso as never, [edital(1, { objetoCompra: 'Aquisição de computadores e notebooks para a secretaria' })])).toBe(0)
    expect(await gravarEditais(turso as never, [edital(1, { dataAtualizacaoGlobal: pncpData(dias(0)) })])).toBe(1)
  })

  it('devolve os itens guardados no formato do PNCP (reserva da página do edital)', async () => {
    const { turso } = await preparar()
    const itens = await itensTurso(turso as never, '12345678000199-1-000003/2026')
    expect(itens?.map((i) => [i.numeroItem, i.descricao, i.valorUnitarioEstimado, i.materialOuServico])).toEqual([[1, 'Notebook i5 16GB', 4500, 'M'], [2, 'Grampeador', 30, 'M']])
    expect(await itensTurso(turso as never, '12345678000199-1-000999/2026')).toBeNull()
  })

  it('busca com os mesmos filtros da tela', async () => {
    const { turso } = await preparar()
    const todos = await buscarTurso(turso as never, {})
    expect(todos.totalRegistros).toBe(3) // o encerrado fica de fora
    expect(todos.catalogo.carga_inicial_concluida).toBe(true)
    expect(todos.orgaos).toEqual([{ cnpj: '12345678000199', razaoSocial: 'PREFEITURA DE VARGINHA' }])
    expect((await buscarTurso(turso as never, { busca: 'computador' })).data.map((c) => c.sequencialCompra)).toEqual([1])
    // Palavra só nos itens (notebook está no item do edital 3 e no objeto do 1).
    expect((await buscarTurso(turso as never, { busca: 'notebooks' })).totalRegistros).toBe(2)
    expect((await buscarTurso(turso as never, { busca: 'grampeador; limpeza' })).totalRegistros).toBe(2)
    expect((await buscarTurso(turso as never, { busca: 'notebook', excluir: 'secretaria' })).data.map((c) => c.sequencialCompra)).toEqual([3])
    expect((await buscarTurso(turso as never, { uf: 'SP' })).totalRegistros).toBe(1)
    expect((await buscarTurso(turso as never, { excluirSrp: true })).totalRegistros).toBe(2)
    expect((await buscarTurso(turso as never, { minimo: '10000' })).totalRegistros).toBe(1)
    expect((await buscarTurso(turso as never, { tipoItem: 'S' })).data[0].materialOuServico).toBe('S')
    expect((await buscarTurso(turso as never, { itemMinimo: '1000' })).data.map((c) => c.sequencialCompra)).toEqual([3])
    expect((await buscarTurso(turso as never, { exclusivo: true })).totalRegistros).toBe(1)
    expect((await buscarTurso(turso as never, { portais: ['comprasnet'] })).totalRegistros).toBe(0)
    const pag = await buscarTurso(turso as never, {}, 2, 2)
    expect(pag.data).toHaveLength(1); expect(pag.totalPaginas).toBe(2)
  })
})

describe('ritmo do PNCP', () => {
  it('para no limite de consultas da rodada e pausa quando o PNCP responde 429', async () => {
    const { pncpComLimite } = await import('./turso.js')
    const f = pncpComLimite(vi.fn(async () => new Response('[]')) as never, 2, 0)
    await f('a'); await f('b')
    await expect(f('c')).rejects.toMatchObject({ fim: true })
    const turso = tursoLocal()
    const fetcher = vi.fn(async () => new Response(null, { status: 429 }))
    const feitos = await coletarRodada(turso as never, { fetcher: fetcher as never, intervaloMs: 0 })
    expect(feitos).toContainEqual({ etapa: 'carga', pausado: true })
    expect((await turso.consultar("select valor from coleta_estado where chave = 'pausado_ate'"))[0].valor > new Date().toISOString()).toBe(true)
    expect(await coletarRodada(turso as never, { fetcher: fetcher as never })).toEqual([expect.objectContaining({ pausado: expect.any(String) })])
  })
})

describe('endereço /api/oportunidades', () => {
  const resposta = () => ({ setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() })
  it('a coleta exige o token do banco e o endereço antigo continua 410', async () => {
    const h = criarHandler({ env: { SUPABASE_URL: 'https://s', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 'k' }, fetcher: vi.fn(async () => new Response('false')) as unknown as typeof fetch })
    const r1 = resposta(); await h({ method: 'POST', query: { acao: 'turso-coletar' }, headers: { 'x-coleta': 'a'.repeat(64) } }, r1)
    expect(r1.status).toHaveBeenCalledWith(401)
    const r2 = resposta(); await h({ method: 'GET', query: {}, headers: {} }, r2)
    expect(r2.status).toHaveBeenCalledWith(410)
  })
  it('busca sem Turso configurado manda o app usar o Postgres', async () => {
    const h = criarHandler({ env: { SUPABASE_URL: 'https://s', SUPABASE_ANON_KEY: 'a' }, fetcher: vi.fn() as unknown as typeof fetch, validarSessao: async () => 'u1' })
    const r = resposta(); await h({ method: 'POST', query: { acao: 'turso-buscar' }, headers: { authorization: 'Bearer t' }, body: { filtros: {}, pagina: 1 } }, r)
    expect(r.status).toHaveBeenCalledWith(409)
  })
})

describe('economia de cota no Turso', () => {
  async function preparar() {
    const turso = tursoLocal()
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('/contratacoes/proposta') && url.includes('codigoModalidadeContratacao=6&pagina=1')) return new Response(JSON.stringify({ data: [edital(1), edital(3, { objetoCompra: 'Material de consumo' })], totalPaginas: 1 }))
      if (url.includes('/compras/2026/3/itens')) return new Response(JSON.stringify([{ numeroItem: 1, descricao: 'Notebook i5 16GB', materialOuServico: 'M', valorUnitarioEstimado: 4500 }]))
      if (url.includes('/itens?')) return new Response('[]')
      return new Response(null, { status: 204 })
    })
    await coletarRodada(turso as never, { fetcher: fetcher as never, maxConsultas: 60, intervaloMs: 0 })
    return { turso, fetcher }
  }
  const escritas = (turso: ReturnType<typeof tursoLocal>) => (turso.db.prepare('select total_changes() as n').get() as { n: number }).n

  it('data nova no PNCP sem mudança de conteúdo: uma escrita, itens mantidos e só conferidos', async () => {
    const { turso, fetcher } = await preparar()
    const { gravarEditais } = await import('./turso.js')
    const antes = escritas(turso)
    expect(await gravarEditais(turso as never, [edital(3, { objetoCompra: 'Material de consumo', dataAtualizacaoGlobal: pncpData(dias(0)) })])).toBe(1)
    expect(escritas(turso) - antes).toBe(1)
    expect(await turso.consultar("select itens_completos c from editais where sequencial = 3")).toEqual([{ c: 2 }])
    expect(await turso.consultar("select count(*) n from itens")).toEqual([{ n: 1 }]) // a busca por item continua funcionando
    expect((await buscarTurso(turso as never, { itemMinimo: '1000' })).totalRegistros).toBe(1)
    // A conferência acha a mesma lista: só marca como completa, sem apagar e regravar os itens.
    const antes2 = escritas(turso)
    await coletarRodada(turso as never, { fetcher: fetcher as never, maxConsultas: 60, intervaloMs: 0 })
    expect(await turso.consultar("select itens_completos c from editais where sequencial = 3")).toEqual([{ c: 1 }])
    expect(escritas(turso) - antes2).toBeLessThan(10)
    // Conteúdo mudou: regrava a linha e o FTS.
    expect(await gravarEditais(turso as never, [edital(3, { objetoCompra: 'Aquisição de impressoras', dataAtualizacaoGlobal: pncpData(dias(1)) })])).toBe(1)
    expect((await buscarTurso(turso as never, { busca: 'impressora' })).totalRegistros).toBe(1)
  })

  it('migra a base antiga: colunas de hash, índices que cobrem os filtros e fila parcial de itens', async () => {
    const turso = tursoLocal()
    turso.db.exec(`create table editais (controle text primary key, cnpj text not null, ano integer not null, sequencial integer not null, modalidade integer not null, portal text not null, uf text not null, situacao integer, srp integer, modo_disputa integer, valor real, orgao_cnpj text not null, orgao_nome text not null, publicacao text, encerramento text, tipo_objeto text, tipo_itens text, dia_util integer not null default 0, itens_completos integer not null default 0, quantidade_itens integer, itens_tentativas integer not null default 0, atualizado_pncp text, coletado_em text not null, compra text not null);
      create index editais_encerramento on editais(encerramento); create index editais_itens_pendentes on editais(itens_completos, encerramento);
      create table coleta_estado (chave text primary key, valor text not null, atualizado_em text not null)`)
    const { migrarOtimizacao } = await import('./turso.js')
    await migrarOtimizacao(turso as never)
    await migrarOtimizacao(turso as never) // de novo: nada quebra
    const cols = (turso.db.prepare('pragma table_info(editais)').all() as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['hash', 'itens_hash']))
    const plano = (sql: string) => (turso.db.prepare(`explain query plan ${sql}`).all() as { detail: string }[]).map((p) => p.detail).join(' | ')
    expect(plano("select controle from editais where itens_completos <> 1 and itens_tentativas < 5 and encerramento >= '' and encerramento <= 'z' order by encerramento limit 9")).toContain('editais_fila_itens')
    const filtro = montarFiltros({})
    expect(plano(`select count(*) from editais e where ${filtro.onde.join(' and ')}`.replace(/\?/g, "'x'"))).toContain('COVERING INDEX editais_abertos')
    expect(plano(`select e.compra from editais e where ${filtro.onde.join(' and ')} order by e.encerramento, e.controle limit 20`.replace(/\?/g, "'x'"))).not.toContain('TEMP B-TREE')
  })

  it('contagens da busca ficam no Turso para as outras instâncias', async () => {
    const { turso } = await preparar()
    await buscarTurso(turso as never, { uf: 'MG' })
    expect(await turso.consultar('select count(*) n from cache_busca')).toEqual([{ n: 1 }])
    // "Outra instância" (sem a memória da primeira): lê a contagem guardada em vez de contar.
    const outra = { ...turso, lote: vi.fn(turso.lote) }
    const r = await buscarTurso(outra as never, { uf: 'MG' })
    expect(r.totalRegistros).toBe(2)
    expect(outra.lote).toHaveBeenCalledTimes(1) // sem a segunda ida para contar
  })

  it('cota no fim: a busca manda para o Postgres e a coleta para', async () => {
    const { turso, fetcher } = await preparar()
    const { cicloAtual } = await import('./turso-cota.js')
    const { CotaTurso } = await import('./turso.js')
    const ciclo = cicloAtual(new Date()).chave
    turso.db.prepare("insert or replace into coleta_estado values(?, ?, datetime('now'))").run(`lidas:${ciclo}`, String(460_000_000))
    const outra = { ...turso } // instância sem nível em memória
    await expect(buscarTurso(outra as never, { busca: 'qualquer' })).rejects.toBeInstanceOf(CotaTurso)
    turso.db.prepare("insert or replace into coleta_estado values(?, ?, datetime('now'))").run(`lidas:${ciclo}`, String(490_000_000))
    fetcher.mockClear()
    expect(await coletarRodada(turso as never, { fetcher: fetcher as never, intervaloMs: 0 })).toEqual([expect.objectContaining({ cota: 'parado' })])
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('medição e níveis da cota', () => {
  it('planos, ciclo de cobrança e níveis', async () => {
    const { configCota, cicloAtual, nivelCota } = await import('./turso-cota.js')
    expect(configCota({})).toMatchObject({ plano: 'gratis', leituras: 500_000_000, escritas: 10_000_000, diaCiclo: 1 })
    expect(configCota({ TURSO_PLANO: 'Developer', TURSO_CICLO_DIA: '15' })).toMatchObject({ plano: 'developer', leituras: 2_500_000_000, diaCiclo: 15 })
    expect(configCota({ TURSO_PLANO: 'free', TURSO_LIMITE_LEITURAS: '1000' })).toMatchObject({ plano: 'gratis', leituras: 1000 })
    expect(cicloAtual(new Date('2026-11-10T00:00:00Z'), 15).chave).toBe('2026-10-15')
    expect(cicloAtual(new Date('2026-01-03T00:00:00Z'), 5).chave).toBe('2025-12-05')
    const cfg = configCota({}), agora = new Date('2026-11-16T00:00:00Z') // metade do ciclo
    const n = (lidas: number, escritas = 0) => nivelCota({ 'lidas:2026-11-01': String(lidas), 'escritas:2026-11-01': String(escritas) }, cfg, { agora })
    expect(n(100_000_000).nivel).toBe('normal')
    expect(n(200_000_000).leituras).toBe('normal') // 40% na metade do mês: projeção de 80%
    expect(n(300_000_000).leituras).toBe('economia') // 60% na metade: projeção de 120%
    expect(n(460_000_000).leituras).toBe('critico')
    expect(n(0, 9_800_000)).toMatchObject({ escritasNivel: 'parado', nivel: 'parado', leituras: 'normal' })
  })

  it('o cliente soma as linhas que o Turso informa e grava o total junto do pedido seguinte', async () => {
    const corpos: { requests: { type: string; stmt?: { sql: string; args: { value?: string }[] } }[] }[] = []
    const fetcher = vi.fn(async (_url: string, op: { body: string }) => {
      const corpo = JSON.parse(op.body); corpos.push(corpo)
      return new Response(JSON.stringify({ results: corpo.requests.filter((r: { type: string }) => r.type === 'execute').map(() => ({ type: 'ok', response: { type: 'execute', result: { cols: [], rows: [], rows_read: 70_000, rows_written: 3 } } })) }))
    })
    const t = clienteTurso({ TURSO_DATABASE_URL: 'libsql://medicao-x.turso.io', TURSO_AUTH_TOKEN: 't' }, fetcher as never)!
    await t.pipeline([['select 1']])
    expect(t.pendente()).toEqual({ lidas: 70_000, escritas: 3 })
    await t.pipeline([['select 2']], { descarregar: true })
    const somas = corpos[1].requests.filter((r) => r.stmt?.sql.includes('coleta_estado'))
    expect(somas.map((r) => [r.stmt!.args[0].value?.split(':')[0], r.stmt!.args[1].value])).toEqual([['lidas', '70000'], ['escritas', '3']])
    // O que foi somado sai do pendente; fica só o consumo do próprio pedido (2 comandos de soma + 1 select).
    expect(t.pendente()).toEqual({ lidas: 210_000, escritas: 9 })
  })

  it('busca com a cota no fim responde 409 e o app volta para o Postgres', async () => {
    const { cicloAtual } = await import('./turso-cota.js')
    const ciclo = cicloAtual(new Date()).chave
    const resultados = (sql: string) => sql.includes('coleta_estado')
      ? { cols: [{ name: 'chave' }, { name: 'valor' }], rows: [[{ type: 'text', value: 'carga_completa_em' }, { type: 'text', value: '2026-11-01' }], [{ type: 'text', value: `lidas:${ciclo}` }, { type: 'text', value: '480000000' }]] }
      : { cols: [], rows: [] }
    const fetcher = vi.fn(async (url: string, op: { body: string }) => {
      if (url.includes('/v2/pipeline')) {
        const corpo = JSON.parse(op.body)
        return new Response(JSON.stringify({ results: corpo.requests.filter((r: { type: string }) => r.type === 'execute').map((r: { stmt: { sql: string } }) => ({ type: 'ok', response: { type: 'execute', result: resultados(r.stmt.sql) } })) }))
      }
      return new Response('true')
    })
    const h = criarHandler({ env: { SUPABASE_URL: 'https://s', SUPABASE_ANON_KEY: 'a', TURSO_DATABASE_URL: 'libsql://cota-x.turso.io', TURSO_AUTH_TOKEN: 't' }, fetcher: fetcher as unknown as typeof fetch, validarSessao: async () => 'u1' })
    const r = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() }
    await h({ method: 'POST', query: { acao: 'turso-buscar' }, headers: { authorization: 'Bearer t' }, body: { filtros: { uf: 'RJ' }, pagina: 1 } }, r)
    expect(r.status).toHaveBeenCalledWith(409)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'turso_cota' }))
  })
})
