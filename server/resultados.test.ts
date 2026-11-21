import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler, { janelasPeriodo, resumirResultados } from './resultados.js'

const r = (o: Record<string, unknown>) => ({
  idContratacaoPNCP: '07954480000179-1-023585/2026', numeroItemPncp: 1, nomeRazaoSocialFornecedor: 'EMPRESA TESTE SA', porteFornecedorNome: 'Demais',
  unidadeOrgaoUfSigla: 'SP', orgaoEntidadeCnpj: '07954480000179', valorTotalHomologado: 1000, quantidadeHomologada: 2, valorUnitarioHomologado: 500,
  dataResultadoPncp: '2026-10-01T00:00:00', situacaoCompraItemResultadoId: 1, aplicacaoBeneficioMeepp: false, dataCancelamentoPncp: null, ...o,
})
const resposta = () => ({ setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() })

describe('resumo de resultados por fornecedor', () => {
  it('soma itens válidos, agrupa por UF e órgão e ignora cancelados e valores absurdos', () => {
    const s = resumirResultados([
      r({}),
      r({ numeroItemPncp: 2, unidadeOrgaoUfSigla: 'RJ', orgaoEntidadeCnpj: '11111111000111', valorTotalHomologado: 3000, idContratacaoPNCP: 'x-1-000002/2026', aplicacaoBeneficioMeepp: true, dataResultadoPncp: '2026-11-01T00:00:00' }),
      r({ numeroItemPncp: 3, dataCancelamentoPncp: '2026-11-02T00:00:00', valorTotalHomologado: 99999 }),
      r({ numeroItemPncp: 4, valorTotalHomologado: 5e12 }),
    ])
    expect(s.itensVencidos).toBe(3)
    expect(s.editaisVencidos).toBe(2)
    expect(s.valorHomologado).toBe(4000)
    expect(s.itensComBeneficioMeEpp).toBe(1)
    expect(s.porUf[0]).toEqual({ uf: 'RJ', valor: 3000 })
    expect(s.ultimos[0].item).toBe(2)
    expect(s.nome).toBe('EMPRESA TESTE SA')
  })
})

describe('endpoint de análise de empresa', () => {
  beforeEach(() => { process.env.SUPABASE_URL = 'https://exemplo.supabase.co'; process.env.SUPABASE_ANON_KEY = 'anon'; delete process.env.PORTAL_TRANSPARENCIA_CHAVE })
  afterEach(() => vi.unstubAllGlobals())

  it('exige login e CNPJ válido sem chamar a fonte', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    let res = resposta(); await handler({ method: 'GET', headers: {}, query: { cnpj: '81243735000903', de: '2026-01-01', ate: '2026-11-01' } }, res)
    expect(res.status).toHaveBeenCalledWith(401)
    res = resposta(); await handler({ method: 'GET', headers: { authorization: 'Bearer t' }, query: { cnpj: '123', de: '2026-01-01', ate: '2026-11-01' } }, res)
    expect(res.status).toHaveBeenCalledWith(400)
    res = resposta(); await handler({ method: 'GET', headers: { authorization: 'Bearer t' }, query: { cnpj: '81243735000903', de: '2019-01-01', ate: '2026-11-01' } }, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('consulta a fonte oficial pelo CNPJ e devolve o resumo', async () => {
    const fetch = vi.fn(async (url: string) => url.includes('/auth/v1/user')
      ? new Response('{"id":"u"}')
      : new Response(JSON.stringify({ resultado: [r({})], totalPaginas: 1 })))
    vi.stubGlobal('fetch', fetch)
    const res = resposta()
    await handler({ method: 'GET', headers: { authorization: 'Bearer t' }, query: { cnpj: '81.243.735/0009-03', de: '2025-11-20', ate: '2026-11-20' } }, res)
    const url = fetch.mock.calls.map((c) => String(c[0])).find((u) => u.includes('dadosabertos.compras.gov.br'))!
    expect(url).toContain('niFornecedor=81243735000903')
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ itensVencidos: 1, valorHomologado: 1000, sancoes: null, sancoesDisponiveis: false }))
  })
})

describe('janelas do período', () => {
  it('divide 6 anos em janelas de até 365 dias, da mais recente para a mais antiga, sem buracos', () => {
    const j = janelasPeriodo('2020-11-20', '2026-11-20')
    expect(j[0].ate).toBe('2026-11-20')
    expect(j.at(-1)!.de).toBe('2020-11-20')
    for (const x of j) expect((Date.parse(x.ate) - Date.parse(x.de)) / 86_400_000).toBeLessThanOrEqual(365)
    for (let i = 1; i < j.length; i++) expect(Date.parse(j[i - 1].de) - Date.parse(j[i].ate)).toBe(86_400_000)
  })
  it('um período de até 1 ano é uma janela só', () => {
    expect(janelasPeriodo('2025-11-20', '2026-11-20')).toEqual([{ de: '2025-11-20', ate: '2026-11-20' }])
  })
})
