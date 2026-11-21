import { beforeEach, describe, expect, it, vi } from 'vitest'
import { criarHandler, inscricaoValida, resumo } from './push.js'

const AVISO = '11111111-2222-3333-4444-555555555555'
type Chamada = { url: string; method: string; body: unknown; auth: string }

function resposta() {
  const r: { status?: number; body?: unknown; headers: Record<string, string> } = { headers: {} }
  const res = { setHeader: (k: string, v: string) => { r.headers[k] = v }, status: (s: number) => { r.status = s; return res }, json: (b: unknown) => { r.body = b; return res } }
  return { r, res }
}

function banco(opcoes: { admin?: boolean; vapid?: boolean; aviso?: boolean; orgIds?: string[] } = {}) {
  const chamadas: Chamada[] = []
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    const u = url.replace('https://db', '')
    const method = init.method ?? 'GET'
    chamadas.push({ url: u, method, body: init.body ? JSON.parse(String(init.body)) : null, auth: String((init.headers as Record<string, string>).Authorization) })
    const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 })
    if (u === '/auth/v1/user') return ok({ id: 'u1' })
    if (u.startsWith('/rest/v1/rpc/is_platform_admin')) return ok(opcoes.admin ?? false)
    if (u.startsWith('/rest/v1/push_vapid') && method === 'GET') return ok(opcoes.vapid === false && !chamadas.some(c => c.url.startsWith('/rest/v1/push_vapid') && c.method === 'POST') ? [] : [{ publica: 'PUB', privada: 'PRIV' }])
    if (u.startsWith('/rest/v1/plataforma_avisos') && method === 'PATCH') return ok(opcoes.aviso === false ? [] : [{ id: AVISO, titulo: 'Novo recurso', texto: 'Texto\n do aviso', org_id: null, org_ids: opcoes.orgIds ?? null }])
    if (u.startsWith('/rest/v1/plataforma_avisos') && method === 'GET') return ok([{ id: AVISO }])
    if (u.startsWith('/rest/v1/memberships')) return ok([{ user_id: 'u1' }, { user_id: 'u2' }, { user_id: 'u1' }])
    if (u.startsWith('/rest/v1/push_inscricoes') && method === 'GET') return ok([
      { id: 'a', endpoint: 'https://fcm.googleapis.com/a', p256dh: 'p', auth: 'k' },
      { id: 'b', endpoint: 'https://fcm.googleapis.com/b', p256dh: 'p', auth: 'k' },
    ])
    return new Response(null, { status: 204 })
  })
  return { fetcher, chamadas }
}

const webpushFalso = () => ({
  generateVAPIDKeys: vi.fn(() => ({ publicKey: 'NOVA', privateKey: 'NOVAPRIV' })),
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(async (s: { endpoint: string }) => { if (s.endpoint.endsWith('/b')) throw Object.assign(new Error('gone'), { statusCode: 410 }) }),
})

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://db'
  process.env.SUPABASE_ANON_KEY = 'anon'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'servico'
})

