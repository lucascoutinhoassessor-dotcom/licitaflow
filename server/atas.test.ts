import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler, { cnpjValido, colocacoesNoTexto, extrairOcorrencias, extrairParticipantes, falaDaEmpresa, lerPorItem, prioridadeDocumento } from './atas.js'

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

describe('colocação na ata', () => {
  it('pega a colocação escrita perto do CNPJ e ignora o que está longe', () => {
    expect(colocacoesNoTexto('1º lugar ALFA LTDA 11.222.333/0001-81 R$ 10,00; BETA LTDA CNPJ 33.000.167/0001-01 classificação: 2')).toEqual({ '11222333000181': 1, '33000167000101': 2 })
    expect(colocacoesNoTexto('GAMA LTDA 11.222.333/0001-81 ' + 'x'.repeat(200) + ' 3º lugar')).toEqual({})
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
    expect(o[1]).toMatchObject({ tipo: 'sem_proposta', empresa: 'BETA CAFE LTDA' })
    expect(o[2]).toMatchObject({ tipo: 'inabilitacao', empresa: 'GAMA FERRAGENS EIRELI', itens: null })
    expect(o[2].motivo).toContain('não atender ao item 10.11.1')
  })

  it('troca apelidos (LIC004) pelo nome e gera uma ocorrência por empresa', () => {
    const texto = `LIC001 DELTA MEDICAL LTDA Não Não LIC004 EPSILON HOSPITALAR LTDA Sim Não
      De: SISTEMA - Para: TODOS - (Data e Hora: 15/09/2026 09:01:40) Resultado da classificação das propostas lançadas: 1º - LIC001 (Classificado). LIC004 (Desclassificado: Proposta não informada.)`
    const o = extrairOcorrencias(texto)
    expect(o).toEqual([expect.objectContaining({ tipo: 'sem_proposta', empresa: 'EPSILON HOSPITALAR LTDA', motivo: 'Proposta não informada.' })])
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

describe('participantes da ata', () => {
  it('lista cada CNPJ válido com a razão social, sem o órgão e sem números inválidos', () => {
    const texto = `PREFEITURA MUNICIPAL CNPJ 77.888.999/0001-81. Licitantes participantes:
      ALFA COMERCIO LTDA, CNPJ 11.222.333/0001-81, apresentou proposta.
      44.555.666/0001-81 BETA SERVICOS EIRELI Sim Não
      Processo 12.345.678/0001-00. ALFA COMERCIO LTDA 11222333000181 classificada em 1º lugar.`
    const p = extrairParticipantes(texto, '77888999000181')
    expect(p).toEqual([
      { cnpj: '11222333000181', nome: 'ALFA COMERCIO LTDA', mencoes: 2 },
      { cnpj: '44555666000181', nome: 'BETA SERVICOS EIRELI', mencoes: 1 },
    ])
  })

  it('lê tabelas com nome em caixa mista, sem LTDA ou com código antes do CNPJ', () => {
    const validade = `Fornecedor CPF/CNPJ Validade (conforme edital) Porto Seguro Companhia de Seguros Gerais 11.222.333/0001-81 60 dias SEGVERDE - CONSULTORIA AMBIENTAL LTDA 44.555.666/0001-81 60 dias Aberta`
    expect(extrairParticipantes(validade).map((p) => p.nome)).toEqual(['Porto Seguro Companhia de Seguros Gerais', 'SEGVERDE - CONSULTORIA AMBIENTAL LTDA'])
    const classificacao = `Razão Social Num Documento Oferta Inicial Oferta Final ME 1 GENESIS DISTRIBUIDORA HOSPITALAR LTDA 013 11.222.333/0001-81 8,23 5,99 Sim 2 CENTRALL MED 302 44.555.666/0001-81 8,23 8,23 Sim`
    expect(extrairParticipantes(classificacao).map((p) => p.nome)).toEqual(['GENESIS DISTRIBUIDORA HOSPITALAR LTDA', 'CENTRALL MED'])
  })

  it('confere os dígitos do CNPJ', () => {
    expect(cnpjValido('11222333000181')).toBe(true)
    expect(cnpjValido('11222333000182')).toBe(false)
    expect(cnpjValido('11111111111111')).toBe(false)
  })
})

describe('leitura por item (termo de julgamento enviado)', () => {
  const termo = `Termo de Julgamento PREGÃO ELETRÔNICO Nº 90035/2024 UASG 160062 COMANDO DO EXERCITO CNPJ 00.394.452/0001-03
    Item 11 - MICROCOMPUTADOR Quantidade: 16 Valor estimado (unitário): R$ 17.400,0000 Situação: Adjudicado e Homologado
    Eventos do Item
    Recusa de proposta 02/09/2025 10:12 Recusa da proposta. Fornecedor: ALFA COMERCIO LTDA, CNPJ 11.222.333/0001-81, Valor: R$ 3.900,0000. Motivo: Marca ofertada não atende ao processador exigido.
    Inabilitação de fornecedor 03/09/2025 09:00 Inabilitação do fornecedor BETA SERVICOS EIRELI, CNPJ 44.555.666/0001-81, Valor: R$ 4.100,0000. Motivo: Atestado de capacidade técnica insuficiente.
    Aceite de proposta 04/09/2025 14:30 Aceite individual da proposta. Fornecedor: MAGIBE INDUSTRIA E COMERCIO DE ELETRONICOS LTDA, CNPJ 42.923.049/0002-47, Valor: R$ 4.730,0000
    Item 12 - MICROCOMPUTADOR Situação: Adjudicado e Homologado
    Aceite de proposta 04/09/2025 14:40 Aceite individual da proposta. Fornecedor: MAGIBE INDUSTRIA E COMERCIO DE ELETRONICOS LTDA, CNPJ 42.923.049/0002-47, Valor: R$ 4.730,0000`

  it('separa as empresas de cada item com valor, situação e motivo, sem o órgão', () => {
    const itens = lerPorItem(termo, '00394452000103')
    expect(itens.map((i) => [i.tipo, i.numero, i.empresas.length])).toEqual([['item', 11, 3], ['item', 12, 1]])
    const i11 = itens[0].empresas
    expect(i11[0]).toMatchObject({ cnpj: '11222333000181', nome: 'ALFA COMERCIO LTDA', valor: 3900, situacao: 'recusa' })
    expect(i11[0].motivo).toContain('Marca ofertada')
    expect(i11[1]).toMatchObject({ cnpj: '44555666000181', valor: 4100, situacao: 'inabilitacao' })
    expect(i11[2]).toMatchObject({ cnpj: '42923049000247', valor: 4730, situacao: 'classificada' })
  })

  it('sem seções de item, não inventa nada', () => {
    expect(lerPorItem('ALFA COMERCIO LTDA, CNPJ 11.222.333/0001-81 desclassificada.')).toEqual([])
  })
})

describe('envio de ata', () => {
  beforeEach(() => { process.env.SUPABASE_URL = 'https://exemplo.supabase.co'; process.env.SUPABASE_ANON_KEY = 'anon' })
  afterEach(() => vi.unstubAllGlobals())
  it('recusa arquivo que não é PDF e não grava nada', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'servico'
    const f = vi.fn(async (url: string) => url.includes('/auth/v1/user') ? new Response(JSON.stringify({ id: '0f8fad5b-d9cb-469f-a165-70867728950e' })) : new Response('{}'))
    vi.stubGlobal('fetch', f)
    const res = resposta()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, query: { acao: 'enviar', idCompra: '16006205900352024' }, body: { arquivo: 'x.pdf', pdf: Buffer.from('não é pdf').toString('base64') } }, res)
    expect(res.status).toHaveBeenCalledWith(422)
    expect(f.mock.calls.some(([u]) => String(u).includes('atas_enviadas'))).toBe(false)
  })
  it('só aceita POST no envio', async () => {
    const res = resposta()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, query: { controle: '00394452000103-1-023239/2024' } }, res)
    expect(res.status).toHaveBeenCalledWith(405)
  })
})
