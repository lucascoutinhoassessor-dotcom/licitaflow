import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler, { montarCompra } from './compra.js'
import { perfilEmpresa } from './resultados.js'

const resposta = () => ({ setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() })

describe('detalhe de compra federal', () => {
  it('junta itens, vencedores em ordem de classificação e marca', () => {
    const c = montarCompra(
      { idCompra: '13503606000242026', numeroControlePNCP: '00348003000110-1-001431/2026', objetoCompra: 'Aquisição de canetas', orgaoEntidadeRazaoSocial: 'EMBRAPA', modalidadeNome: 'Dispensa', srp: true },
      [{ numeroItemPncp: 2, numeroItemCompra: 2, descricaoResumida: 'Lápis', materialOuServicoNome: 'Material' }, { numeroItemPncp: 1, numeroItemCompra: 1, descricaoResumida: 'Caneta', descricaodetalhada: 'Caneta azul', materialOuServicoNome: 'Material', quantidade: 10 }],
      [
        { numeroItemPncp: 1, nomeRazaoSocialFornecedor: 'B', niFornecedor: '22222222000122', valorUnitarioHomologado: 20, ordemClassificacaoSrp: 2 },
        { numeroItemPncp: 1, nomeRazaoSocialFornecedor: 'A', niFornecedor: '11111111000111', valorUnitarioHomologado: 15.55, ordemClassificacaoSrp: 1 },
        { numeroItemPncp: 1, nomeRazaoSocialFornecedor: 'Cancelado', valorUnitarioHomologado: 1, dataCancelamentoPncp: '2026-11-01' },
      ],
      { 1: { marca: 'PILOT' } },
    )
    expect(c.controle).toBe('00348003000110-1-001431/2026')
    expect(c.itens.map((i) => i.numero)).toEqual([1, 2])
    expect(c.itens[0]).toMatchObject({ descricao: 'Caneta azul', marca: 'PILOT', quantidade: 10 })
    expect(c.itens[0].resultados.map((r) => r.fornecedor)).toEqual(['A', 'B'])
    expect(c.itens[1].resultados).toEqual([])
  })
})

describe('endpoint da compra', () => {
  beforeEach(() => { process.env.SUPABASE_URL = 'https://exemplo.supabase.co'; process.env.SUPABASE_ANON_KEY = 'anon' })
  afterEach(() => vi.unstubAllGlobals())
  it('exige login e código válido sem chamar a fonte', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    let res = resposta(); await handler({ method: 'GET', headers: {}, query: { idCompra: '13503606000242026' } }, res)
    expect(res.status).toHaveBeenCalledWith(401)
    res = resposta(); await handler({ method: 'GET', headers: { authorization: 'Bearer t' }, query: { idCompra: '12; drop' } }, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('perfil da empresa', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('soma o que mais vende sem contar item repetido e pega a marca da própria empresa', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('2.1_consultarItens')) return new Response(JSON.stringify({ resultado: [
        { numeroItemPncp: 1, numeroItemCompra: 1, nomePdm: 'NOTEBOOK', materialOuServico: 'M', codigoPdm: 10 },
        { numeroItemPncp: 1, numeroItemCompra: 1, nomePdm: 'NOTEBOOK', materialOuServico: 'M', codigoPdm: 10 },
        { numeroItemPncp: 2, numeroItemCompra: 2, nomePdm: 'MOUSE', materialOuServico: 'M', codigoPdm: 11 },
      ] }))
      return new Response(JSON.stringify({ resultado: [{ numeroItemCompra: 1, niFornecedor: '11111111000111', marca: 'DELL' }, { numeroItemCompra: 1, niFornecedor: '99999999000199', marca: 'OUTRA' }] }))
    }))
    const p = await perfilEmpresa('11111111000111', [{ idCompraItem: '1350360600024202600001', numeroItemPncp: 1, valorTotalHomologado: 5000 }])
    expect(p.fortes).toEqual([{ nome: 'NOTEBOOK', itens: 1, valor: 5000 }])
    expect(p.marcas).toEqual([{ marca: 'DELL', n: 1 }])
    expect(p.marcaPorItem['13503606000242026-1']).toBe('DELL')
  })
})
