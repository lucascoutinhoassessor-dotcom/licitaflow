import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from '../api/pagamentos.js'
import { iniciarCompra } from './compra-publica.js'
import { cifrar } from './asaas.js'

const org = '11111111-1111-1111-1111-111111111111'
const assinatura = '22222222-2222-2222-2222-222222222222'
const nova = '33333333-3333-3333-3333-333333333333'
const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'privada', SUPABASE_ANON_KEY: 'anon' }
function res() { return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() } }
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

type Extra = (url: string, o?: RequestInit) => Response | undefined
function compra(extra: Extra) {
  return vi.fn(async (url: string, o?: RequestInit) => {
    const r = extra(url, o); if (r) return r
    if (url.includes('registrar_pedido_email')) return Response.json(true)
    if (url.includes('plataforma_email')) return Response.json([{ ativo: true, boas_vindas: true, host: 'smtp.test', usuario: 'a@b.com', senha_cifrada: cifrar('smtp', env) }])
    if (url.includes('plataforma_gateways')) return Response.json([{ ativo: true, ambiente: 'sandbox', api_key_cifrada: cifrar('asaas', env) }])
    if (url.includes('plataforma_planos')) return Response.json([{ id: 'essencial', ativo: true, mensal_centavos: 39700 }])
    throw new Error('Requisição inesperada: ' + url)
  })
}
const pedidoAna = (extra: Record<string, unknown> = {}) => ({ nome: 'Ana', email: 'ana@test.com', empresa: 'Empresa Ana', plano: 'essencial', ...extra })

describe('compra retomada com o mesmo e-mail', () => {
  it('mesmo navegador continua o pedido; sem a chave ninguém assume a conta', async () => {
    let hash = ''
    vi.stubGlobal('fetch', compra((url, o) => {
      const body = JSON.parse(String(o?.body || '{}'))
      if (url.includes('/admin/users?')) return Response.json({ users: [] })
      if (url.endsWith('/admin/users')) { hash = body.app_metadata.chave_compra; return Response.json({ id: org }) }
      if (url.endsWith('/organizations')) return Response.json([{ id: org }])
      if (url.endsWith('/memberships') || url.endsWith('/checkout_acessos')) return new Response(null, { status: 204 })
      if (url.includes('/token?')) return Response.json({ access_token: 'sessao', refresh_token: 'renovar' })
    }))
    const criado = res()
    await iniciarCompra(pedidoAna(), { headers: {} }, criado, env)
    const chave = criado.json.mock.calls[0][0].chave_pedido as string
    expect(chave.length).toBeGreaterThan(20)
    expect(hash).not.toContain(chave)

    const senha = 'senha-aleatoria-guardada'
    const usuario = { id: org, email: 'ana@test.com', app_metadata: { chave_compra: hash }, user_metadata: {} }
    const fetch = compra((url, o) => {
      if (url.includes('/admin/users?')) return Response.json({ users: [usuario] })
      if (url.includes('/checkout_acessos?')) return Response.json([{ org_id: org, senha_cifrada: cifrar(senha, env) }])
      if (url.includes('/organizations?id=eq.')) return new Response(null, { status: 204 })
      if (url.includes('/admin/users/')) return Response.json({})
      if (url.includes('/token?')) { expect(JSON.parse(String(o?.body)).password).toBe(senha); return Response.json({ access_token: 's2', refresh_token: 'r2' }) }
    })
    vi.stubGlobal('fetch', fetch)
    const ok = res()
    await iniciarCompra(pedidoAna({ email: 'ANA@test.com', empresa: 'Nova Empresa', chave_pedido: chave }), { headers: {} }, ok, env)
    expect(ok.json).toHaveBeenCalledWith({ org, access_token: 's2', refresh_token: 'r2', retomada: true })

    const negado = res()
    await iniciarCompra(pedidoAna({ chave_pedido: 'chave-errada' }), { headers: {} }, negado, env)
    expect(negado.status).toHaveBeenCalledWith(409)
    expect(fetch.mock.calls.filter(([u]) => String(u).includes('/token?'))).toHaveLength(1)
  })
  it('conta comum (sem compra pendente) é orientada a entrar', async () => {
    vi.stubGlobal('fetch', compra(url => {
      if (url.includes('/admin/users?')) return Response.json({ users: [{ id: org, email: 'ana@test.com', app_metadata: {} }] })
      if (url.includes('/checkout_acessos?')) return Response.json([])
    }))
    const r = res()
    await iniciarCompra(pedidoAna(), { headers: {} }, r, env)
    expect(r.status).toHaveBeenCalledWith(409)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ entrar: true }))
  })
})

