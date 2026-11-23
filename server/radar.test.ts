import { afterEach, describe, expect, it, vi } from 'vitest'
import { avisarRadar, mensagemRadar } from './radar.js'
import { criarHandler } from './agentes.js'

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

describe('push do Radar', () => {
  it('escreve a mensagem por empresa, com o destaque', () => {
    expect(mensagemRadar({ empresa: 'Papelaria Ana', quantidade: 3, destaque: 'Aquisição de papel A4' }))
      .toEqual({ titulo: 'Radar · 3 oportunidades novas para Papelaria Ana', texto: 'Destaque: Aquisição de papel A4 (+2)' })
    expect(mensagemRadar({ empresa: 'X', quantidade: 1, destaque: null }).titulo).toBe('Radar · 1 oportunidade nova para X')
  })

  it('manda um push por empresa só para os membros da organização', async () => {
    const webpush = { setVapidDetails: vi.fn(), sendNotification: vi.fn(async () => ({})) }
    const rpc = vi.fn(async () => [{ org_id: 'o1', empresa_id: 'e1', empresa: 'Papelaria Ana', quantidade: 2, destaque: 'Papel A4' }])
    const chamar = vi.fn(async (caminho: string) => {
      if (caminho.includes('push_vapid')) return [{ publica: 'pub', privada: 'priv' }]
      if (caminho.includes('memberships')) return [{ org_id: 'o1', user_id: 'u1' }]
      if (caminho.includes('push_inscricoes')) return [{ id: 's1', user_id: 'u1', endpoint: 'https://p/1', p256dh: 'k', auth: 'a' }, { id: 's2', user_id: 'u9', endpoint: 'https://p/9', p256dh: 'k', auth: 'a' }]
      return null
    })
    const r = await avisarRadar({ token: 't', rpc, chamar, webpush })
    expect(r).toEqual({ empresas: 1, enviados: 1, falhas: 0 })
    const [, payload] = webpush.sendNotification.mock.calls[0] as unknown as [unknown, string]
    expect(JSON.parse(payload)).toMatchObject({ titulo: 'Radar · 2 oportunidades novas para Papelaria Ana', url: '/app/agentes/radar' })
  })

  it('sem sugestões novas não manda nada', async () => {
    const chamar = vi.fn()
    expect(await avisarRadar({ token: 't', rpc: vi.fn(async () => []), chamar, webpush: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } })).toEqual({ empresas: 0, enviados: 0, falhas: 0 })
    expect(chamar).not.toHaveBeenCalled()
  })
})

describe('rota do Radar', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('exige o token do agendador e chama os avisos', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://db.exemplo'); vi.stubEnv('SUPABASE_ANON_KEY', 'anon'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'servico')
    const resposta = () => ({ setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() })
    const fetcher = vi.fn(async (url: string) => (url.endsWith('/rpc/radar_para_avisar') ? json([]) : json(null)))
    let r = resposta()
    await criarHandler({ fetcher: fetcher as unknown as typeof fetch })({ method: 'GET', headers: {}, query: { agente: 'radar', acao: 'avisar' } }, r)
    expect(r.status).toHaveBeenCalledWith(401)
    r = resposta()
    await criarHandler({ fetcher: fetcher as unknown as typeof fetch })({ method: 'GET', headers: { 'x-coleta': 'b'.repeat(64) }, query: { agente: 'radar', acao: 'avisar' } }, r)
    expect(r.status).toHaveBeenCalledWith(200)
    expect(r.json.mock.calls[0][0]).toEqual({ empresas: 0, enviados: 0, falhas: 0 })
  })
})
