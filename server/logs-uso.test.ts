import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { linhas } from './turso.js'
import { _reiniciarEsquema, consultarLogs, normalizarEventos, registrarLogs } from './logs-uso.js'
import { criarHandler } from './oportunidades.js'
import { limparProtecoes } from './protecao.js'

function tursoLocal() {
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
  const db = new DatabaseSync(':memory:')
  const tipo = (v: unknown) => v === null ? { type: 'null' } : typeof v === 'number' || typeof v === 'bigint' ? { type: 'integer', value: String(v) } : { type: 'text', value: String(v) }
  async function pipeline(comandos: [string, unknown[]?][]) {
    return comandos.map(([sql, args = []]) => {
      const rows = db.prepare(sql).all(...(args as never[])) as Record<string, unknown>[]
      const cols = rows.length ? Object.keys(rows[0]) : []
      return { type: 'ok', response: { type: 'execute', result: { cols: cols.map((name) => ({ name })), rows: rows.map((r) => cols.map((c) => tipo(r[c]))) } } }
    })
  }
  return { db, pipeline, consultar: async (sql: string, args?: unknown[]) => linhas((await pipeline([[sql, args]]))[0]), lote: async (c: [string, unknown[]?][]) => (await pipeline(c)).map(linhas) }
}

const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222', ORG = '33333333-3333-3333-3333-333333333333'
beforeEach(() => { _reiniciarEsquema(); limparProtecoes() })

describe('normalizarEventos', () => {
  it('descarta tipo inválido e mensagem vazia, corta textos e limita a 50', () => {
    const r = normalizarEventos([{ tipo: 'x', mensagem: 'a' }, { tipo: 'erro', mensagem: '' }, { tipo: 'erro', mensagem: 'm'.repeat(900), detalhe: { a: 1 }, duracao_ms: 12.4 }])
    expect(r).toHaveLength(1)
    expect(r[0].mensagem).toHaveLength(500)
    expect(r[0].detalhe).toBe('{"a":1}')
    expect(r[0].duracao_ms).toBe(12)
    expect(normalizarEventos(Array.from({ length: 80 }, () => ({ tipo: 'acao', mensagem: 'a' })))).toHaveLength(50)
  })
  it('usa a hora do servidor quando a do navegador não é plausível', () => {
    const agora = Date.parse('2026-11-22T12:00:00Z')
    expect(normalizarEventos([{ tipo: 'acao', mensagem: 'a', em: '2020-01-01T00:00:00Z' }], agora)[0].criado_em).toBe('2026-11-22T12:00:00.000Z')
    expect(normalizarEventos([{ tipo: 'acao', mensagem: 'a', em: '2026-11-22T11:59:00Z' }], agora)[0].criado_em).toBe('2026-11-22T11:59:00.000Z')
  })
})

