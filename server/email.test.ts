import { afterEach, describe, expect, it, vi } from 'vitest'
import { cifrar } from './asaas.js'
import { emailAcessoLiberado, enviarEmail, montarSmtp } from './email.js'

const env = { SUPABASE_SERVICE_ROLE_KEY: 'privada' }
const linha = () => ({ ativo: true, boas_vindas: true, host: 'smtp.gmail.com', porta: 465, usuario: 'a@b.com', senha_cifrada: cifrar('segredo', env), remetente_nome: 'Licita"Force', remetente_email: 'a@b.com' })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); vi.doUnmock('./email.js') })

describe('e-mail da plataforma', () => {
  it('monta o SMTP com a senha decifrada e remetente sem aspas', () => {
    const c = montarSmtp(linha(), env)!
    expect(c.senha).toBe('segredo')
    expect(c.nome).toBe('LicitaForce'); expect(c.endereco).toBe('a@b.com')
    expect(montarSmtp({ ...linha(), senha_cifrada: null }, env)).toBeNull()
  })
  it('usa TLS direto na porta 465', async () => {
    const sendMail = vi.fn().mockResolvedValue({}); const criar = vi.fn(() => ({ sendMail }))
    await enviarEmail(montarSmtp(linha(), env)!, { para: 'c@d.com', assunto: 'x', html: '<p/>', texto: 'x' }, criar as never)
    expect(criar.mock.calls[0][0]).toMatchObject({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: 'a@b.com', pass: 'segredo' } })
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'c@d.com', from: { name: 'LicitaForce', address: 'a@b.com' } }))
  })
  it('escapa os dados do cliente no HTML', () => {
    const e = emailAcessoLiberado({ nome: '<b>Ana</b>', organizacao: 'X & Y', plano: 'Profissional', ciclo: 'mensal', pago_ate: '2026-12-21' })
    expect(e.html).toContain('&lt;b&gt;Ana')
    expect(e.html).toContain('X &amp; Y')
    expect(e.html).toContain('21/12/2026')
    expect(e.html).toContain('https://licitaforce-app.vercel.app/entrar')
  })
})

describe('webhook: e-mail de acesso liberado', () => {
  function res() { return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() } }
  const tokenLinha = () => [{ webhook_token_cifrado: cifrar('token-certo-1234567890', env) }]
  const reserva = { assinatura: '11111111-1111-1111-1111-111111111111', email: 'cliente@x.com', nome: 'Ana', organizacao: 'Org', plano: 'Profissional', ciclo: 'mensal', pago_ate: '2026-12-21' }
  async function rodar(enviar: ReturnType<typeof vi.fn>, respostas: Response[]) {
    vi.stubEnv('SUPABASE_URL', 'https://teste.supabase.co'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'privada')
    vi.doMock('./email.js', async (orig) => ({ ...(await orig<typeof import('./email.js')>()), enviarEmail: enviar }))
    const fetch = vi.fn(); for (const r of respostas) fetch.mockResolvedValueOnce(r)
    fetch.mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetch)
    const { default: handler } = await import('../api/asaas-webhook.js')
    const r = res()
    await handler({ method: 'POST', headers: { 'asaas-access-token': 'token-certo-1234567890' }, body: { id: 'evt_9', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_9' } } }, r)
    return { r, fetch }
  }
  it('envia ao cliente no primeiro pagamento', async () => {
    const enviar = vi.fn().mockResolvedValue({})
    const { r } = await rodar(enviar, [Response.json(tokenLinha()), Response.json([{ id: 'evt_9' }]), Response.json('acesso liberado'), Response.json(reserva), Response.json([linha()])])
    expect(enviar).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.gmail.com' }), expect.objectContaining({ para: 'cliente@x.com' }))
    expect(r.json).toHaveBeenCalledWith({ recebido: true, resultado: 'acesso liberado; e-mail enviado' })
  })
  it('sem reserva (já enviado ou desligado) não envia', async () => {
    const enviar = vi.fn()
    const { r } = await rodar(enviar, [Response.json(tokenLinha()), Response.json([{ id: 'evt_9' }]), Response.json('acesso liberado'), Response.json(null)])
    expect(enviar).not.toHaveBeenCalled()
    expect(r.json).toHaveBeenCalledWith({ recebido: true, resultado: 'acesso liberado' })
  })
  it('falha no SMTP não derruba o webhook e libera nova tentativa', async () => {
    const enviar = vi.fn().mockRejectedValue(new Error('535 auth'))
    const { r, fetch } = await rodar(enviar, [Response.json(tokenLinha()), Response.json([{ id: 'evt_9' }]), Response.json('acesso liberado'), Response.json(reserva), Response.json([linha()])])
    expect(r.json).toHaveBeenCalledWith({ recebido: true, resultado: 'acesso liberado; e-mail falhou' })
    const desfaz = fetch.mock.calls.find(c => String(c[0]).includes('/assinaturas?id=eq.'))
    expect(JSON.parse(desfaz![1].body)).toEqual({ boas_vindas_em: null })
  })
})
