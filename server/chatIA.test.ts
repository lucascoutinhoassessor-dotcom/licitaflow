import { describe, expect, it, vi } from 'vitest'
import { atenderChat, montarContexto } from './chatIA.js'
import { conversarIA } from './iaCliente.js'

const json = (corpo: unknown, status = 200) => new Response(corpo == null ? null : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
const ORG = '00000000-0000-0000-0000-0000000000aa'
const PROC = '00000000-0000-0000-0000-0000000000cc'
function resposta() { const r = { status: vi.fn(() => r), json: vi.fn(() => r) }; return r }

describe('contexto da conta', () => {
  it('lista processos, prazos e o processo aberto com a leitura do edital', () => {
    const t = montarContexto({
      processos: [{ numero: '90012/2026', objeto: 'Papel A4', etapa: 'disputa', orgao_nome: 'UFPR', data_abertura: '2026-12-05T12:00:00Z' }],
      prazos: [{ titulo: 'Enviar proposta ajustada', tipo: 'proposta', data_hora: '2026-12-01T15:00:00Z' }],
      foco: { processo: { numero: '90012/2026', objeto: 'Papel A4', etapa: 'disputa' }, itens: [{ numero_item: 1, descricao: 'Papel A4', quantidade: 100, preco_limite_unit: 20 }], leitura: { resumo: 'Pregão de papel.', riscos: [{ nivel: 'alto', titulo: 'Amostra', detalhe: 'Exige amostra em 2 dias' }] } },
      agora: new Date('2026-11-28T12:00:00Z'),
    })
    expect(t).toContain('Nº 90012/2026')
    expect(t).toContain('Enviar proposta ajustada')
    expect(t).toMatch(/preço-limite R\$\s20,00/)
    expect(t).toContain('Risco (alto): Amostra')
    expect(montarContexto({})).toContain('Nenhum processo')
  })
})

describe('conversa com a IA do cliente', () => {
  it('Claude, ChatGPT e Gemini recebem o histórico com os papéis certos', async () => {
    const f = vi.fn(async (url: string) => url.includes('anthropic') ? json({ content: [{ type: 'text', text: 'Oi C' }], usage: { input_tokens: 5, output_tokens: 2 } })
      : url.includes('openai') ? json({ choices: [{ message: { content: 'Oi O' } }], usage: { prompt_tokens: 5, completion_tokens: 2 } })
        : json({ candidates: [{ content: { parts: [{ text: 'Oi G' }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 } }))
    const mensagens = [{ papel: 'usuario', texto: 'a' }, { papel: 'ia', texto: 'b' }, { papel: 'usuario', texto: 'c' }]
    const base = { chave: 'k', sistema: 'S', mensagens, fetcher: f as unknown as typeof fetch }
    expect((await conversarIA({ provedor: 'anthropic', modelo: 'claude-opus-5-5', ...base })).texto).toBe('Oi C')
    expect((await conversarIA({ provedor: 'openai', modelo: 'gpt-5', ...base })).texto).toBe('Oi O')
    expect((await conversarIA({ provedor: 'google', modelo: 'gemini-2.5-pro', ...base })).texto).toBe('Oi G')
    const corpo = (i: number) => JSON.parse(String(((f.mock.calls[i] as unknown[])[1] as RequestInit).body))
    expect(corpo(0).messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(corpo(0).system).toBe('S')
    expect(corpo(1).messages[0]).toEqual({ role: 'system', content: 'S' })
    expect(corpo(2).contents.map((m: { role: string }) => m.role)).toEqual(['user', 'model', 'user'])
  })
})

describe('rota do chat', () => {
  const montar = () => {
    const gravados: Record<string, unknown>[] = []
    const banco = vi.fn(async (caminho: string, o: { corpo?: Record<string, unknown> } = {}) => {
      if (caminho.startsWith('ia_leituras_edital')) return json([{ resultado: { resumo: 'Edital de papel', riscos: [] } }])
      if (caminho.startsWith('ia_uso')) { gravados.push(o.corpo!); return json(null, 201) }
      return json([])
    })
    const comoUsuario = vi.fn(async (caminho: string) => {
      if (caminho.startsWith('processos?id=')) return json([{ numero: '90012/2026', objeto: 'Papel', etapa: 'disputa', pncp_controle: '12345678000190-1-000001/2026' }])
      if (caminho.startsWith('processos?')) return json([{ numero: '1/2026', objeto: 'Caneta', etapa: 'analise' }])
      return json([])
    })
    const ia = vi.fn(async () => json({ choices: [{ message: { content: 'Seu próximo prazo é **amanhã**.' } }], usage: { prompt_tokens: 100, completion_tokens: 10 } }))
    return { gravados, banco, comoUsuario, ia }
  }
  const propria = { provedor: 'openai', modelo: 'gpt-5', chave: 'sk-x' }

  it('sem a IA do cliente pede para ligar', async () => {
    const t = montar(); const res = resposta()
    await atenderChat({ req: { method: 'POST', body: { mensagens: [{ papel: 'usuario', texto: 'oi' }] } }, res, org: ORG, usuario: 'u', banco: t.banco, comoUsuario: t.comoUsuario, propria: null })
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('responde com o contexto da conta e do processo aberto, sem custo para o LicitaForce', async () => {
    const t = montar(); const res = resposta()
    await atenderChat({ req: { method: 'POST', body: { mensagens: [{ papel: 'usuario', texto: 'Quais os riscos deste edital?' }], processo_id: PROC } }, res, org: ORG, usuario: 'u1', banco: t.banco, comoUsuario: t.comoUsuario, propria, fetcher: t.ia as unknown as typeof fetch })
    expect(res.status).toHaveBeenCalledWith(200)
    expect((res.json.mock.calls[0] as unknown[])[0]).toMatchObject({ texto: 'Seu próximo prazo é **amanhã**.', ia: 'openai', usou_processo: true })
    const sistema = JSON.parse(String(((t.ia.mock.calls[0] as unknown[])[1] as RequestInit).body)).messages[0].content
    expect(sistema).toContain('<conta>')
    expect(sistema).toContain('Caneta')
    expect(sistema).toContain('Edital de papel')
    expect(t.gravados[0]).toMatchObject({ agente: 'chat-ia', provedor: 'openai', custo_usd: 0 })
    // Leituras da conta com o login do cliente (RLS), sempre filtradas pela organização.
    expect(t.comoUsuario.mock.calls.every((c) => String((c as unknown[])[0]).includes(`org_id=eq.${ORG}`) || String((c as unknown[])[0]).startsWith('processo_itens'))).toBe(true)
  })

  it('recusa conversa vazia ou terminando com a IA', async () => {
    const t = montar(); const res = resposta()
    await atenderChat({ req: { method: 'POST', body: { mensagens: [{ papel: 'ia', texto: 'oi' }] } }, res, org: ORG, usuario: 'u2', banco: t.banco, comoUsuario: t.comoUsuario, propria })
    expect(res.status).toHaveBeenCalledWith(400)
  })
})