describe('registrar e consultar', () => {
  it('grava por usuário e o master filtra por tipo, usuário e busca', async () => {
    const t = tursoLocal()
    await registrarLogs(t, { usuario: U1, email: 'a@x.com', org: ORG, navegador: 'UA' }, [{ tipo: 'pagina', mensagem: 'Abriu /app' }, { tipo: 'erro', mensagem: 'gravou processos respondeu 500', area: '/app/processos' }], () => 1)
    await registrarLogs(t, { usuario: U2, email: 'b@x.com', org: 'não-é-uuid' }, [{ tipo: 'lento', mensagem: 'função buscar levou 6.0 s', duracao_ms: 6000 }], () => 1)
    const tudo = await consultarLogs(t, {})
    expect(tudo.eventos).toHaveLength(3)
    expect(tudo.ultimas24h).toMatchObject({ eventos: 3, erros: 1, lentos: 1, usuarios: 2 })
    expect(tudo.usuarios[0]).toMatchObject({ usuario: U1, email: 'a@x.com', org: ORG, erros: 1 })
    expect(tudo.usuarios.find((u: { usuario: string }) => u.usuario === U2).org).toBeNull()
    expect((await consultarLogs(t, { tipo: 'erro' })).eventos.map((e: { mensagem: string }) => e.mensagem)).toEqual(['gravou processos respondeu 500'])
    expect((await consultarLogs(t, { usuario: U2 })).eventos).toHaveLength(1)
    expect((await consultarLogs(t, { busca: 'b@x' })).eventos).toHaveLength(1)
    expect((await consultarLogs(t, { busca: '100%' })).eventos).toHaveLength(0)
  })
  it('pagina pelo id e apaga o que passou de 90 dias', async () => {
    const t = tursoLocal()
    await registrarLogs(t, { usuario: U1 }, Array.from({ length: 50 }, (_, i) => ({ tipo: 'acao', mensagem: `a${i}` })), () => 1)
    await registrarLogs(t, { usuario: U1 }, Array.from({ length: 50 }, (_, i) => ({ tipo: 'acao', mensagem: `b${i}` })), () => 1)
    await registrarLogs(t, { usuario: U1 }, Array.from({ length: 50 }, (_, i) => ({ tipo: 'acao', mensagem: `c${i}` })), () => 1)
    const p1 = await consultarLogs(t, {})
    expect(p1.eventos).toHaveLength(100); expect(p1.haMais).toBe(true)
    const p2 = await consultarLogs(t, { antes: p1.eventos.at(-1).id })
    expect(p2.eventos).toHaveLength(50); expect(p2.haMais).toBe(false)
    t.db.prepare(`update logs_uso set criado_em = '2020-01-01T00:00:00.000Z' where mensagem like 'a%'`).run()
    await registrarLogs(t, { usuario: U1 }, [{ tipo: 'acao', mensagem: 'x' }], () => 0)
    expect((t.db.prepare('select count(*) as n from logs_uso').get() as { n: number }).n).toBe(101)
  })
})

describe('rotas no /api/oportunidades', () => {
  const env = { SUPABASE_URL: 'https://s', SUPABASE_ANON_KEY: 'a', TURSO_DATABASE_URL: 'libsql://x.turso.io', TURSO_AUTH_TOKEN: 't' }
  function resposta() {
    const r = { statusCode: 0, corpo: null as unknown, setHeader: vi.fn(), status(c: number) { r.statusCode = c; return r }, json(j: unknown) { r.corpo = j; return r } }
    return r
  }
  it('registrar sem login responde 401; consultar exige master', async () => {
    const fetcher = vi.fn(async (url: string) => new Response(url.includes('is_platform_admin') ? 'false' : '{}', { status: url.includes('/auth/v1/user') ? 401 : 200 }))
    const h = criarHandler({ env, fetcher: fetcher as unknown as typeof fetch, validarSessao: async () => 'u1', sessaoCompleta: async () => null })
    const r1 = resposta()
    await h({ method: 'POST', query: { acao: 'turso-logs-registrar' }, headers: { authorization: 'Bearer x' }, body: { eventos: [] } }, r1)
    expect(r1.statusCode).toBe(401)
    const r2 = resposta()
    await h({ method: 'GET', query: { acao: 'turso-logs' }, headers: { authorization: 'Bearer y' } }, r2)
    expect(r2.statusCode).toBe(403)
  })
  it('registrar grava com o id e o e-mail da sessão (não os do corpo)', async () => {
    const pedidos: unknown[] = []
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => { pedidos.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ results: [] })) })
    const h = criarHandler({ env, fetcher: fetcher as unknown as typeof fetch, validarSessao: async () => U1, sessaoCompleta: async () => ({ id: U1, email: 'a@x.com' }) })
    const r = resposta()
    await h({ method: 'POST', query: { acao: 'turso-logs-registrar' }, headers: { authorization: 'Bearer z', 'user-agent': 'UA' }, body: { org: ORG, usuario: U2, eventos: [{ tipo: 'erro', mensagem: 'falhou' }] } }, r)
    expect(r.statusCode).toBe(200)
    const insert = (pedidos.at(-1) as { requests: { stmt?: { sql: string; args: { value?: string }[] } }[] }).requests.find((q) => q.stmt?.sql.startsWith('insert'))
    expect(insert?.stmt?.args.slice(1, 4).map((a) => a.value)).toEqual([U1, 'a@x.com', ORG])
  })
})
