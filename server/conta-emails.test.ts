import { afterEach, describe, expect, it, vi } from 'vitest'
import { cifrar } from './asaas.js'

const env = { SUPABASE_URL: 'https://teste.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'privada' }
const smtp = (extra = {}) => [{ ativo: true, host: 'smtp.gmail.com', porta: 465, usuario: 'contato@gmail.com', senha_cifrada: cifrar('segredo', env), remetente_nome: 'LicitaForce', ...extra }]
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.doUnmock('./email.js') })
function res() { return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() } }

async function rodar(body: Record<string, unknown>, rotas: (url: string, init: RequestInit) => Response) {
  const enviar = vi.fn().mockResolvedValue({})
  vi.doMock('./email.js', async (orig) => ({ ...(await orig<typeof import('./email.js')>()), enviarEmail: enviar }))
  const fetch = vi.fn(async (url: string, init: RequestInit) => rotas(String(url), init)); vi.stubGlobal('fetch', fetch)
  const { contaPublica } = await import('./conta-emails.js')
  const r = res()
  await contaPublica(body, { headers: { 'x-forwarded-for': '1.2.3.4' } }, r, env)
  return { r, enviar, fetch }
}

describe('cadastro e senha pelo e-mail da plataforma', () => {
  it('sem SMTP configurado responde sem_smtp (o site usa o Supabase)', async () => {
    const { r, enviar } = await rodar({ acao: 'recuperar_senha', email: 'a@b.com' }, () => Response.json(smtp({ ativo: false })))
    expect(r.status).toHaveBeenCalledWith(503)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'sem_smtp' }))
    expect(enviar).not.toHaveBeenCalled()
  })
  it('esqueci a senha: link do próprio site com token_hash e nome do cliente', async () => {
    const { r, enviar, fetch } = await rodar({ acao: 'recuperar_senha', email: 'Ana@X.com ' }, (u) =>
      u.includes('plataforma_email') ? Response.json(smtp()) : u.includes('registrar_pedido_email') ? Response.json(true)
        : Response.json({ hashed_token: 'abc123', user_metadata: { nome: 'Ana Souza' } }))
    expect(r.json).toHaveBeenCalledWith({ ok: true })
    const gerar = fetch.mock.calls.find(c => String(c[0]).includes('generate_link'))!
    expect(JSON.parse(String(gerar[1].body))).toEqual({ type: 'recovery', email: 'ana@x.com' })
    const [cfg, msg] = enviar.mock.calls[0]
    expect(cfg.nome).toBe('LicitaForce')
    expect(msg.para).toBe('ana@x.com')
    expect(msg.assunto).toBe('Redefinir sua senha do LicitaForce')
    expect(msg.html).toContain('Olá, Ana!')
    expect(msg.html).toContain('https://licitaforce-app.vercel.app/redefinir-senha?token_hash=abc123&amp;type=recovery')
    expect(msg.html).toContain('cid:licitaflow-logo')
  })
  it('esqueci a senha com e-mail sem conta: responde ok e não envia', async () => {
    const { r, enviar } = await rodar({ acao: 'recuperar_senha', email: 'nao@existe.com' }, (u) =>
      u.includes('plataforma_email') ? Response.json(smtp()) : u.includes('registrar_pedido_email') ? Response.json(true)
        : Response.json({ msg: 'User not found' }, { status: 404 }))
    expect(r.json).toHaveBeenCalledWith({ ok: true })
    expect(enviar).not.toHaveBeenCalled()
  })
  it('acima do limite não gera link', async () => {
    const { r, fetch } = await rodar({ acao: 'recuperar_senha', email: 'a@b.com' }, (u) =>
      u.includes('plataforma_email') ? Response.json(smtp()) : Response.json(false))
    expect(r.json).toHaveBeenCalledWith({ ok: true })
    expect(fetch.mock.calls.some(c => String(c[0]).includes('generate_link'))).toBe(false)
  })
  it('cadastro: cria sem e-mail do Supabase e manda a confirmação com destino', async () => {
    const { r, enviar, fetch } = await rodar({ acao: 'cadastrar', nome: 'Ana Souza', email: 'ana@x.com', senha: 'senha-forte-1', voltar: '/onboarding' }, (u) =>
      u.includes('plataforma_email') ? Response.json(smtp()) : u.includes('registrar_pedido_email') ? Response.json(true) : Response.json({ hashed_token: 'tk9' }))
    expect(r.json).toHaveBeenCalledWith({ ok: true })
    const gerar = fetch.mock.calls.find(c => String(c[0]).includes('generate_link'))!
    expect(JSON.parse(String(gerar[1].body))).toEqual({ type: 'signup', email: 'ana@x.com', password: 'senha-forte-1', data: { nome: 'Ana Souza' } })
    expect(enviar.mock.calls[0][1].html).toContain('/confirmar-email?token_hash=tk9&amp;type=signup&amp;voltar=%2Fonboarding')
  })
  it('cadastro com e-mail já usado: 409', async () => {
    const { r, enviar } = await rodar({ acao: 'cadastrar', nome: 'Ana', email: 'ana@x.com', senha: 'senha-forte-1' }, (u) =>
      u.includes('plataforma_email') ? Response.json(smtp()) : u.includes('registrar_pedido_email') ? Response.json(true)
        : Response.json({ msg: 'A user with this email address has already been registered' }, { status: 422 }))
    expect(r.status).toHaveBeenCalledWith(409)
    expect(enviar).not.toHaveBeenCalled()
  })
})
