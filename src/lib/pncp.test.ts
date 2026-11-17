import { afterEach, describe, expect, it, vi } from 'vitest'
import { dadosProcesso, type CompraPNCP } from './pncp'

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
  it('importa a identificação e a empresa sem inventar dados ausentes', () => {
    expect(dadosProcesso(compra, 'empresa-1')).toMatchObject({ empresa_id: 'empresa-1', modalidade: 'pregao_eletronico', pncp_controle: compra.numeroControlePNCP, valor_estimado: 10000, data_abertura: null, link_edital: 'https://pncp.gov.br/app/editais/12345678000100/2026/1' })
    expect(dadosProcesso({ ...compra, modalidadeId: 8 }, 'empresa-2').modalidade).toBe('dispensa')
  })

})
