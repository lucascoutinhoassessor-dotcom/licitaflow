import { afterEach, describe, expect, it, vi } from 'vitest'

const org = '11111111-1111-4111-8111-111111111111'
const id = '22222222-2222-4222-8222-222222222222'
const enviar = vi.fn()
vi.mock('./email.js', async orig => ({ ...(await orig<typeof import('./email.js')>()), montarSmtp: () => ({ ativo: true, endereco: 'master@empresa.com' }), enviarEmail: (...args: unknown[]) => enviar(...args) }))
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks() })

async function executar(body: Record<string, unknown>, { negar = false, falharEmail = false, token = 'Bearer cliente', admin = false, pelaApi = false } = {}) {
  vi.stubEnv('SUPABASE_URL', 'https://teste.supabase.co')
  vi.stubEnv('SUPABASE_ANON_KEY', 'anon')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'servico')
  enviar.mockImplementation(() => falharEmail ? Promise.reject(new Error('SMTP')) : Promise.resolve({}))
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (url.includes('/rpc/abrir_chamado') || url.includes('/rpc/responder_chamado') || url.includes('/rpc/admin_atualizar_chamado')) {
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer cliente')
      return negar ? Response.json({ message: 'Acesso negado' }, { status: 403 }) : Response.json(id)
    }
    if (url.includes('is_platform_admin')) return Response.json(admin)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'autor', email: 'cliente@empresa.com' })
    if (url.includes('suporte_chamados?')) return Response.json([{ id, org_id: org, criado_por: 'autor', assunto: 'Meu acesso', tipo: 'liberacao_conta' }])
    if (url.includes('plataforma_email?')) return Response.json([{}])
    if (url.includes('organizations?')) return Response.json([{ nome: 'Empresa' }])
    if (url.includes('/admin/users/')) return Response.json({ email: 'cliente@empresa.com' })
    throw new Error('Rota inesperada: ' + url)
  })
  vi.stubGlobal('fetch', fetch)
  const { default: handler } = pelaApi ? await import('../api/usuarios.js') : await import('./suporte.js')
  const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() }
  await handler({ method: 'POST', headers: { authorization: token }, body }, res)
  return { res, fetch }
}

describe('tickets por SMTP do master', () => {
  it('encaminha o ticket pela API existente sem exigir papel master', async () => {
    const { res } = await executar({ acao: 'suporte_abrir', org, tipo: 'suporte', assunto: 'Meu acesso', texto: 'Preciso de ajuda' }, { pelaApi: true })
    expect(res.json).toHaveBeenCalledWith({ ok: true, chamado: id, emailEnviado: true })
    expect(enviar).toHaveBeenCalledTimes(2)
  })
  it('abre liberação de conta e envia protocolo à caixa master e ao cliente', async () => {
    const { res } = await executar({ acao: 'abrir', org, tipo: 'liberacao_conta', assunto: 'Meu acesso', texto: '<script>teste</script>' })
    expect(res.json).toHaveBeenCalledWith({ ok: true, chamado: id, emailEnviado: true })
    expect(enviar.mock.calls.map(c => c[1].para)).toEqual(['master@empresa.com', 'cliente@empresa.com'])
    expect(enviar.mock.calls[0][1].html).toContain('&lt;script&gt;teste&lt;/script&gt;')
    expect(enviar.mock.calls[0][1].html).toContain('/master/suporte')
    expect(enviar.mock.calls[1][1].texto).toContain(id)
  })
  it.each(['responder', 'atualizar'])('envia atualização: %s', async acao => {
    const { res } = await executar({ acao, chamado: id, texto: 'Resposta da equipe', status: 'resolvido', prioridade: 'normal' }, { admin: true })
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ emailEnviado: true }))
    expect(enviar).toHaveBeenCalledTimes(2)
  })
  it('não envia nem consulta dados privados se a RPC negar acesso', async () => {
    const { res, fetch } = await executar({ acao: 'responder', chamado: id, texto: 'Teste' }, { negar: true })
    expect(res.status).toHaveBeenCalledWith(403)
    expect(enviar).not.toHaveBeenCalled()
    expect(fetch.mock.calls.some(c => c[0].includes('plataforma_email'))).toBe(false)
  })
  it('preserva o ticket salvo e informa falha de SMTP', async () => {
    const { res, fetch } = await executar({ acao: 'abrir', org, tipo: 'suporte', assunto: 'Ajuda', texto: 'Preciso de ajuda' }, { falharEmail: true })
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, emailEnviado: false, aviso: expect.any(String) }))
    expect(fetch.mock.calls.filter(c => c[0].includes('abrir_chamado'))).toHaveLength(1)
  })
  it('rejeita chamada sem autenticação', async () => {
    const { res, fetch } = await executar({ acao: 'abrir' }, { token: '' })
    expect(res.status).toHaveBeenCalledWith(401)
    expect(fetch).not.toHaveBeenCalled()
  })
})
