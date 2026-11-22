import { afterEach, describe, expect, it, vi } from 'vitest'
import { arrumarTexto, classificarDocumento, coletarPagina, criarHandler, dataDoPortal, lerChat, nomeDoArquivo, pecasDoProcesso } from './juridico.js'
import { limparProtecoes } from './protecao.js'

const ARQ = (n: number) => `https://arquivos.portaldecompraspublicas.com.br/v1/download/${String(n).padStart(2, '0').repeat(32)}`
const resposta = () => ({ setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() })
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

describe('classificação dos arquivos do processo', () => {
  it('reconhece os nomes padronizados do portal', () => {
    expect(classificarDocumento({ nome: 'Recurso item 0001 - CARLOS SILVEIRA', tipo: 'Documento Anexo' }))
      .toEqual({ tipo: 'recurso', papel: 'pedido', titulo: 'Recurso', empresa: 'CARLOS SILVEIRA', item: 'Item 1' })
    expect(classificarDocumento({ nome: 'Contrarrazão do lote 0002 - ALTERNATIVA SERVICOS LTDA', tipo: 'Documento Anexo' }))
      .toMatchObject({ tipo: 'contrarrazoes', empresa: 'ALTERNATIVA SERVICOS LTDA', item: 'Lote 2' })
    expect(classificarDocumento({ nome: 'Pedidos de Impugnação - ImpugnacaoCamalu.pdf', tipo: 'Documento Anexo' }))
      .toMatchObject({ tipo: 'impugnacao', papel: 'pedido', empresa: null })
    expect(classificarDocumento({ nome: 'Julgamento da Impugnação - Decisao_PE_008.pdf', tipo: 'Documento Anexo' })).toMatchObject({ tipo: 'impugnacao', papel: 'resposta' })
    expect(classificarDocumento({ nome: 'Resposta de Esclarecimento - resp.pdf', tipo: 'Documento Anexo' })).toMatchObject({ tipo: 'esclarecimento', papel: 'resposta' })
    expect(classificarDocumento({ nome: 'Esclarecimentos - Esclarecimento Camalaú PB.pdf', tipo: 'Documento Anexo' })).toMatchObject({ tipo: 'esclarecimento', papel: 'pedido' })
    expect(classificarDocumento({ nome: 'Julgamento do item 0001', tipo: 'Documento Anexo' })).toMatchObject({ tipo: 'recurso', papel: 'resposta', item: 'Item 1' })
    expect(classificarDocumento({ nome: 'Resposta_Recurso_Pregao_021.pdf', tipo: 'Justificativa de revisão da fase recursal' })).toMatchObject({ tipo: 'recurso', papel: 'resposta' })
  })

  it('em "Outros documentos" só aceita nomes claros e ignora relatórios, atas e edital', () => {
    expect(classificarDocumento({ nome: 'DECISÃO ADMINISTRATIVA SOBRE RECURSO.pdf', tipo: 'Outros documentos' })).toMatchObject({ tipo: 'recurso', papel: 'resposta' })
    expect(classificarDocumento({ nome: 'Contrarrazoes.PEDVIDA SAUDE.pdf', tipo: 'Outros documentos' })).toMatchObject({ tipo: 'contrarrazoes' })
    expect(classificarDocumento({ nome: 'RESPOSTA DA IMPUGNACAO.pdf', tipo: 'Outros documentos' })).toMatchObject({ tipo: 'impugnacao', papel: 'resposta' })
    expect(classificarDocumento({ nome: 'Pedidos de Esclarecimento', tipo: 'Relatorio' })).toBeNull()
    expect(classificarDocumento({ nome: 'Ata Final', tipo: 'Documento' })).toBeNull()
    expect(classificarDocumento({ nome: 'EDITAL - item 9 recurso orçamentário.pdf', tipo: 'Edital' })).toBeNull()
    expect(classificarDocumento({ nome: 'Planilha de custos.pdf', tipo: 'Outros documentos' })).toBeNull()
  })

  it('lê a data do portal no horário de Brasília', () => {
    expect(dataDoPortal('19/11/2026-16:21:57')).toBe('2026-11-19T16:21:57-03:00')
    expect(dataDoPortal('19/11/2026-16:15')).toBe('2026-11-19T16:15:00-03:00')
    expect(dataDoPortal(null)).toBeNull()
  })
})