describe('push', () => {
  it('resume texto longo e valida inscrições', () => {
    expect(resumo('a  b\n c')).toBe('a b c')
    expect(resumo('x'.repeat(300)).length).toBe(180)
    expect(inscricaoValida({ endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } })).toBe(true)
    expect(inscricaoValida({ endpoint: 'http://push.example/1', keys: { p256dh: 'p', auth: 'a' } })).toBe(false)
    expect(inscricaoValida({ endpoint: 'https://push.example/1', keys: {} })).toBe(false)
  })

  it('gera as chaves VAPID no primeiro uso e devolve a pública', async () => {
    const { fetcher, chamadas } = banco({ vapid: false })
    const wp = webpushFalso()
    const { r, res } = resposta()
    await criarHandler({ webpush: wp, fetcher } as never)({ method: 'GET', headers: {} }, res)
    expect(wp.generateVAPIDKeys).toHaveBeenCalledOnce()
    expect(chamadas.find(c => c.method === 'POST')?.body).toMatchObject({ id: true, publica: 'NOVA', privada: 'NOVAPRIV' })
    expect(r.status).toBe(200)
  })

  it('inscreve o aparelho para o usuário logado', async () => {
    const { fetcher, chamadas } = banco()
    const { r, res } = resposta()
    await criarHandler({ webpush: webpushFalso(), fetcher } as never)({ method: 'POST', headers: { authorization: 'Bearer t', 'user-agent': 'Android' }, body: { acao: 'inscrever', inscricao: { endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'p', auth: 'a' } } } }, res)
    expect(r.status).toBe(200)
    const ins = chamadas.find(c => c.url.startsWith('/rest/v1/push_inscricoes') && c.method === 'POST')!
    expect(ins.body).toMatchObject({ user_id: 'u1', endpoint: 'https://fcm.googleapis.com/x', aparelho: 'Android' })
    expect(ins.auth).toBe('Bearer servico')
  })

  it('só o master envia', async () => {
    const { fetcher } = banco({ admin: false })
    const { r, res } = resposta()
    await criarHandler({ webpush: webpushFalso(), fetcher } as never)({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { acao: 'enviar', aviso: AVISO } }, res)
    expect(r.status).toBe(403)
  })

  it('envia com urgência alta, conta falhas e remove aparelhos que saíram', async () => {
    const { fetcher, chamadas } = banco({ admin: true })
    const wp = webpushFalso()
    const { r, res } = resposta()
    await criarHandler({ webpush: wp, fetcher } as never)({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { acao: 'enviar', aviso: AVISO } }, res)
    expect(r.body).toEqual({ enviados: 1, falhas: 1 })
    expect(wp.sendNotification).toHaveBeenCalledTimes(2)
    const [, payload, opts] = wp.sendNotification.mock.calls[0] as unknown as [unknown, string, Record<string, unknown>]
    expect(JSON.parse(payload)).toMatchObject({ id: AVISO, titulo: 'Novo recurso', texto: 'Texto do aviso', url: '/app/avisos' })
    expect(opts).toMatchObject({ urgency: 'high' })
    expect(chamadas.find(c => c.url.includes('user_id=in.('))?.url).toContain('user_id=in.(u1,u2)')
    expect(chamadas.some(c => c.method === 'DELETE' && c.url.includes('id=in.(b)'))).toBe(true)
  })

  it('não manda o mesmo aviso duas vezes', async () => {
    const { fetcher } = banco({ admin: true, aviso: false })
    const wp = webpushFalso()
    const { r, res } = resposta()
    await criarHandler({ webpush: wp, fetcher } as never)({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { acao: 'enviar', aviso: AVISO } }, res)
    expect(r.body).toMatchObject({ enviados: 0 })
    expect(wp.sendNotification).not.toHaveBeenCalled()
  })

  it('o envio pelo master só reserva aviso já na hora e com push ligado', async () => {
    const { fetcher, chamadas } = banco({ admin: true })
    const { res } = resposta()
    await criarHandler({ webpush: webpushFalso(), fetcher } as never)({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { acao: 'enviar', aviso: AVISO } }, res)
    const reserva = chamadas.find(c => c.method === 'PATCH')!.url
    expect(reserva).toContain('enviar_push=is.true')
    expect(reserva).toMatch(/publicar_em=lte\.\d{4}-/)
  })

  it('o agendador dispara os vencidos sem login, para vários clientes escolhidos', async () => {
    const { fetcher, chamadas } = banco({ orgIds: ['o1', 'o2'] })
    const wp = webpushFalso()
    const { r, res } = resposta()
    await criarHandler({ webpush: wp, fetcher } as never)({ method: 'POST', headers: {}, body: JSON.stringify({ acao: 'agendados' }) }, res)
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ avisos: 1, enviados: 1, falhas: 1 })
    expect(chamadas.some(c => c.url === '/auth/v1/user')).toBe(false)
    expect(chamadas.find(c => c.url.startsWith('/rest/v1/memberships'))?.url).toContain('org_id=in.(o1,o2)')
  })

  it('o agendador não faz nada quando o aviso já saiu', async () => {
    const { fetcher } = banco({ aviso: false })
    const wp = webpushFalso()
    const { r, res } = resposta()
    await criarHandler({ webpush: wp, fetcher } as never)({ method: 'POST', headers: {}, body: { acao: 'agendados' } }, res)
    expect(r.body).toEqual({ avisos: 0, enviados: 0, falhas: 0 })
    expect(wp.sendNotification).not.toHaveBeenCalled()
  })

  it('outras ações continuam exigindo login', async () => {
    const { fetcher } = banco({ admin: true })
    const { r, res } = resposta()
    await criarHandler({ webpush: webpushFalso(), fetcher } as never)({ method: 'POST', headers: {}, body: { acao: 'enviar', aviso: AVISO } }, res)
    expect(r.status).toBe(401)
  })
})