describe('gerar a cobrança de novo ou trocar plano/ciclo antes de pagar', () => {
  const pendente = { id: assinatura, org_id: org, gateway_assinatura_id: 'sub_old', plano_id: 'essencial', ciclo: 'mensal', valor_centavos: 39700, link_pagamento: null }
  function api(extra: Extra = () => undefined, pagamentoAntigo = 'PENDING') {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    return vi.fn(async (url: string, o?: RequestInit) => {
      const r = extra(url, o); if (r) return r
      if (url.includes('is_platform_admin')) return Response.json(false)
      if (url.includes('pode_gerir_cobranca')) return Response.json(true)
      if (url.includes('plataforma_gateways')) return Response.json([{ ativo: true, ambiente: 'sandbox', api_key_cifrada: cifrar('asaas', env) }])
      if (url.includes('status=eq.pendente')) return Response.json([pendente])
      if (url.includes('/subscriptions/sub_old/payments')) return Response.json({ data: [{ id: 'p1', status: pagamentoAntigo }] })
      if (url.includes('processar_pagamento_asaas')) return Response.json('ok')
      throw new Error('Requisição inesperada: ' + url)
    })
  }
  const assinar = (ciclo: string) => ({ method: 'POST', headers: { authorization: 'Bearer cliente' }, body: { acao: 'assinar', org, plano: 'essencial', ciclo, forma: 'UNDEFINED', documento: '52998224725' } })

  it('mesmo plano e ciclo reaproveita a cobrança, sem criar outra no Asaas', async () => {
    const fetch = api(); vi.stubGlobal('fetch', fetch)
    const r = res()
    await handler(assinar('mensal'), r)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ id: assinatura, valor_centavos: 39700, reaproveitada: true }))
    expect(fetch.mock.calls.some(([u, o]) => o?.method === 'POST' && String(u).endsWith('/subscriptions'))).toBe(false)
    expect(fetch.mock.calls.some(([u]) => String(u).includes('preparar_assinatura'))).toBe(false)
  })
  it('pedido já pago no Asaas não é cancelado', async () => {
    const fetch = api(undefined, 'RECEIVED'); vi.stubGlobal('fetch', fetch)
    const r = res()
    await handler(assinar('anual'), r)
    expect(r.status).toHaveBeenCalledWith(409)
    expect(fetch.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(false)
  })
  it('trocar para o anual cancela o pedido antigo e cobra o valor anual do catálogo', async () => {
    let criada: Record<string, unknown> = {}
    const fetch = api((url, o) => {
      if (url.includes('/assinatura_faturas?select=id')) return Response.json([])
      if (url.endsWith('/subscriptions/sub_old') && o?.method === 'DELETE') return Response.json({ deleted: true })
      if (url.includes(`/assinaturas?id=eq.${assinatura}`) && o?.method === 'PATCH') { expect(JSON.parse(String(o.body)).status).toBe('cancelada'); return Response.json([{}]) }
      if (url.includes('preparar_assinatura')) { expect(JSON.parse(String(o?.body))).toMatchObject({ p_ciclo: 'anual', p_forma: 'UNDEFINED' }); return Response.json(nova) }
      if (url.includes('reservado_em=is.null')) return Response.json([{ id: nova, org_id: org, plano_id: 'essencial', ciclo: 'anual', valor_centavos: 404940, forma: 'UNDEFINED', documento: '52998224725' }])
      if (url.includes('/organizations?select=id,nome')) return Response.json([{ id: org, nome: 'Empresa' }])
      if (url.includes('/plataforma_planos?select=nome')) return Response.json([{ nome: 'Essencial' }])
      if (url.includes('gateway_cliente_id=not.is.null')) return Response.json([])
      if (url.endsWith('/auth/v1/user')) return Response.json({ id: org, email: 'ana@test.com' })
      if (url.endsWith('/customers')) return Response.json({ id: 'cus_1' })
      if (url.endsWith('/subscriptions') && o?.method === 'POST') { criada = JSON.parse(String(o.body)); return Response.json({ id: 'sub_new', nextDueDate: '2026-11-27' }) }
      if (url.includes('/subscriptions/sub_new/payments')) return Response.json({ data: [] })
      if (url.includes(`/assinaturas?id=eq.${nova}`)) return Response.json([{}])
    })
    vi.stubGlobal('fetch', fetch)
    const r = res()
    await handler(assinar('anual'), r)
    expect(r.status).not.toHaveBeenCalled()
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ id: nova, valor_centavos: 404940 }))
    expect(criada).toMatchObject({ value: 4049.4, cycle: 'YEARLY', billingType: 'UNDEFINED' })
  })
})