describe('andamento do processo (chat)', () => {
  const frases = [
    { apelido: 'Sistema', dataHoraFrase: '2026-07-24T16:52:03Z', frase: 'O fornecedor CARLOS SILVEIRA - ME declarou intenção de recurso para o item 0001.' },
    { apelido: 'F. INSTITUTO VISAO PARA TODOS', dataHoraFrase: '2026-07-24T17:00:00Z', frase: 'Documentação Item 0003: GOSTARIA DE MANIFESTAR INTENÇÃO DE RECURSO, pois o atestado não confere.' },
    { apelido: 'Sistema', dataHoraFrase: '2026-07-24T18:00:00Z', frase: 'Intenção de recurso foi indeferida para o item 0001.' },
    { apelido: 'Sistema', dataHoraFrase: '2026-07-29T23:27:30Z', frase: 'O fornecedor CARLOS SILVEIRA - ME enviou recurso para o item 0001.' },
    { apelido: 'Pregoeiro', dataHoraFrase: '2026-07-24T16:48:13Z', frase: 'Neste momento iremos abrir o prazo de intenção de recurso da proposta' },
  ]

  it('separa as intenções (do sistema e escritas pela empresa) e junta a decisão', () => {
    const { intencoes, enviados } = lerChat(frases)
    expect(intencoes).toHaveLength(2)
    expect(intencoes[0]).toMatchObject({ tipo: 'intencao-recurso', empresa: 'CARLOS SILVEIRA - ME', item: 'Item 1', arquivo_url: null })
    expect(intencoes[0].trecho).toContain('Decisão: intenção indeferida.')
    expect(intencoes[1]).toMatchObject({ empresa: 'INSTITUTO VISAO PARA TODOS', item: 'Item 3' })
    expect(intencoes[1].trecho).toContain('atestado não confere')
    expect(enviados).toEqual([{ tipo: 'recurso', empresa: 'CARLOS SILVEIRA - ME', item: 'Item 1', data: '2026-07-29T23:27:30Z' }])
  })

  it('usa a data do envio no chat quando o arquivo não tem data', () => {
    const pecas = pecasDoProcesso([
      { nome: 'Recurso item 0001 - CARLOS SILVEIRA', tipo: 'Documento Anexo', url: ARQ(1), dataHora: null },
      { nome: 'Julgamento do item 0001', tipo: 'Documento Anexo', url: ARQ(2), dataHora: null },
      { nome: 'Pedidos de Impugnação - x.pdf', tipo: 'Documento Anexo', url: ARQ(3), dataHora: '10/07/2026-09:00' },
      { nome: 'Pedidos de Esclarecimento', tipo: 'Relatorio', url: null },
      { nome: 'Recurso item 0002 - OUTRA LTDA', tipo: 'Documento Anexo', url: 'https://exemplo.com/recurso.pdf' },
    ], frases)
    expect(pecas.map((p) => p.titulo)).toEqual(['Recurso', 'Julgamento do recurso', 'Impugnação · x', 'Intenção de recurso', 'Intenção de recurso'])
    expect(pecas[0].data).toBe('2026-07-29T23:27:30Z')
    expect(pecas[1].data).toBeNull() // sem data conhecida: a tela mostra a data da sessão
    expect(pecas[2].data).toBe('2026-07-10T09:00:00-03:00')
  })

  it('"Julgamento do item" sem recurso no processo é julgamento comum, não entra', () => {
    expect(pecasDoProcesso([{ nome: 'Julgamento do item 0001', tipo: 'Documento Anexo', url: ARQ(2) }], [])).toEqual([])
  })
})

describe('nome do arquivo no título', () => {
  it('tira o prefixo do portal e a extensão', () => {
    expect(nomeDoArquivo('Pedidos de Impugnação - IMPUGNACAO_EMPRESA_ALFA.pdf')).toBe('IMPUGNACAO EMPRESA ALFA')
    expect(nomeDoArquivo('Resposta de Esclarecimento - resposta 02.docx')).toBe('resposta 02')
    expect(nomeDoArquivo('DECISÃO SOBRE RECURSO.pdf')).toBe('DECISÃO SOBRE RECURSO')
  })
})

