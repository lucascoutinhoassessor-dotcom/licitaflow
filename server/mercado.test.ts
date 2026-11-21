import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler, { lerCodigos, resumirMercado } from './mercado.js'
import { limparProtecoes } from './protecao.js'

const compra = (o: Record<string, unknown>) => ({
  idCompra: 1, idCompraItem: String(Math.random()), numeroItemCompra: 1, dataResultado: '2026-10-01', precoUnitario: 10, quantidade: 5,
  siglaUnidadeFornecimento: 'UN', descricaoItem: 'CANETA', nomeFornecedor: 'LOJA', niFornecedor: '11111111000111', marca: 'BIC',
  nomeOrgao: 'ÓRGÃO A', codigoUasg: '100', estado: 'SP', esfera: 'F', poder: 'E', modalidade: 5, _codigo: 'M1', ...o,
})
const resposta = () => ({ setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() })

describe('códigos do catálogo', () => {
  it('aceita M/S com número, sem repetir, até 6', () => {
    expect(lerCodigos('M5308, S7250,M5308')).toEqual([{ tipo: 'M', codigo: 5308 }, { tipo: 'S', codigo: 7250 }])
    expect(lerCodigos('')).toBeNull()
    expect(lerCodigos('X1')).toBeNull()
    expect(lerCodigos('M1,M2,M3,M4,M5,M6,M7')).toBeNull()
  })
})

describe('resumo do mercado', () => {
  it('soma valor (preço × quantidade) por estado, mês, órgão, empresa, marca e catálogo', () => {
    const r = resumirMercado([
      compra({}), // 50
      compra({ estado: 'RJ', dataResultado: '2026-09-10', niFornecedor: '22222222000122', nomeFornecedor: 'OUTRA', marca: 'pilot', precoUnitario: 100, quantidade: 2, idCompra: 2, _codigo: 'M2' }), // 200
      compra({ marca: 'null', quantidade: null }), // 10
      compra({ precoUnitario: 0 }), // ignorado
    ])
    expect(r.itens).toBe(3)
    expect(r.compras).toBe(2)
    expect(r.valorTotal).toBe(260)
    expect(r.porUf).toEqual([{ uf: 'RJ', itens: 1, valor: 200 }, { uf: 'SP', itens: 2, valor: 60 }])
    expect(r.porMes.map((m) => m.mes)).toEqual(['2026-09', '2026-10'])
    expect(r.empresas[0]).toMatchObject({ cnpj: '22222222000122', nome: 'OUTRA', itens: 1, valor: 200 })
    expect(r.marcas.map((m) => m.marca)).toEqual(['PILOT', 'BIC'])
    expect(r.catalogo).toEqual([{ codigo: 'M2', itens: 1, valor: 200 }, { codigo: 'M1', itens: 2, valor: 60 }])
    expect(r.totalOrgaos).toBe(1)
    expect(r.recentes[0].data).toBe('2026-10-01')
  })

  it('descarta preço 50× fora da mediana do mesmo item e unidade', () => {
    const r = resumirMercado([compra({}), compra({}), compra({}), compra({ precoUnitario: 2_000_000 }), compra({ precoUnitario: 0.01 }), compra({ precoUnitario: 5000, siglaUnidadeFornecimento: 'CX' })])
    expect(r.descartadas).toBe(2)
    expect(r.itens).toBe(4)
    expect(r.valorTotal).toBe(150 + 25000)
  })

  it('não conta duas vezes o mesmo item e aplica esfera, poder e modalidade', () => {
    const r = resumirMercado([
      compra({ idCompraItem: 'a' }), compra({ idCompraItem: 'a' }),
      compra({ esfera: 'M' }), compra({ poder: 'J' }), compra({ modalidade: 6 }),
    ], { esfera: 'F', poder: 'E', modalidade: '5' })
    expect(r.itens).toBe(1)
  })
})

describe('endpoint de mercado', () => {
  beforeEach(() => { process.env.SUPABASE_URL = 'https://exemplo.supabase.co'; process.env.SUPABASE_ANON_KEY = 'anon'; limparProtecoes() })
  afterEach(() => vi.unstubAllGlobals())

  it('valida códigos, UF, filtros e período sem chamar a fonte', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    const ok = { codigos: 'M1', de: '2026-01-01', ate: '2026-11-01' }
    for (const query of [{ ...ok, codigos: '' }, { ...ok, uf: 'ZZ' }, { ...ok, esfera: 'X' }, { ...ok, de: '2020-01-01' }, { ...ok, de: '2026-12-01' }]) {
      const res = resposta(); await handler({ method: 'GET', headers: { authorization: 'Bearer t' }, query }, res)
      expect(res.status).toHaveBeenCalledWith(400)
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('consulta cada item do catálogo e devolve o resumo', async () => {
    const fetch = vi.fn(async (url: string) => url.includes('/auth/v1/user') ? new Response('{"id":"u"}') : new Response(JSON.stringify({ resultado: [compra({ idCompraItem: url })], totalPaginas: 1 })))
    vi.stubGlobal('fetch', fetch)
    const res = resposta()
    await handler({ method: 'GET', headers: { authorization: 'Bearer t' }, query: { codigos: 'M281,S7250', uf: 'SP', de: '2026-01-01', ate: '2026-11-01' } }, res)
    const urls = fetch.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('pesquisa-preco'))
    expect(urls.some((u) => u.includes('1_consultarMaterial?') && u.includes('codigo=281') && u.includes('estado=SP'))).toBe(true)
    expect(urls.some((u) => u.includes('3_consultarServico?') && u.includes('codigoItemCatalogo=7250'))).toBe(true)
    const corpo = res.json.mock.calls[0][0]
    expect(corpo.itens).toBe(2)
    expect(corpo.catalogo.map((c: { codigo: string }) => c.codigo).sort()).toEqual(['M281', 'S7250'])
  })
})
