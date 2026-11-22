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
  return {
    db, pipeline,
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
    expect(feitos).toContainEqual(expect.objectContaining({ etapa: 'carga', modalidade: 6, gravados: 4 }))
    expect(feitos).toContainEqual(expect.objectContaining({ etapa: 'itens' }))
    const [e] = await turso.consultar('select count(*) n, sum(itens_completos) c from editais where encerramento >= ?', [new Date().toISOString()])
    expect(e).toEqual({ n: 3, c: 3 })
    expect((await turso.consultar("select valor from coleta_estado where chave = 'carga_completa_em'")).length).toBe(1)
    expect((await turso.consultar("select portal, tipo_objeto from editais where sequencial = 1"))[0]).toEqual({ portal: 'pcp', tipo_objeto: 'M' })
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