describe('coleta de uma página', () => {
  it('lê a lista do dia, os arquivos, o chat e a lei só de quem tem peças', async () => {
    const chamadas: string[] = []
    const fetcher = vi.fn(async (url: string) => {
      chamadas.push(url)
      if (url.includes('/processos?')) return json({ pageCount: 3, result: [
        { codigoLicitacao: 10, razaoSocial: 'Prefeitura de Gramado', numero: '18/2026', resumo: 'Pneus', urlReferencia: '/rs/gramado/pe-18-2026-10', unidadeCompradora: { cidade: 'Gramado', uf: 'rs' }, tipoLicitacao: { tipoLicitacao: 'Pregão Eletrônico' } },
        { codigoLicitacao: 11, razaoSocial: 'Prefeitura de Taquari', resumo: 'Merenda', urlReferencia: '/rs/taquari/d-1-11', unidadeCompradora: { uf: 'RS' }, tipoLicitacao: { tipoLicitacao: 'Dispensa' } },
      ] })
      if (url.endsWith('/10/documentos/processo')) return json([{ nome: 'Recurso item 0001 - ALFA LTDA', tipo: 'Documento Anexo', url: ARQ(5), dataHora: '01/08/2026-10:00' }])
      if (url.endsWith('/11/documentos/processo')) return json([{ nome: 'Edital.pdf', tipo: 'Edital', url: ARQ(6) }])
      if (url.includes('/chat?')) return json({ frasesChat: [] })
      if (url.endsWith('/v2/licitacao/rs/gramado/pe-18-2026-10')) return json({ lei14133: true })
      return json(null, 404)
    })
    const r = await coletarPagina({ dia: '2026-07-24', pagina: 2 }, fetcher as unknown as typeof fetch)
    expect(r.paginas).toBe(3)
    expect(r.lidos).toBe(2)
    expect(chamadas[0]).toContain('pagina=2&limitePagina=50&dataInicial=2026-07-24&dataFinal=2026-07-24&tipoData=1')
    expect(chamadas.some((u) => u.includes('/11/chat'))).toBe(false) // dispensa não tem fase recursal
    expect(chamadas.some((u) => u.endsWith('/v2/licitacao/rs/taquari/d-1-11'))).toBe(false)
    expect(r.processos[0]).toMatchObject({ codigo: 10, orgao: 'Prefeitura de Gramado', uf: 'RS', municipio: 'Gramado', lei14133: true, sessao: '2026-07-24',
      url: 'https://www.portaldecompraspublicas.com.br/processos/rs/gramado/pe-18-2026-10' })
    expect(r.processos[0].pecas).toHaveLength(1)
    expect(r.processos[1]).toMatchObject({ codigo: 11, pecas: [] })
    expect(chamadas.some((u) => u.startsWith('https://arquivos.'))).toBe(true) // tenta ler o começo do PDF para a busca
    chamadas.length = 0
    await coletarPagina({ dia: '2026-07-24', pagina: 2, prazo: 0 }, fetcher as unknown as typeof fetch)
    expect(chamadas.some((u) => u.startsWith('https://arquivos.'))).toBe(false) // sem tempo, deixa para a passada 2
  })
})

describe('texto do PDF', () => {
  it('junta linhas quebradas no meio da frase e mantém os parágrafos', () => {
    expect(arrumarTexto('RECURSO ADMINISTRATIVO\nA empresa ALFA, inscrita\nno CNPJ  nº 1,\n\n\n\nvem apresentar')).toBe('RECURSO ADMINISTRATIVO\nA empresa ALFA, inscrita no CNPJ nº 1,\n\nvem apresentar')
  })
})

describe('função /api/juridico', () => {
  const env = { ...process.env }
  afterEach(() => { process.env = { ...env }; limparProtecoes() })
  const configurar = () => Object.assign(process.env, { SUPABASE_URL: 'https://db.exemplo', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'servico' })

  it('coleta sem token válido é recusada antes de chamar o portal', async () => {
    configurar()
    const fetcher = vi.fn()
    const res = resposta()
    await criarHandler({ fetcher })({ method: 'GET', query: { acao: 'coletar' }, headers: { 'x-coleta': 'nao-e-hex' } }, res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('coleta grava a página e para quando não há mais trabalho', async () => {
    configurar()
    const corpos: Record<string, unknown>[] = []
    let proximos = 0
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/rpc/pecas_coleta_proximo')) return json(proximos++ === 0 ? { dia: '2026-07-24', passada: 1, pagina: 1 } : null)
      if (url.endsWith('/rpc/pecas_coleta_gravar')) { corpos.push(JSON.parse(String(init?.body))); return json({ pecas: 0 }) }
      if (url.includes('/processos?')) return json({ pageCount: 1, result: [] })
      return json(null, 404)
    })
    const res = resposta()
    await criarHandler({ fetcher: fetcher as unknown as typeof fetch })({ method: 'GET', query: { acao: 'coletar' }, headers: { 'x-coleta': 'ab'.repeat(32) } }, res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(corpos[0]).toMatchObject({ p_token: 'ab'.repeat(32), p_dia: '2026-07-24', p_passada: 1, p_pagina: 1, p_paginas: 1, p_lidos: 0, p_processos: [] })
    expect(res.json.mock.calls[0][0].feitos).toHaveLength(1)
  })

  it('leitura só aceita arquivos do portal e exige login', async () => {
    configurar()
    const fetcher = vi.fn()
    let res = resposta()
    await criarHandler({ fetcher })({ method: 'GET', query: { acao: 'ler', url: 'https://169.254.169.254/latest' }, headers: { authorization: 'Bearer x' } }, res)
    expect(res.status).toHaveBeenCalledWith(400)
    res = resposta()
    await criarHandler({ fetcher })({ method: 'GET', query: { acao: 'ler', url: ARQ(1) }, headers: {} }, res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('arquivo que não é PDF volta com o motivo, sem erro', async () => {
    configurar()
    vi.stubGlobal('fetch', vi.fn(async () => json({ id: 'u1' })))
    const fetcher = vi.fn(async () => new Response(new Uint8Array([0x50, 0x4b, 3, 4]), { status: 200 }))
    const res = resposta()
    await criarHandler({ fetcher: fetcher as unknown as typeof fetch })({ method: 'GET', query: { acao: 'ler', url: ARQ(9) }, headers: { authorization: 'Bearer x' } }, res)
    vi.unstubAllGlobals()
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json.mock.calls[0][0]).toEqual({ texto: null, motivo: expect.stringContaining('não é PDF') })
  })
})
