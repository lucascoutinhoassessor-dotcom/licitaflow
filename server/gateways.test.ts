import { afterEach, describe, expect, it, vi } from 'vitest'
import { configuracao, criarCheckout, consultarPagamento } from './gateways.js'
const c={id:'11111111-1111-1111-1111-111111111111',gateway:'stripe',valor_centavos:19700,descricao:'Acesso LicitaFlow',gateway_id:'cs_123',vencimento:'2026-12-01'}
const env={STRIPE_SECRET_KEY:'test-secret',BILLING_PUBLIC_URL:'https://exemplo.com',ASAAS_API_KEY:'test-asaas',MERCADOPAGO_ACCESS_TOKEN:'test-mp',INFINITEPAY_API_KEY:'test-infinite',INFINITEPAY_HANDLE:'loja'}
afterEach(()=>vi.unstubAllGlobals())
describe('gateways de pagamento',()=>{
  it('não publica credenciais na consulta de configuração',()=>{
    const config=configuracao(env)
    expect(config).toHaveLength(4)
    expect(JSON.stringify(config)).not.toContain('test-secret')
    expect(config.every(g=>!g.habilitado)).toBe(true)
  })
  it('cria checkout Stripe com preço do banco, referência e idempotência',async()=>{
    const fetch=vi.fn().mockResolvedValue(Response.json({id:'cs_123',url:'https://checkout.stripe.com/test'}));vi.stubGlobal('fetch',fetch)
    await criarCheckout(c,env)
    const [,op]=fetch.mock.calls[0]
    expect(op.headers['Idempotency-Key']).toBe(c.id)
    expect(op.body.get('line_items[0][price_data][unit_amount]')).toBe('19700')
    expect(op.body.get('client_reference_id')).toBe(c.id)
  })
  it.each(['asaas','mercadopago','infinitepay'])('cria payload de checkout %s com referência interna',async gateway=>{
    const fetch=vi.fn().mockResolvedValue(Response.json({id:'id',url:'https://checkout.exemplo.com',init_point:'https://checkout.exemplo.com',sandbox_init_point:'https://checkout.exemplo.com'}));vi.stubGlobal('fetch',fetch)
    await criarCheckout({...c,gateway},env)
    const payload=JSON.parse(fetch.mock.calls[0][1].body)
    expect(payload.externalReference ?? payload.external_reference ?? payload.order_nsu).toBe(c.id)
    expect(payload.chargeType ?? 'DETACHED').toBe('DETACHED')
  })
  it('rejeita pagamento Stripe com valor ou referência divergentes',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({payment_status:'paid',amount_total:1,currency:'brl',client_reference_id:c.id})))
    expect(await consultarPagamento(c,env)).toBe(false)
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({payment_status:'paid',amount_total:19700,currency:'brl',client_reference_id:'outra'})))
    expect(await consultarPagamento(c,env)).toBe(false)
  })
  it('InfinitePay usa amount original e consulta servidor mesmo com retorno de sucesso',async()=>{
    const fetch=vi.fn().mockResolvedValue(Response.json({success:true,paid:true,amount:19700,paid_amount:20000}));vi.stubGlobal('fetch',fetch)
    expect(await consultarPagamento({...c,gateway:'infinitepay'},env,{slug:'s',transaction_nsu:'t'})).toBe(true)
    expect(fetch.mock.calls[0][0]).toContain('/payment_check')
    await expect(consultarPagamento({...c,gateway:'infinitepay'},env,{})).rejects.toThrow('transaction_nsu')
  })
})
