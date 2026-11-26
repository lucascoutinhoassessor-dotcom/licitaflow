import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from '../api/pagamentos.js'

const id='11111111-1111-1111-1111-111111111111'
const fatura='22222222-2222-2222-2222-222222222222'
const a={id,org_id:'33333333-3333-3333-3333-333333333333',gateway_assinatura_id:'sub_1',status:'pendente'}
const pagamento={id:'pay_1',subscription:'sub_1',billingType:'CREDIT_CARD',status:'PENDING',value:197,dueDate:'2027-01-01'}
const res=()=>({setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()})
const cartao=()=>({nome:'Teste Pagador',numero:'5162306219378829',mes:'12',ano:String(new Date().getFullYear()+2),cvv:'318'})
const titular={nome:'Teste Pagador',email:'teste@example.com',documento:'24971563792',cep:'89223005',numero:'277',telefone:'47998781877'}
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()})

function montar(op: {permissao?:boolean;bloqueado?:boolean;status?:string;falha?:number|'timeout';faturaOutra?:boolean;vazio?:boolean}={}) {
  vi.stubEnv('SUPABASE_URL','https://teste.supabase.co');vi.stubEnv('SUPABASE_ANON_KEY','anon');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','service')
  vi.stubEnv('ASAAS_API_KEY','asaas-teste');vi.stubEnv('ASAAS_ENV','sandbox');vi.stubEnv('PAYMENTS_ENABLED_PROVIDERS','asaas');vi.stubEnv('VERCEL','1')
  const fetch=vi.fn(async (url:string,options:RequestInit={})=>{
    const u=String(url)
    if(u.includes('/rpc/is_platform_admin'))return Response.json(false)
    if(u.includes('/rpc/pode_gerir_cobranca'))return Response.json(op.permissao!==false)
    if(u.includes('/rpc/processar_pagamento_asaas'))return Response.json('fatura registrada')
    if(u.includes('/rest/v1/assinaturas?'))return Response.json([a])
    if(u.includes('/plataforma_gateways?'))return Response.json([])
    if(u.includes('/assinatura_faturas?')) {
      if(options.method==='PATCH')return Response.json(op.bloqueado?[]:[{id:fatura}])
      return Response.json(op.faturaOutra?[]:[{id:fatura,assinatura_id:id,gateway_pagamento_id:'pay_1'}])
    }
    if(u.includes('/payWithCreditCard')){
      if(op.falha==='timeout')throw new DOMException('Tempo esgotado','TimeoutError')
      if(op.falha)return Response.json({errors:[{description:'Cartão recusado'}]},{status:op.falha})
      return Response.json({...pagamento,status:'CONFIRMED',creditCard:{creditCardToken:'token-privado'}})
    }
    if(u.includes('/subscriptions/sub_1/creditCard'))return Response.json({id:'sub_1'})
    if(u.includes('/subscriptions/sub_1/payments'))return Response.json({data:op.vazio?[]:[{...pagamento,status:op.status ?? 'PENDING'}]})
    if(u.endsWith('/payments/pay_1'))return Response.json({...pagamento,status:op.status ?? 'PENDING'})
    throw new Error('URL inesperada: '+u)
  })
  vi.stubGlobal('fetch',fetch)
  return fetch
}
async function chamar(body:Record<string,unknown>) {
  const r=res()
  await handler({method:'POST',headers:{authorization:'Bearer usuario','x-forwarded-for':'203.0.113.10'},body:{id,...body}},r)
  return r
}

