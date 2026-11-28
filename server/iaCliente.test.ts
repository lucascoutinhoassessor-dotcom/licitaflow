import { describe, expect, it, vi } from 'vitest'
import { atenderChave, chaveAtiva, cifrar, criarClienteIA, decifrar, testarChave } from './iaCliente.js'
import { atenderJuridico } from './juridicoIA.js'

const json = (corpo: unknown, status = 200) => new Response(corpo == null ? null : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
const SEGREDO = 'chave-de-servico-de-teste'
const ORG = '00000000-0000-0000-0000-0000000000aa'
const USER = '00000000-0000-0000-0000-0000000000bb'

function resposta() {
  const r = { status: vi.fn(() => r), json: vi.fn(() => r) }
  return r
}

describe('cifra da chave', () => {
  it('cifra e decifra; a chave não aparece no texto cifrado', () => {
    const c = cifrar('sk-ant-abcdefghijklmnopqrstuvwxyz', SEGREDO)
    expect(c.startsWith('v1.')).toBe(true)
    expect(c).not.toContain('abcdefghij')
    expect(decifrar(c, SEGREDO)).toBe('sk-ant-abcdefghijklmnopqrstuvwxyz')
    expect(cifrar('x'.repeat(30), SEGREDO)).not.toBe(cifrar('x'.repeat(30), SEGREDO))
  })
  it('recusa texto alterado ou outro segredo', () => {
    const c = cifrar('sk-teste-1234567890abcdefghij', SEGREDO)
    expect(() => decifrar(c, 'outro-segredo')).toThrow()
    expect(() => decifrar(c.slice(0, -4) + 'AAAA', SEGREDO)).toThrow()
  })
})

describe('provedores', () => {
  it('testa a chave sem gastar tokens e traduz a recusa', async () => {
    const ok = vi.fn(async () => json({ data: [] }))
    await expect(testarChave({ provedor: 'openai', chave: 'sk-x', fetcher: ok as unknown as typeof fetch })).resolves.toBe(true)
    expect(String((ok.mock.calls[0] as unknown[])[0])).toBe('https://api.openai.com/v1/models')
    const recusa = vi.fn(async () => json({ error: {} }, 401))
    await expect(testarChave({ provedor: 'google', chave: 'x', fetcher: recusa as unknown as typeof fetch })).rejects.toMatchObject({ status: 400 })
  })

  it('ChatGPT recebe o pedido convertido (texto e PDF) e devolve no formato do SDK da Anthropic', async () => {
    const fetcher = vi.fn(async () => json({ model: 'gpt-5', choices: [{ finish_reason: 'stop', message: { content: '{"fatos":"F"}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }))
    const c = criarClienteIA({ provedor: 'openai', chave: 'sk-x', modelo: 'gpt-5', fetcher: fetcher as unknown as typeof fetch })
    const r = await c.beta.messages.parse({ model: 'claude-opus-5-5', max_tokens: 100, system: 'Regras', output_config: { format: { schema: { type: 'object', properties: { fatos: { type: 'string' } } } } },
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Olá' }, { type: 'document', title: 'Edital', source: { type: 'base64', media_type: 'application/pdf', data: 'QUJD' } }] }] })
    expect(r).toMatchObject({ stop_reason: 'end_turn', parsed_output: { fatos: 'F' }, usage: { input_tokens: 10, output_tokens: 5 } })
    const corpo = JSON.parse(String(((fetcher.mock.calls[0] as unknown[])[1] as RequestInit).body))
    expect(corpo.model).toBe('gpt-5')
    expect(corpo.messages[0].content).toContain('JSON Schema')
    expect(corpo.messages[1].content[1]).toMatchObject({ type: 'file', file: { file_data: 'data:application/pdf;base64,QUJD' } })
  })

  it('Gemini recebe o pedido convertido e o corte por tamanho vira max_tokens', async () => {
    const fetcher = vi.fn(async () => json({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '```json\n{"a":1}\n```' }] } }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2 } }))
    const c = criarClienteIA({ provedor: 'google', chave: 'AIzaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', modelo: 'gemini-2.5-pro', fetcher: fetcher as unknown as typeof fetch })
    const r = await c.beta.messages.parse({ max_tokens: 50, system: 'S', output_config: { format: { schema: { type: 'object' } } }, messages: [{ role: 'user', content: 'Oi' }] })
    expect(r).toMatchObject({ stop_reason: 'max_tokens', parsed_output: { a: 1 } })
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/models/gemini-2.5-pro:generateContent')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toMatch(/^AIza/)
  })

  it('crédito esgotado na conta do cliente vira aviso claro', async () => {
    const fetcher = vi.fn(async () => json({ error: { message: 'quota' } }, 429))
    const c = criarClienteIA({ provedor: 'openai', chave: 'sk-x', modelo: 'gpt-5', fetcher: fetcher as unknown as typeof fetch })
    await expect(c.beta.messages.parse({ max_tokens: 10, messages: [{ role: 'user', content: 'x' }] })).rejects.toMatchObject({ status: 429 })
  })
})

describe('cadastro da chave (rota)', () => {
  function banco(papel: string) {
    const gravados: { url: string; metodo: string; corpo: unknown }[] = []
    const fn = vi.fn(async (caminho: string, o: { metodo?: string; corpo?: unknown } = {}) => {
      if (caminho.startsWith('memberships?')) return json([{ papel }])
      gravados.push({ url: caminho, metodo: o.metodo ?? 'GET', corpo: o.corpo })
      return json(null, 201)
    })
    return { fn, gravados }
  }
  const req = (corpo: unknown) => ({ method: 'POST', body: corpo })
  const provedorOk = vi.fn(async () => json({ data: [] }))

  it('membro comum não cadastra', async () => {
    const b = banco('membro'); const res = resposta()
    await atenderChave({ req: req({ provedor: 'openai', chave: 'sk-proj-abcdefghijklmnopqrstuvwxyz' }), res, org: ORG, usuario: USER, banco: b.fn, segredo: SEGREDO, fetcher: provedorOk as unknown as typeof fetch })
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('recusa texto que não parece chave do provedor', async () => {
    const b = banco('owner'); const res = resposta()
    await atenderChave({ req: req({ provedor: 'anthropic', chave: 'minha senha' }), res, org: ORG, usuario: USER, banco: b.fn, segredo: SEGREDO, fetcher: provedorOk as unknown as typeof fetch })
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('dono cadastra: testa no provedor, guarda cifrada e ativa', async () => {
    const b = banco('owner'); const res = resposta()
    await atenderChave({ req: req({ provedor: 'openai', chave: 'sk-proj-abcdefghijklmnopqrstuvwxyz' }), res, org: ORG, usuario: USER, banco: b.fn, segredo: SEGREDO, fetcher: provedorOk as unknown as typeof fetch })
    expect(res.status).toHaveBeenCalledWith(200)
    const salvo = b.gravados.find((g) => g.url.startsWith('ia_chaves_cliente?on_conflict'))!.corpo as Record<string, unknown>
    expect(salvo).toMatchObject({ provedor: 'openai', modelo: 'gpt-5', final: 'wxyz', ativa: true })
    expect(String(salvo.cifrada)).not.toContain('abcdefghij')
    expect(decifrar(String(salvo.cifrada), SEGREDO)).toBe('sk-proj-abcdefghijklmnopqrstuvwxyz')
    expect(b.gravados[0]).toMatchObject({ metodo: 'PATCH', corpo: { ativa: false } })
  })

  it('lê a chave ativa decifrada para o servidor', async () => {
    const cifrada = cifrar('sk-proj-abcdefghijklmnopqrstuvwxyz', SEGREDO)
    const b = vi.fn(async () => json([{ provedor: 'openai', modelo: 'gpt-5', cifrada }]))
    await expect(chaveAtiva({ banco: b, org: ORG, segredo: SEGREDO })).resolves.toEqual({ provedor: 'openai', modelo: 'gpt-5', chave: 'sk-proj-abcdefghijklmnopqrstuvwxyz' })
    const vazio = vi.fn(async () => json([]))
    await expect(chaveAtiva({ banco: vazio, org: ORG, segredo: SEGREDO })).resolves.toBeNull()
  })
})

describe('Jurídico com a IA do cliente', () => {
  it('não aplica o limite do plano e registra o uso sem custo para o LicitaForce', async () => {
    const gravados: Record<string, unknown>[] = []
    const banco = vi.fn(async (caminho: string, o: { corpo?: Record<string, unknown> } = {}) => {
      if (caminho.startsWith('rpc/ia_limite_e_uso')) return json({ limite: 0, origem: 'plano', usadas: 0 })
      if (caminho.startsWith('ia_uso')) { gravados.push(o.corpo!); return json(null, 201) }
      return json([])
    })
    const comoUsuario = vi.fn(async () => json([]))
    const peca = { fatos: 'F', argumentos: 'A', pedidos: 'P', perguntas: '', pontos_de_atencao: ['Conferir datas'] }
    const cliente = { beta: { messages: { parse: vi.fn(async () => ({ stop_reason: 'end_turn', model: 'gpt-5', parsed_output: peca, usage: { input_tokens: 100, output_tokens: 50 } })) } } }
    const res = resposta()
    await atenderJuridico({ req: { method: 'POST', body: { tipo: 'impugnacao', dados: { fatos: 'Exigência ilegal' }, teses: [] } }, res, org: ORG, usuario: USER + '9', banco, comoUsuario,
      env: {}, cliente, modelo: { modelo: 'claude-opus-5-5', entrada: 4, saida: 20 }, propria: { provedor: 'openai', modelo: 'gpt-5', chave: 'sk-x' } })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(gravados[0]).toMatchObject({ provedor: 'openai', custo_usd: 0, agente: 'juridico' })
    expect((res.json.mock.calls[0] as unknown[])[0]).toMatchObject({ ia: 'openai' })
  })
})
