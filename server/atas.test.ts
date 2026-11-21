import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler, { extrairOcorrencias, falaDaEmpresa, prioridadeDocumento } from './atas.js'

const resposta = () => ({ setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() })

describe('escolha dos documentos', () => {
  it('prefere a ata da sessão e ignora minuta de ARP, edital e contrato', () => {
    expect(prioridadeDocumento('Ata da Sessao', 'Outros Documentos')).toBe(1)
    expect(prioridadeDocumento('Ata-Sessao-023_2026.pdf', 'Outros Documentos')).toBe(1)
    expect(prioridadeDocumento('Relatorio de julgamento', 'Outros Documentos')).toBe(2)
    expect(prioridadeDocumento('Termo de Adjudicacao e Homologacao', 'Outros Documentos')).toBe(4)
    expect(prioridadeDocumento('Minuta Ata SRP', 'Minuta de Ata de Registro de Preços')).toBeNull()
    expect(prioridadeDocumento('Edital e anexos.pdf', 'Edital')).toBeNull()
    expect(prioridadeDocumento('Termo de Referencia', 'Termo de Referência')).toBeNull()
  })
})

describe('leitura das atas', () => {
  it('separa desclassificação e inabilitação com empresa, itens, data e motivo', () => {
    const texto = `14/09/2026 11:45:04 MENSAGEM PREGOEIRO Encerrado o prazo para envio de documentos, informamos que a empresa ALFA SUPRIMENTOS LTDA foi desclassificada por não apresentar os mesmos, para os itens 2 e 14.
      14/09/2026 14:16:48 MENSAGEM PREGOEIRO A empresa BETA CAFE LTDA não apresentou proposta, por este motivo foi desclassificada.
      03/09/2026 10:00:00 MENSAGEM PREGOEIRO Pela inabilitação da empresa GAMA FERRAGENS EIRELI, por não atender ao item 10.11.1 do Edital.`
    const o = extrairOcorrencias(texto)
    expect(o).toHaveLength(3)
    expect(o[0]).toMatchObject({ tipo: 'desclassificacao', empresa: 'ALFA SUPRIMENTOS LTDA', itens: 'Itens 2 e 14', data: '14/09/2026 11:45' })
    expect(o[1]).toMatchObject({ tipo: 'desclassificacao', empresa: 'BETA CAFE LTDA' })
    expect(o[2]).toMatchObject({ tipo: 'inabilitacao', empresa: 'GAMA FERRAGENS EIRELI', itens: null })
    expect(o[2].motivo).toContain('não atender ao item 10.11.1')
  })

  it('troca apelidos (LIC004) pelo nome e gera uma ocorrência por empresa', () => {
    const texto = `LIC001 DELTA MEDICAL LTDA Não Não LIC004 EPSILON HOSPITALAR LTDA Sim Não
      De: SISTEMA - Para: TODOS - (Data e Hora: 15/09/2026 09:01:40) Resultado da classificação das propostas lançadas: 1º - LIC001 (Classificado). LIC004 (Desclassificado: Proposta não informada.)`
    const o = extrairOcorrencias(texto)
    expect(o).toEqual([expect.objectContaining({ tipo: 'desclassificacao', empresa: 'EPSILON HOSPITALAR LTDA', motivo: 'Proposta não informada.' })])
  })

  it('ignora regras do edital, decisões que afastam a desclassificação e linhas de tabela', () => {
    const texto = `10/09/2026 09:00 MENSAGEM PREGOEIRO Se o lance errado for vencedor, só será possível a desclassificação do participante.
      10/09/2026 09:05 MENSAGEM PREGOEIRO A proposta que não atender ao edital será desclassificada.
      Conclusão: não assiste razão à ZETA LTDA, inexistindo fundamento suficiente para desclassificação da proposta.
      2 ZETA LTDA 0,00 0,00 Desclassifica do 3 ETA LTDA 10,00 20,00 Classificado`
    expect(extrairOcorrencias(texto)).toEqual([])
  })

  it('reconhece a empresa pelo CNPJ ou pelas palavras da razão social', () => {
    const o = { tipo: 'desclassificacao', empresa: 'ALFA SUPRIMENTOS LTDA', cnpj: null, itens: null, data: null, motivo: 'foi desclassificada' }
    expect(falaDaEmpresa(o, '11222333000144', 'ALFA SUPRIMENTOS E SERVICOS LTDA')).toBe(true)
    expect(falaDaEmpresa(o, '11222333000144', 'OMEGA COMERCIO LTDA')).toBe(false)
    expect(falaDaEmpresa({ ...o, empresa: null, cnpj: '11222333000144' }, '11222333000144', '')).toBe(true)
  })
})

describe('endpoint das atas', () => {
  beforeEach(() => { process.env.SUPABASE_URL = 'https://exemplo.supabase.co'; process.env.SUPABASE_ANON_KEY = 'anon' })
  afterEach(() => vi.unstubAllGlobals())
  it('exige login e parâmetros válidos sem chamar o PNCP', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    const r1 = resposta(); await handler({ method: 'GET', headers: {}, query: { controle: '11222333000144-1-000001/2026' } }, r1)
    expect(r1.status).toHaveBeenCalledWith(401)
    const r2 = resposta(); await handler({ method: 'GET', headers: { authorization: 'Bearer x' }, query: {} }, r2)
    expect(r2.status).toHaveBeenCalledWith(400)
    expect(f).not.toHaveBeenCalled()
  })
})
