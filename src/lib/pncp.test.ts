import { afterEach, describe, expect, it, vi } from 'vitest'
import { consultarPNCP, consultarCatalogo, FonteLimitadaError, dadosProcesso, urlConsulta, type CompraPNCP } from './pncp'

const filtros = { inicio: '2026-11-09', fim: '2026-11-16', modalidade: '6', uf: 'SP' }
const compra: CompraPNCP = {
  numeroControlePNCP: '12345678000100-1-000001/2026', numeroCompra: '1/2026', anoCompra: 2026,
  sequencialCompra: 1, objetoCompra: 'Aquisição de computadores', modalidadeId: 6, modalidadeNome: 'Pregão eletrônico',
  orgaoEntidade: { cnpj: '12345678000100', razaoSocial: 'Prefeitura' },
  unidadeOrgao: { ufSigla: 'SP', municipioNome: 'São Paulo' }, valorTotalEstimado: 10000,
  dataPublicacaoPncp: '2026-11-09T10:00:00-03:00', dataAberturaProposta: null, dataEncerramentoProposta: null,
}
afterEach(() => vi.unstubAllGlobals())

describe('integração PNCP', () => {
  it('envia datas, UF, modalidade e página na consulta oficial', () => {
    const url = new URL(urlConsulta(filtros, 2))
    expect(Object.fromEntries(url.searchParams)).toEqual({ dataInicial: '20261109', dataFinal: '20261116', codigoModalidadeContratacao: '6', pagina: '2', tamanhoPagina: '50', uf: 'SP' })
    expect(new URL(urlConsulta({ ...filtros, uf: '' }, 1)).searchParams.has('uf')).toBe(false)
    expect(() => urlConsulta({ ...filtros, fim: '2026-11-01' }, 1)).toThrow('período válido')
  })
  it('importa a identificação e a empresa sem inventar dados ausentes', () => {
    expect(dadosProcesso(compra, 'empresa-1')).toMatchObject({ empresa_id: 'empresa-1', modalidade: 'pregao_eletronico', pncp_controle: compra.numeroControlePNCP, valor_estimado: 10000, data_abertura: null, link_edital: 'https://pncp.gov.br/app/editais/12345678000100/2026/1' })
    expect(dadosProcesso({ ...compra, modalidadeId: 8 }, 'empresa-2').modalidade).toBe('dispensa')
  })
  it('trata resposta vazia e falha do serviço sem produzir resultados falsos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(consultarPNCP(filtros, 1)).resolves.toEqual({ data: [], totalPaginas: 0, totalRegistros: 0 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })))
    await expect(consultarPNCP(filtros, 1)).rejects.toThrow('fonte de oportunidades não respondeu')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')))
    await expect(consultarPNCP(filtros, 1)).rejects.toThrow('resposta inesperada')
  })
  it('respeita a pausa pedida pela fonte sem tratar limite como resultado vazio',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:429,headers:{'Retry-After':'120'}})))
    const antes=Date.now()
    const erro=await consultarCatalogo(filtros,1).catch(e=>e)
    expect(erro).toBeInstanceOf(FonteLimitadaError)
    expect(erro.retomarEm).toBeGreaterThanOrEqual(antes+120000)
  })

})
