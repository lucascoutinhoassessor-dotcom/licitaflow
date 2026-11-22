import { afterEach, describe, expect, it, vi } from 'vitest'
import { abrirPdf, conferirTrechos, criarHandler, prepararDocumentos, prioridadeEdital, reduzir } from './agentes.js'
import { limparProtecoes } from './protecao.js'

const CONTROLE = '11222333000144-1-000045/2026'
const ORG = '33333333-3333-3333-3333-333333333333'
const USER = '11111111-1111-1111-1111-111111111111'
const resposta = () => ({ setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() })
const json = (corpo: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', ...headers } })

/** PDF mínimo com uma página por texto (fonte Helvetica). */
function pdf(paginas: string[]) {
  const objs: string[] = []
  const n = paginas.length
  objs.push('<< /Type /Catalog /Pages 2 0 R >>')
  objs.push(`<< /Type /Pages /Kids [${paginas.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${n} >>`)
  paginas.forEach((t, i) => {
    const stream = `BT /F1 10 Tf 40 700 Td (${t.replace(/[()\\]/g, '')}) Tj ET`
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${3 + n * 2} 0 R >> >> >>`)
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  })
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  let s = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => { offsets.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = s.length
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  s += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new TextEncoder().encode(s)
}

const EDITAL = [
  'PREGAO ELETRONICO 45/2026. A sessao publica sera realizada em 05/12/2026 as 09:00 horas no Compras.gov.br.',
  'HABILITACAO. Certidao negativa de debitos trabalhistas e balanco patrimonial com indice de liquidez geral maior que 1.',
]

function pncp(arquivos: unknown[], bytes: Record<string, Uint8Array>) {
  return async (url: string) => {
    if (url.includes('/api/consulta/v1/')) return json({ objetoCompra: 'Aquisição de material de limpeza', modalidadeNome: 'Pregão - Eletrônico', numeroCompra: '45', orgaoEntidade: { razaoSocial: 'Prefeitura' }, unidadeOrgao: { municipioNome: 'Cidade', ufSigla: 'MG' } })
    if (url.endsWith('/arquivos')) return json(arquivos)
    if (bytes[url]) return new Response(bytes[url], { status: 200 })
    return new Response('nada', { status: 404 })
  }
}

describe('escolha dos arquivos do edital', () => {
  it('lê primeiro o edital e o termo de referência e ignora atas e resultados', () => {
    expect(prioridadeEdital('Edital PE 45-2026.pdf', 'Edital')).toBe(1)
    expect(prioridadeEdital('Termo de Referência', 'Termo de Referência')).toBe(2)
    expect(prioridadeEdital('Anexo II - Modelo de proposta', 'Outros Documentos')).toBe(3)
    expect(prioridadeEdital('Minuta do contrato', 'Minuta do Contrato')).toBe(4)
    expect(prioridadeEdital('Ata da sessão pública', 'Ata')).toBeNull()
    expect(prioridadeEdital('Termo de homologação', 'Outros Documentos')).toBeNull()
    expect(prioridadeEdital('Ata de Registro de Preços - minuta', 'Ata de Registro de Preço')).toBe(4)
  })
})

describe('leitura dos PDFs', () => {
  it('extrai o texto com a marca de cada página', async () => {
    const lido = await abrirPdf(pdf(EDITAL), 100_000)
    expect(lido.paginas).toBe(2)
    expect(lido.escaneado).toBe(false)
    expect(lido.texto).toContain('[Página 1]')
    expect(lido.texto).toContain('[Página 2]')
    expect(lido.texto).toContain('balanco patrimonial')
  })

  it('para no limite de caracteres e reconhece PDF sem texto (escaneado)', async () => {
    const parcial = await abrirPdf(pdf(EDITAL), 150)
    expect(parcial.lidas).toBe(1)
    const vazio = await abrirPdf(pdf(['', '']), 100_000)
    expect(vazio.escaneado).toBe(true)
  })

  it('monta os documentos e avisa o que ficou de fora', async () => {
    const arquivos = [
      { titulo: 'Edital', tipoDocumentoNome: 'Edital', url: 'https://pncp/a1' },
      { titulo: 'Anexos.zip', tipoDocumentoNome: 'Outros Documentos', url: 'https://pncp/a2' },
      { titulo: 'Ata da sessão', tipoDocumentoNome: 'Ata', url: 'https://pncp/a3' },
    ]
    const prep = await prepararDocumentos(CONTROLE, pncp(arquivos, { 'https://pncp/a1': pdf(EDITAL), 'https://pncp/a2': new TextEncoder().encode('PK\u0003\u0004zip') }) as typeof fetch)
    expect(prep.objeto).toBe('Aquisição de material de limpeza')
    expect(prep.documentos).toHaveLength(2)
    expect(prep.documentos[0]).toMatchObject({ id: 'D1', lido: true, paginas: 2 })
    expect(prep.documentos[1]).toMatchObject({ lido: false })
    expect(prep.documentos[1].aviso).toMatch(/ZIP/)
    expect(prep.blocos[0].type).toBe('text')
  })

  it('manda o PDF escaneado inteiro para a IA ler as imagens', async () => {
    const prep = await prepararDocumentos(CONTROLE, pncp([{ titulo: 'Edital', tipoDocumentoNome: 'Edital', url: 'https://pncp/e' }], { 'https://pncp/e': pdf(['']) }) as typeof fetch)
    expect(prep.documentos[0]).toMatchObject({ escaneado: true, lido: true })
    expect(prep.blocos.some((b: { type: string }) => b.type === 'document')).toBe(true)
  })

  it('recusa compra sem arquivos e número de controle inválido', async () => {
    await expect(prepararDocumentos(CONTROLE, pncp([], {}) as typeof fetch)).rejects.toMatchObject({ status: 404 })
    await expect(prepararDocumentos('123', pncp([], {}) as typeof fetch)).rejects.toMatchObject({ status: 400 })
  })
})

describe('conferência dos trechos citados', () => {
  it('confirma só o que está no documento, sem ligar para acentos e espaços', () => {
    const docs = [{ id: 'D1', texto: '[Página 1]\nA sessão pública será realizada em 05/12/2026 às 09:00 horas.' }, { id: 'D2', escaneado: true }]
    const r = conferirTrechos({
      resumo: 'x',
      datas: [
        { evento: 'Sessão', data: '05/12/2026 09:00', trecho: { texto: 'sessao publica sera  realizada em 05/12/2026', documento: 'D1', pagina: 1 } },
        { evento: 'Inventada', data: '01/01/2027', trecho: { texto: 'prazo de impugnação até 01/01/2027', documento: 'D1', pagina: 1 } },
        { evento: 'Escaneado', data: '?', trecho: { texto: 'qualquer coisa escrita aqui', documento: 'D2', pagina: null } },
      ],
      habilitacao: [], proposta: [], participacao: [], riscos: [],
    }, docs)
    expect(r.datas.map((d: { trecho: { conferido: boolean | null } }) => d.trecho.conferido)).toEqual([true, false, null])
    expect(reduzir('Á b-c')).toBe('abc')
  })
})

describe('rota do Leitor de editais', () => {
  afterEach(() => { vi.unstubAllEnvs(); limparProtecoes() })
  const ambiente = () => {
    vi.stubEnv('SUPABASE_URL', 'https://db.exemplo'); vi.stubEnv('SUPABASE_ANON_KEY', 'anon'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'servico')
    vi.stubEnv('ANTHROPIC_API_KEY', 'chave'); vi.stubEnv('IA_LEITOR_LIMITE_MENSAL', '2')
  }
  const req = (method: string, query: Record<string, string> = {}) => ({ method, headers: { authorization: 'Bearer token' }, query: { agente: 'leitor', org: ORG, controle: CONTROLE, ...query } })

  function banco({ modulo = 'liberado', guardada = null as unknown, usadas = 0 } = {}) {
    const gravados: { url: string; corpo: unknown }[] = []
    const base = pncp([{ titulo: 'Edital', tipoDocumentoNome: 'Edital', url: 'https://pncp/a1' }], { 'https://pncp/a1': pdf(EDITAL) })
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/v1/user')) return json({ id: USER })
      if (url.endsWith('/rpc/modulos_da_org')) return json({ agentes: modulo })
      if (url.includes('/rest/v1/ia_uso?')) return json([], 200, { 'content-range': `0-0/${usadas}` })
      if (url.includes('/rest/v1/ia_leituras_edital?controle=')) return json(guardada ? [guardada] : [])
      if (init?.method === 'POST' && url.includes('/rest/v1/')) { gravados.push({ url, corpo: JSON.parse(String(init.body)) }); return json(url.includes('ia_leituras') ? [{ ...JSON.parse(String(init.body)), created_at: '2026-11-21T10:00:00Z' }] : null, 201) }
      return base(url)
    })
    return { fetcher, gravados }
  }
  const parsed = {
    resumo: 'Pregão para material de limpeza.',
    datas: [{ evento: 'Sessão pública', data: '05/12/2026 09:00', trecho: { texto: 'A sessao publica sera realizada em 05/12/2026 as 09:00 horas', documento: 'D1', pagina: 1 } }],
    habilitacao: [{ categoria: 'economico_financeira', exigencia: 'Balanço', detalhe: 'ILG > 1', trecho: { texto: 'balanco patrimonial com indice de liquidez geral maior que 1', documento: 'D1', pagina: 2 } }],
    proposta: [], participacao: [], riscos: [],
  }
  const cliente = () => ({ beta: { messages: { parse: vi.fn(async () => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', parsed_output: parsed, usage: { input_tokens: 1000, output_tokens: 500 } })) } } })

  it('exige login, organização, controle e módulo liberado', async () => {
    ambiente()
    const { fetcher } = banco({ modulo: 'em_breve' })
    const handler = criarHandler({ fetcher: fetcher as unknown as typeof fetch, cliente: cliente() })
    let r = resposta(); await handler({ method: 'POST', headers: {}, query: {} }, r); expect(r.status).toHaveBeenCalledWith(401)
    r = resposta(); await handler(req('POST', { controle: 'abc' }), r); expect(r.status).toHaveBeenCalledWith(400)
    r = resposta(); await handler(req('POST', { agente: 'outro' }), r); expect(r.status).toHaveBeenCalledWith(400)
    r = resposta(); await handler(req('POST'), r); expect(r.status).toHaveBeenCalledWith(403)
  })

  it('lê o edital com a IA, confere os trechos, guarda e registra o consumo', async () => {
    ambiente()
    const { fetcher, gravados } = banco()
    const c = cliente()
    const handler = criarHandler({ fetcher: fetcher as unknown as typeof fetch, cliente: c })
    const r = resposta(); await handler(req('POST'), r)
    expect(r.status).toHaveBeenCalledWith(200)
    const corpo = r.json.mock.calls[0][0]
    expect(corpo.leitura.resultado.datas[0].trecho.conferido).toBe(true)
    expect(corpo.leitura.resultado.habilitacao[0].trecho.conferido).toBe(true)
    expect(corpo.leitura.documentos[0].texto).toBeUndefined()
    expect(corpo.uso).toEqual({ usadas: 1, limite: 2 })
    const chamada = c.beta.messages.parse.mock.calls[0] as unknown as [Record<string, unknown>]
    expect(chamada[0]).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] })
    const uso = gravados.find((g) => g.url.includes('ia_uso'))!.corpo as Record<string, unknown>
    expect(uso).toMatchObject({ org_id: ORG, user_id: USER, nova: true, tokens_entrada: 1000, tokens_saida: 500, custo_usd: 0.014 })
  })

  it('reaproveita a leitura guardada sem chamar a IA nem contar no limite', async () => {
    ambiente()
    const { fetcher, gravados } = banco({ guardada: { controle: CONTROLE, objeto: 'x', resultado: parsed, documentos: [], modelo: 'claude-opus-5-5', created_at: '2026-11-20T10:00:00Z' }, usadas: 2 })
    const c = cliente()
    const r = resposta(); await criarHandler({ fetcher: fetcher as unknown as typeof fetch, cliente: c })(req('POST'), r)
    expect(r.status).toHaveBeenCalledWith(200)
    expect(r.json.mock.calls[0][0].reaproveitada).toBe(true)
    expect(c.beta.messages.parse).not.toHaveBeenCalled()
    expect(gravados[0].corpo).toMatchObject({ nova: false, custo_usd: 0 })
  })

  it('respeita o limite mensal de leituras novas', async () => {
    ambiente()
    const { fetcher } = banco({ usadas: 2 })
    const c = cliente()
    const r = resposta(); await criarHandler({ fetcher: fetcher as unknown as typeof fetch, cliente: c })(req('POST'), r)
    expect(r.status).toHaveBeenCalledWith(429)
    expect(c.beta.messages.parse).not.toHaveBeenCalled()
  })

  it('GET devolve a leitura guardada (ou null) e o consumo do mês', async () => {
    ambiente()
    const { fetcher } = banco({ usadas: 1 })
    const r = resposta(); await criarHandler({ fetcher: fetcher as unknown as typeof fetch })(req('GET'), r)
    expect(r.json.mock.calls[0][0]).toEqual({ leitura: null, uso: { usadas: 1, limite: 2 } })
  })

  it('sem a chave da IA no servidor avisa que o agente não foi ativado', async () => {
    ambiente(); vi.stubEnv('ANTHROPIC_API_KEY', '')
    const { fetcher } = banco()
    const r = resposta(); await criarHandler({ fetcher: fetcher as unknown as typeof fetch })(req('POST'), r)
    expect(r.status).toHaveBeenCalledWith(503)
  })
})
