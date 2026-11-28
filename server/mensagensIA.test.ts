import { afterEach, describe, expect, it, vi } from 'vitest'
import { previaMensagens, redigirMensagem } from './mensagensIA.js'
import { criarHandler } from './push.js'

function clienteFalso(respostas: Record<string, unknown>) {
  const pedidos: any[] = []
  return {
    pedidos,
    beta: { messages: { parse: vi.fn(async (p: any) => {
      pedidos.push(p)
      const nome = /Cliente: (.*)/.exec(p.messages[0].content)?.[1] ?? ''
      return { stop_reason: 'end_turn', parsed_output: respostas[nome], usage: { input_tokens: 1000, output_tokens: 100 } }
    }) } },
  }
}

describe('mensagens da IA pedidas pelo master', () => {
  it('redige com Haiku a partir da análise do cliente e limita o link às telas do app', async () => {
    const cliente = clienteFalso({ 'Papelaria Ana': { enviar: true, titulo: ' Disputa amanhã ', texto: 'Confira a proposta do pregão de papel A4 antes das 9h.', link: 'https://fora.exemplo' } })
    const r = await redigirMensagem({ instrucao: 'Lembre quem tem disputa amanhã', nome: 'Papelaria Ana', analise: { disputas_amanha: [{ objeto: 'Papel A4', hora: '09:00' }] }, cliente: cliente as any })
    expect(r).toMatchObject({ enviar: true, titulo: 'Disputa amanhã', link: '/app' })
    expect(cliente.pedidos[0].model).toBe('claude-haiku-5-5')
    expect(cliente.pedidos[0].messages[0].content).toContain('Papel A4')
  })

  it('pula clientes a quem a instrução não se aplica e soma o custo', async () => {
    const cliente = clienteFalso({
      'Papelaria Ana': { enviar: true, titulo: 'Disputa amanhã', texto: 'Confira a proposta.', link: '/app/processos' },
      'Beto Obras': { enviar: false, titulo: '', texto: '', link: '/app' },
    })
    const r = await previaMensagens({ instrucao: 'Lembre quem tem disputa amanhã', analises: [
      { org_id: 'a', nome: 'Papelaria Ana', analise: {} }, { org_id: 'b', nome: 'Beto Obras', analise: {} },
    ], cliente: cliente as any })
    expect(r.itens).toEqual([
      { org_id: 'a', nome: 'Papelaria Ana', enviar: true, titulo: 'Disputa amanhã', texto: 'Confira a proposta.', link: '/app/processos' },
      { org_id: 'b', nome: 'Beto Obras', enviar: false },
    ])
    expect(r.custo_usd).toBeGreaterThan(0)
  })
})

describe('ação ia_previa do api/push', () => {
  const env = { ...process.env }
  afterEach(() => { process.env = { ...env } })

  function chamar(handler: any, body: unknown, admin = true) {
    const fetcher = vi.fn(async (url: string) => {
      const json = url.endsWith('/auth/v1/user') ? { id: 'u1' } : url.includes('is_platform_admin') ? admin
        : url.includes('admin_mensagens_ia_analises') ? [{ org_id: 'a', nome: 'Papelaria Ana', analise: {} }] : null
      return new Response(JSON.stringify(json), { status: 200 })
    })
    const res: any = { status(c: number) { this.code = c; return this }, json(j: unknown) { this.body = j; return this }, setHeader() {} }
    return criarHandler({ fetcher: fetcher as any, ...handler }).call(null, { method: 'POST', headers: { authorization: 'Bearer t' }, body }, res).then(() => res)
  }

  it('só o master usa, e sem chave da IA explica que os modelos prontos continuam', async () => {
    process.env.SUPABASE_URL = 'https://db.exemplo'; process.env.SUPABASE_ANON_KEY = 'a'; process.env.SUPABASE_SERVICE_ROLE_KEY = 's'
    delete process.env.ANTHROPIC_API_KEY
    expect((await chamar({}, { acao: 'ia_previa', instrucao: 'Lembre quem tem disputa' }, false)).code).toBe(403)
    const semChave = await chamar({}, { acao: 'ia_previa', instrucao: 'Lembre quem tem disputa' })
    expect(semChave.code).toBe(503)
    expect(semChave.body.error).toMatch(/modelos prontos/)
    expect((await chamar({}, { acao: 'ia_previa', instrucao: 'x' })).code).toBe(400)
    const ok = await chamar({ redigir: async ({ analises }: any) => ({ itens: analises.map((a: any) => ({ ...a, enviar: true })), custo_usd: 0 }) }, { acao: 'ia_previa', instrucao: 'Lembre quem tem disputa', orgs: null })
    expect(ok.code).toBe(200)
    expect(ok.body.itens[0].nome).toBe('Papelaria Ana')
  })
})
