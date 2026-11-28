import { afterEach, describe, expect, it, vi } from 'vitest'
import webhook from '../api/asaas-webhook.js'
import pagamentos from '../api/pagamentos.js'
import { chaveDoOutroAmbiente, cifrar, decifrar, montarConfig } from './asaas.js'

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'privada', SUPABASE_ANON_KEY: 'anon' }
const c = (t: string) => cifrar(t, env)
function res() { return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() } }
function ambiente() { for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v) }
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const linha = (ambiente: 'sandbox' | 'production') => ({
  id: 'asaas', ativo: true, ambiente,
  api_key_sandbox_cifrada: c('$aact_hmlg_teste'), api_key_production_cifrada: c('$aact_prod_real'),
  webhook_token_sandbox_cifrado: c('token-sandbox-1234567890'), webhook_token_production_cifrado: c('token-producao-1234567890'),
})

describe('Asaas com conta de teste e de produção', () => {
  it('usa a chave do ambiente escolhido no master', () => {
    expect(montarConfig(linha('sandbox'), env)).toMatchObject({ ambiente: 'sandbox', apiKey: '$aact_hmlg_teste', ativo: true })
    expect(montarConfig(linha('production'), env)).toMatchObject({ ambiente: 'production', apiKey: '$aact_prod_real', ativo: true })
    // Testar a conexão do outro ambiente não o deixa ativo.
    expect(montarConfig(linha('sandbox'), env, 'production')).toMatchObject({ apiKey: '$aact_prod_real', ativo: false })
  })
  it('linha antiga (só a chave única) continua valendo para o ambiente que estava marcado', () => {
    expect(montarConfig({ ativo: true, ambiente: 'production', api_key_cifrada: c('$aact_prod_antiga') }, env)).toMatchObject({ ambiente: 'production', apiKey: '$aact_prod_antiga' })
  })
  it('recusa chave colada no ambiente errado', () => {
    expect(chaveDoOutroAmbiente('$aact_hmlg_abc', 'production')).toBe(true)
    expect(chaveDoOutroAmbiente('$aact_prod_abc', 'sandbox')).toBe(true)
    expect(chaveDoOutroAmbiente('$aact_prod_abc', 'production')).toBe(false)
  })

  it('trocar para produção guarda as duas chaves, espelha a de produção e cancela pedidos de teste não pagos', async () => {
    ambiente()
    const chamadas: [string, Record<string, unknown>][] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, o?: RequestInit) => {
      if (url.includes('is_platform_admin')) return Response.json(true)
      if (url.includes('plataforma_gateways?select')) return Response.json([{ id: 'asaas', ativo: true, ambiente: 'sandbox', api_key_sandbox_cifrada: c('$aact_hmlg_teste') }])
      if (o?.method === 'PATCH') { chamadas.push([url, JSON.parse(String(o.body))]); return Response.json(url.includes('assinaturas') ? [{ id: 1 }, { id: 2 }] : [{}]) }
      throw new Error('inesperada ' + url)
    }))
    const r = res()
    await pagamentos({ method: 'POST', headers: { authorization: 'Bearer master' }, body: { acao: 'asaas_salvar', ambiente: 'production', chaves: { production: '$aact_prod_' + 'x'.repeat(30) } } }, r)
    expect(r.json).toHaveBeenCalledWith({ ok: true, ambiente: 'production', pedidos_cancelados: 2 })
    const [, cancel] = chamadas.find(([u]) => u.includes('assinaturas?status=eq.pendente&pago_ate=is.null'))!
    expect(cancel.status).toBe('cancelada')
    const [, g] = chamadas.find(([u]) => u.includes('plataforma_gateways'))!
    expect(g.ambiente).toBe('production')
    expect(decifrar(String(g.api_key_cifrada), env)).toMatch(/^\$aact_prod_/)
    expect(JSON.stringify(g)).not.toContain('$aact_prod_')
  })
  it('não deixa ativar produção sem a chave de produção', async () => {
    ambiente()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('is_platform_admin')) return Response.json(true)
      if (url.includes('plataforma_gateways?select')) return Response.json([{ id: 'asaas', ativo: true, ambiente: 'sandbox', api_key_sandbox_cifrada: c('$aact_hmlg_teste') }])
      throw new Error('não deveria gravar ' + url)
    }))
    const r = res()
    await pagamentos({ method: 'POST', headers: { authorization: 'Bearer master' }, body: { acao: 'asaas_salvar', ambiente: 'production' } }, r)
    expect(r.status).toHaveBeenCalledWith(400)
  })

  async function evento(ambienteEmUso: 'sandbox' | 'production', token: string) {
    ambiente()
    const fetch = vi.fn(async (url: string) => {
      if (url.includes('plataforma_gateways')) return Response.json([linha(ambienteEmUso)])
      if (url.includes('gateway_eventos')) return Response.json([{ id: 'evt' }])
      if (url.includes('processar_pagamento_asaas')) return Response.json('acesso liberado')
      return new Response(null, { status: 204 })
    })
    vi.stubGlobal('fetch', fetch)
    const r = res()
    await webhook({ method: 'POST', headers: { 'asaas-access-token': token }, body: { id: 'evt', event: 'PAYMENT_RECEIVED', payment: { id: 'pay' } } }, r)
    return { r, processou: fetch.mock.calls.some(([u]) => String(u).includes('processar_pagamento_asaas')) }
  }
  it('pagamento de teste nunca libera acesso com a produção em uso', async () => {
    const { r, processou } = await evento('production', 'token-sandbox-1234567890')
    expect(processou).toBe(false)
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ ignorado: expect.any(String) }))
  })
  it('pagamento real é processado mesmo com o teste em uso', async () => {
    expect((await evento('sandbox', 'token-producao-1234567890')).processou).toBe(true)
    expect((await evento('sandbox', 'token-sandbox-1234567890')).processou).toBe(true)
    const { r } = await evento('production', 'token-qualquer')
    expect(r.status).toHaveBeenCalledWith(401)
  })
})
