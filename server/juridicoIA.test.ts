import { afterEach, describe, expect, it, vi } from 'vitest'
import { ESQUEMA_PECA, montarPedido, termoReferencias } from './juridicoIA.js'
import { criarHandler } from './agentes.js'
import { limparProtecoes } from './protecao.js'

const ORG = '33333333-3333-3333-3333-333333333333'
const USER = '11111111-1111-1111-1111-111111111111'
const PROC = '44444444-4444-4444-4444-444444444444'
const CONTROLE = '11222333000144-1-000045/2026'
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
const resposta = () => ({ setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() })

describe('pedido do Jurídico com IA', () => {
  it('junta relato, teses, riscos do edital e referências sem copiar', () => {
    const t = montarPedido({
      tipo: 'impugnacao',
      dados: { orgao: 'Prefeitura de X', modalidade: 'Pregão eletrônico', numero: '45/2026', itens: 'item 9.4', fatos: 'Exige atestado de 100% do quantitativo.' },
      teses: [{ rotulo: 'Atestado com quantitativo excessivo', texto: 'A exigência deve se restringir...' }],
      leitura: { riscos: [{ nivel: 'alto', titulo: 'Atestado acima de 50%', detalhe: 'Item 9.4', trecho: { texto: 'atestado de capacidade técnica de 100%', documento: 'D1', pagina: 12 } }], habilitacao: [{ exigencia: 'Atestado', detalhe: '100%' }] },
      referencias: [{ titulo: 'Impugnação', item: null, trecho: 'a exigência de atestado restringe a competitividade' }],
    })
    expect(t).toContain('Peça: Impugnação ao edital.')
    expect(t).toContain('Modalidade e número: Pregão eletrônico nº 45/2026')
    expect(t).toContain('O que o cliente relata:\nExige atestado de 100% do quantitativo.')
    expect(t).toContain('[alto] Atestado acima de 50%')
    expect(t).toContain('pág. 12')
    expect(t).toContain('só como inspiração; não copie')
  })

  it('pede os campos da peça e os pontos de atenção', () => {
    expect(ESQUEMA_PECA.required).toEqual(['fatos', 'argumentos', 'pedidos', 'perguntas', 'pontos_de_atencao'])
  })

  it('monta o termo de busca das peças de referência', () => {
    expect(termoReferencias([{ rotulo: 'Atestado com quantitativo excessivo', texto: '' }], { itens: 'item 9' })).toBe('atestado;quantitativo;excessivo')
    expect(termoReferencias([], {})).toBe('')
  })
})

describe('rota do Jurídico com IA', () => {
  afterEach(() => { vi.unstubAllEnvs(); limparProtecoes() })
  const ambiente = () => { vi.stubEnv('SUPABASE_URL', 'https://db.exemplo'); vi.stubEnv('SUPABASE_ANON_KEY', 'anon'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'servico'); vi.stubEnv('ANTHROPIC_API_KEY', 'chave') }
  const req = (body: unknown) => ({ method: 'POST', headers: { authorization: 'Bearer token' }, query: { agente: 'juridico', org: ORG }, body })
  const peca = { fatos: 'Fatos.', argumentos: 'DA RESTRIÇÃO\nTexto.', pedidos: 'a) retificar o edital.', perguntas: '', pontos_de_atencao: ['Conferir o item 9.4 [COMPLETAR]'] }
  const cliente = () => ({ beta: { messages: { parse: vi.fn(async () => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', parsed_output: peca, usage: { input_tokens: 10000, output_tokens: 2000 } })) } } })

  function banco({ limite = 5 as number | null, usadas = 0 } = {}) {
    const gravados: { url: string; corpo: unknown }[] = []
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/v1/user')) return json({ id: USER })
      if (url.endsWith('/rpc/modulos_da_org')) return json({ agentes: 'liberado' })
      if (url.endsWith('/rpc/ia_limite_e_uso')) return json({ limite, origem: 'plano', usadas })
      if (url.includes('/rest/v1/processos?')) return json([{ pncp_controle: CONTROLE }])
      if (url.includes('/rest/v1/ia_leituras_edital?')) return json([{ resultado: { riscos: [{ nivel: 'alto', titulo: 'Atestado', detalhe: 'x', trecho: { texto: 'atestado 100%' } }] } }])
      if (url.endsWith('/rpc/buscar_pecas')) return json({ data: [{ titulo: 'Impugnação', trecho: 'restrição à competitividade' }] })
      if (init?.method === 'POST' && url.includes('/rest/v1/ia_uso')) { gravados.push({ url, corpo: JSON.parse(String(init.body)) }); return json(null, 201) }
      return json(null, 404)
    })
    return { fetcher, gravados }
  }
  const corpo = { tipo: 'impugnacao', processo_id: PROC, dados: { fatos: 'Exige atestado de 100%.' }, teses: [{ rotulo: 'Atestado com quantitativo excessivo', texto: 'A exigência…' }] }

  it('redige com o Opus, usa a leitura do edital e registra o custo', async () => {
    ambiente()
    const { fetcher, gravados } = banco()
    const c = cliente()
    const r = resposta()
    await criarHandler({ fetcher: fetcher as unknown as typeof fetch, cliente: c })(req(corpo), r)
    expect(r.status).toHaveBeenCalledWith(200)
    expect(r.json.mock.calls[0][0]).toMatchObject({ peca: { argumentos: 'DA RESTRIÇÃO\nTexto.' }, usou_leitura: true, referencias: 1, uso: { usadas: 1, limite: 5 } })
    const chamada = c.beta.messages.parse.mock.calls[0] as unknown as [{ model: string; messages: { content: string }[] }]
    expect(chamada[0].model).toBe('claude-opus-5-5')
    expect(chamada[0].messages[0].content).toContain('atestado 100%')
    expect(gravados[0].corpo).toMatchObject({ org_id: ORG, agente: 'juridico', nova: true, custo_usd: 0.08 })
  })

  it('respeita o plano: fora do plano, limite do mês e tipo inválido', async () => {
    ambiente()
    let r = resposta(); await criarHandler({ fetcher: banco({ limite: 0 }).fetcher as unknown as typeof fetch, cliente: cliente() })(req(corpo), r)
    expect(r.status).toHaveBeenCalledWith(403)
    r = resposta(); await criarHandler({ fetcher: banco({ limite: 5, usadas: 5 }).fetcher as unknown as typeof fetch, cliente: cliente() })(req(corpo), r)
    expect(r.status).toHaveBeenCalledWith(429)
    r = resposta(); await criarHandler({ fetcher: banco().fetcher as unknown as typeof fetch, cliente: cliente() })(req({ ...corpo, tipo: 'parecer' }), r)
    expect(r.status).toHaveBeenCalledWith(400)
    r = resposta(); await criarHandler({ fetcher: banco().fetcher as unknown as typeof fetch, cliente: cliente() })(req({ tipo: 'recurso', dados: {}, teses: [] }), r)
    expect(r.status).toHaveBeenCalledWith(400)
  })

  it('sem a chave da IA avisa que não foi ativado', async () => {
    ambiente(); vi.stubEnv('ANTHROPIC_API_KEY', '')
    const r = resposta()
    await criarHandler({ fetcher: banco().fetcher as unknown as typeof fetch })(req(corpo), r)
    expect(r.status).toHaveBeenCalledWith(503)
  })
})
