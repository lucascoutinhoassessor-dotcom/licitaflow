import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from '../api/pagamentos.js'
import { iniciarCompra } from './compra-publica.js'
import { cifrar, decifrar } from './asaas.js'

const org = '11111111-1111-1111-1111-111111111111'
const assinatura = '22222222-2222-2222-2222-222222222222'
const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'privada', SUPABASE_ANON_KEY: 'anon' }
function res() { return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() } }
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('checkout do cliente', () => {
  function ambiente() {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    vi.stubEnv('ASAAS_API_KEY', 'segredo'); vi.stubEnv('PAYMENTS_ENABLED_PROVIDERS', 'asaas')
  }
  it('nega checkout de outra organização antes de ler chaves ou cobranças', async () => {
    ambiente()
    const fetch = vi.fn().mockImplementation(async () => Response.json(false)); vi.stubGlobal('fetch', fetch)
    const r = res()
    await handler({ method: 'POST', headers: { authorization: 'Bearer cliente' }, body: { acao: 'checkout_cliente', org } }, r)
    expect(r.status).toHaveBeenCalledWith(403)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it.each([false, true])('só confirma a compra após consultar o provedor (pago=%s)', async pago => {
    ambiente()
    const fetch = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes('is_platform_admin')) return Response.json(false)
      if (url.includes('pode_gerir_cobranca')) return Response.json(true)
      if (url.includes('/assinaturas?select=*&')) return Response.json([{ id: assinatura, org_id: org, gateway_assinatura_id: 'sub_1', valor_centavos: 19700, plano_id: 'essencial', ciclo: 'mensal' }])
      if (url.includes('plataforma_gateways')) return Response.json([])
      if (url.includes('/subscriptions/sub_1/payments')) return Response.json({ data: [{ id: 'pay_1', status: pago ? 'CONFIRMED' : 'PENDING', billingType: 'PIX', value: 197, invoiceUrl: 'https://asaas.com/i/1' }] })
      if (url.includes('processar_pagamento_asaas')) {
        expect(JSON.parse(String(options?.body)).p_evento).toBe('SYNC')
        return Response.json(pago ? 'acesso liberado' : 'fatura registrada')
      }
      if (url.includes('reservar_boas_vindas')) return Response.json(null)
      if (url.includes('/assinaturas?select=status')) return Response.json([{ status: pago ? 'ativa' : 'pendente', pago_ate: pago ? '2099-01-01' : null, boas_vindas_em: null }])
      if (url.includes('/organizations')) return Response.json([{ suspensa: !pago }])
      if (url.includes('/pixQrCode')) return Response.json({ encodedImage: 'imagem', payload: 'codigo-pix' })
      throw new Error('Requisição inesperada: ' + url)
    })
    vi.stubGlobal('fetch', fetch)
    const r = res()
    await handler({ method: 'POST', headers: { authorization: 'Bearer cliente' }, body: { acao: 'checkout_cliente', org, pago: true } }, r)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ pago, liberado: pago, pix: pago ? null : { encodedImage: 'imagem', payload: 'codigo-pix' } }))
    expect(fetch.mock.calls.some(([url]) => url.includes('/pixQrCode'))).toBe(!pago)
  })
})

describe('provisionamento da compra', () => {
  it('cria conta bloqueada com senha aleatória cifrada, sem devolver a senha', async () => {
    let senha = ''
    const fetch = vi.fn(async (url: string, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body || '{}'))
      if (url.includes('registrar_pedido_email')) return Response.json(true)
      if (url.includes('plataforma_email')) return Response.json([{ ativo: true, boas_vindas: true, host: 'smtp.test', usuario: 'a@b.com', senha_cifrada: cifrar('smtp', env) }])
      if (url.includes('plataforma_gateways')) return Response.json([{ ativo: true, ambiente: 'sandbox', api_key_cifrada: cifrar('asaas', env) }])
      if (url.includes('plataforma_planos')) return Response.json([{ id: 'essencial', ativo: true, mensal_centavos: 19700 }])
      if (url.endsWith('/admin/users')) { senha = body.password; expect(senha.length).toBeGreaterThanOrEqual(20); return Response.json({ id: org }) }
      if (url.endsWith('/organizations')) { expect(body).toMatchObject({ suspensa: true, plano: 'trial' }); return Response.json([{ id: org }]) }
      if (url.endsWith('/memberships')) { expect(body).toMatchObject({ papel: 'owner', user_id: org }); return new Response(null, { status: 204 }) }
      if (url.endsWith('/checkout_acessos')) { expect(body.senha_cifrada).not.toContain(senha); expect(decifrar(body.senha_cifrada, env)).toBe(senha); return new Response(null, { status: 204 }) }
      if (url.includes('/token?')) { expect(body.password).toBe(senha); return Response.json({ access_token: 'sessao', refresh_token: 'renovar' }) }
      throw new Error('Requisição inesperada: ' + url)
    })
    vi.stubGlobal('fetch', fetch)
    const r = res()
    await iniciarCompra({ nome: 'Ana', email: 'ana@test.com', empresa: 'Empresa Ana', plano: 'essencial' }, { headers: {} }, r, env)
    expect(r.json).toHaveBeenCalledWith({ org, access_token: 'sessao', refresh_token: 'renovar', chave_pedido: expect.any(String) })
    expect(JSON.stringify(r.json.mock.calls)).not.toContain(senha)
  })
  it('limita tentativas antes de criar uma conta', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(false)); vi.stubGlobal('fetch', fetch)
    const r = res()
    await iniciarCompra({ nome: 'Ana', email: 'ana@test.com', empresa: 'Empresa Ana', plano: 'essencial' }, { headers: {} }, r, env)
    expect(r.status).toHaveBeenCalledWith(429)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
