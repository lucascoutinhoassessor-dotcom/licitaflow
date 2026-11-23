import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler, { idCompraDe, resumirPrecos } from './precos.js'

const compra = (o: Record<string, unknown>) => ({ idCompra: 1, dataResultado: '2026-10-01', precoUnitario: 10, quantidade: 5, siglaUnidadeFornecimento: 'UN', descricaoItem: 'CANETA', nomeFornecedor: 'LOJA', niFornecedor: '11111111000111', marca: 'BIC', nomeOrgao: 'ÓRGÃO', estado: 'SP', ...o })
const resposta = () => ({ setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() })

describe('resumo do histórico de preços', () => {
  it('separa por unidade, calcula mediana e ignora preços inválidos', () => {
    const r = resumirPrecos([
      compra({ precoUnitario: 2 }), compra({ precoUnitario: 4, dataResultado: '2026-11-01' }), compra({ precoUnitario: 1000 }),
      compra({ precoUnitario: 40, siglaUnidadeFornecimento: 'CX', marca: 'PILOT' }), compra({ precoUnitario: 0 }), compra({ precoUnitario: 'x' }),
    ])
    expect(r.total).toBe(4)
    expect(r.unidades[0]).toEqual({ unidade: 'UN', n: 3, minimo: 2, maximo: 1000, media: 335.33, mediana: 4 })
    expect(r.unidades[1].unidade).toBe('CX')
    expect(r.marcas[0]).toEqual({ marca: 'BIC', n: 3 })
    expect(r.compras[0].data).toBe('2026-11-01')
  })
})

describe('endpoint de preços', () => {
  beforeEach(() => { process.env.SUPABASE_URL = 'https://exemplo.supabase.co'; process.env.SUPABASE_ANON_KEY = 'anon' })
  afterEach(() => vi.unstubAllGlobals())

  it('valida tipo, código e UF sem chamar a fonte', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    for (const query of [{ tipo: 'X', codigo: '1' }, { tipo: 'M', codigo: 'abc' }, { tipo: 'M', codigo: '1', uf: 'ZZ' }]) {
      const res = resposta(); await handler({ method: 'GET', headers: { authorization: 'Bearer t' }, query }, res)
      expect(res.status).toHaveBeenCalledWith(400)
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('consulta material pelo PDM e serviço pelo código do catálogo', async () => {
    const fetch = vi.fn(async (url: string) => url.includes('/auth/v1/user') ? new Response('{"id":"u"}') : new Response(JSON.stringify({ resultado: [compra({})], totalPaginas: 1 })))
    vi.stubGlobal('fetch', fetch)
    await handler({ method: 'GET', headers: { authorization: 'Bearer t' }, query: { tipo: 'M', codigo: '281', uf: 'SP', de: '2026-01-01', ate: '2026-11-01' } }, resposta())
    await handler({ method: 'GET', headers: { authorization: 'Bearer t' }, query: { tipo: 'S', codigo: '7250' } }, resposta())
    const urls = fetch.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('pesquisa-preco'))
    expect(urls[0]).toContain('1_consultarMaterial?')
    expect(urls[0]).toContain('tipo=codigoPdm&codigo=281')
    expect(urls[0]).toContain('estado=SP')
    expect(urls[1]).toContain('3_consultarServico?')
    expect(urls[1]).toContain('codigoItemCatalogo=7250')
  })
})

describe('código da compra', () => {
  it('usa o idCompraItem em texto, porque o idCompra numérico perde precisão', () => {
    // JSON.parse('98052305900062026') vira 98052305900062030 no JavaScript.
    expect(idCompraDe({ idCompra: JSON.parse('98052305900062026'), idCompraItem: '9805230590006202600098' })).toBe('98052305900062026')
    expect(idCompraDe({ idCompra: 16006205900352024 })).toBe('16006205900352024')
    expect(idCompraDe({})).toBe('')
  })
})