describe('autorização e confirmação no checkout',()=>{
  it('nega outra organização antes de acessar credenciais ou dados do gateway',async()=>{
    const fetch=montar({permissao:false}),r=await chamar({acao:'checkout_assinatura'})
    expect(r.status).toHaveBeenCalledWith(403)
    expect(fetch.mock.calls.some(([u])=>String(u).includes('asaas.com')||String(u).includes('plataforma_gateways'))).toBe(false)
  })
  it('recusa fatura que pertence a outra assinatura',async()=>{
    const fetch=montar({faturaOutra:true}),r=await chamar({acao:'checkout_assinatura',fatura})
    expect(r.status).toHaveBeenCalledWith(404)
    expect(fetch.mock.calls.some(([u])=>String(u).includes('/payments/pay_1'))).toBe(false)
  })
  it('sincroniza o pagamento confirmado sem cobrar de novo',async()=>{
    const fetch=montar({status:'CONFIRMED'}),r=await chamar({acao:'pagar_cartao'})
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({pago:true}))
    expect(fetch.mock.calls.some(([u])=>String(u).includes('payWithCreditCard'))).toBe(false)
    expect(fetch.mock.calls.some(([u])=>String(u).includes('processar_pagamento_asaas'))).toBe(true)
  })
  it('fatura ainda não emitida pode ser consultada novamente sem criar outra assinatura',async()=>{
    const fetch=montar({vazio:true}),r=await chamar({acao:'checkout_assinatura'})
    expect(r.status).toHaveBeenCalledWith(409)
    expect(fetch.mock.calls.some(([u,o])=>String(u).includes('asaas.com')&&o.method==='POST')).toBe(false)
  })
  it('recupera tentativa antiga só após consultar fatura ainda pendente no Asaas',async()=>{
    const fetch=montar(),r=await chamar({acao:'checkout_assinatura'})
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({pago:false}))
    const gateway=fetch.mock.calls.findIndex(([u])=>String(u).includes('/subscriptions/sub_1/payments'))
    const liberar=fetch.mock.calls.findIndex(([u,o])=>String(u).includes('pagamento_iniciado_em=lt.')&&o.method==='PATCH')
    expect(liberar).toBeGreaterThan(gateway)
    expect(String(fetch.mock.calls[liberar][0])).toContain('gateway_pagamento_id=eq.pay_1')
  })
})
describe('cartão sem duplicação nem vazamento',()=>{
  it('só uma sessão consegue reservar a fatura antes de pagar',async()=>{
    const fetch=montar({bloqueado:true}),r=await chamar({acao:'pagar_cartao',cartao:cartao(),titular})
    expect(r.status).toHaveBeenCalledWith(409)
    expect(fetch.mock.calls.some(([u])=>String(u).includes('payWithCreditCard'))).toBe(false)
  })
  it('cartão só é enviado ao Asaas e token nunca sai na resposta do checkout',async()=>{
    const fetch=montar(),r=await chamar({acao:'pagar_cartao',cartao:cartao(),titular})
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({pago:true,valor_centavos:19700}))
    expect(JSON.stringify(r.json.mock.calls)).not.toMatch(/token-privado|5162306219378829|318/)
    const requisicao=fetch.mock.calls.find(([u])=>String(u).includes('payWithCreditCard'))!
    expect(JSON.parse(String(requisicao[1].body))).toMatchObject({remoteIp:'203.0.113.10',creditCard:{number:'5162306219378829'}})
    expect(fetch.mock.calls.filter(([u,o])=>String(u).includes('supabase.co')&&String(o.body).includes('5162306219378829'))).toHaveLength(0)
    expect(fetch.mock.calls.some(([u])=>String(u).includes('/subscriptions/sub_1/creditCard'))).toBe(true)
  })
  it('recusa explícita permite corrigir o cartão e tentar novamente',async()=>{
    const fetch=montar({falha:400}),r=await chamar({acao:'pagar_cartao',cartao:cartao(),titular})
    expect(r.status).toHaveBeenCalledWith(400)
    expect(fetch.mock.calls.some(([u,o])=>String(u).includes('assinatura_faturas')&&String(o.body).includes('"pagamento_iniciado_em":null'))).toBe(true)
  })
  it('timeout conserva a reserva para impedir pagamento duplicado',async()=>{
    const fetch=montar({falha:'timeout'}),r=await chamar({acao:'pagar_cartao',cartao:cartao(),titular})
    expect(r.status).toHaveBeenCalledWith(502)
    expect(fetch.mock.calls.some(([u,o])=>String(u).includes('assinatura_faturas')&&String(o.body).includes('"pagamento_iniciado_em":null'))).toBe(false)
  })
})
