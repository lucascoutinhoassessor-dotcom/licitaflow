import { describe, expect, it, vi } from 'vitest'
import { clienteTurso, coletarRodada, comandosEdital, linhas, urlHttp } from './turso.js'
import { criarHandler } from './oportunidades.js'

const resposta = () => ({ setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() })
const edital = (n: number) => ({ numeroControlePNCP: `12345678000199-1-${String(n).padStart(6, '0')}/2026`, orgaoEntidade: { cnpj: '12345678000199' }, anoCompra: 2026, sequencialCompra: n, modalidadeId: 6, unidadeOrgao: { ufSigla: 'MG', municipioNome: 'Varginha' }, objetoCompra: 'Aquisição de notebooks', valorTotalEstimado: 1000, dataEncerramentoProposta: '2026-12-01T10:00:00' })

describe('turso', () => {
  it('converte o endereço libsql em https e recusa lixo', () => {
    expect(urlHttp('libsql://banco-org.turso.io')).toBe('https://banco-org.turso.io')
    expect(urlHttp('javascript:alert(1)')).toBeNull()
    expect(clienteTurso({})).toBeNull()
  })

  it('monta upsert do bruto e índice de busca; ignora controle inválido', () => {
    const c = comandosEdital(edital(7), '2026-11-22T00:00:00Z')
    expect(c).toHaveLength(3)
    expect(c[0][1][0]).toBe('12345678000199-1-000007/2026')
    expect(JSON.parse(c[0][1].at(-1) as string).objetoCompra).toBe('Aquisição de notebooks')
    expect(comandosEdital({ numeroControlePNCP: 'x' })).toEqual([])
  })

  it('lê linhas do pipeline como objetos', () => {
    expect(linhas({ response: { result: { cols: [{ name: 'n' }, { name: 'u' }], rows: [[{ type: 'integer', value: '3' }, { type: 'null' }]] } } })).toEqual([{ n: 3, u: null }])
  })

  it('coleta uma rodada: grava os editais e guarda a página vista', async () => {
    const enviados: unknown[] = []
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('turso.io')) {
        const corpo = JSON.parse(String(init!.body))
        enviados.push(corpo)
        const n = corpo.requests.length - 1
        return new Response(JSON.stringify({ results: [...Array(n)].map(() => ({ type: 'ok', response: { type: 'execute', result: { cols: [], rows: [] } } })).concat([{ type: 'ok' }]) }))
      }
      if (url.includes('codigoModalidadeContratacao=6&pagina=1')) return new Response(JSON.stringify({ data: [edital(1), edital(2)], totalPaginas: 1 }))
      return new Response(null, { status: 204 })
    })
    const turso = clienteTurso({ TURSO_DATABASE_URL: 'libsql://b-o.turso.io', TURSO_AUTH_TOKEN: 't' }, fetcher as typeof fetch)!
    const feitos = await coletarRodada(turso, { fetcher: fetcher as typeof fetch, hoje: new Date('2026-11-22T12:00:00Z') })
    expect(feitos).toContainEqual({ modalidade: 6, pagina: 1, editais: 2 })
    const sqls = (enviados as { requests: { stmt?: { sql: string; args: { value?: string }[] } }[] }[]).flatMap((e) => e.requests.map((r) => r.stmt).filter(Boolean))
    expect(sqls.filter((s) => s!.sql.includes('insert into editais_brutos'))).toHaveLength(2)
    expect(sqls.some((s) => s!.sql.includes('coleta_estado') && s!.args.some((a) => a.value === '20261122:1'))).toBe(true)
  })

  it('a coleta exige o segredo e o endereço antigo continua 410', async () => {
    const h = criarHandler({ env: { SUPABASE_URL: 'https://s', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 'k' }, fetcher: vi.fn(async () => new Response('false')) as unknown as typeof fetch })
    const r1 = resposta(); await h({ method: 'POST', query: { acao: 'turso-coletar' }, headers: { 'x-coleta': 'a'.repeat(64) } }, r1)
    expect(r1.status).toHaveBeenCalledWith(401)
    const r2 = resposta(); await h({ method: 'GET', query: {}, headers: {} }, r2)
    expect(r2.status).toHaveBeenCalledWith(410)
  })
})
