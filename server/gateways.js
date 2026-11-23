// Somente servidor: checkouts hospedados; dados de cartão não passam pelo LicitaForce.
export const GATEWAYS = ['stripe', 'asaas', 'mercadopago', 'infinitepay']
const VARS = {stripe:['STRIPE_SECRET_KEY'],asaas:['ASAAS_API_KEY'],mercadopago:['MERCADOPAGO_ACCESS_TOKEN'],infinitepay:['INFINITEPAY_API_KEY','INFINITEPAY_HANDLE']}
export function configuracao(env) {
  const ativos=(env.PAYMENTS_ENABLED_PROVIDERS ?? '').split(',').map(x=>x.trim())
  return GATEWAYS.map(id=>({id,credenciais:VARS[id].every(k=>!!env[k]),habilitado:ativos.includes(id),configurado:!!env.BILLING_PUBLIC_URL && !!env.SUPABASE_SERVICE_ROLE_KEY && !!(env.SUPABASE_URL || env.VITE_SUPABASE_URL)}))
}
async function chamar(url, options={}) {
  const r=await fetch(url,{...options,signal:AbortSignal.timeout(15000)})
  if(!r.ok) throw new Error(`Gateway respondeu ${r.status}. Consulte a transação no provedor antes de tentar outra cobrança.`)
  return r.json()
}
const asaasBase=env=>env.ASAAS_ENV==='production'?'https://api.asaas.com/v3':'https://api-sandbox.asaas.com/v3'
export async function criarCheckout(c,env) {
  const url=new URL('/cobrancas',env.BILLING_PUBLIC_URL).href
  if(c.gateway==='stripe') {
    const body=new URLSearchParams({mode:'payment',success_url:url,cancel_url:url,client_reference_id:c.id,'metadata[cobranca_id]':c.id,'line_items[0][quantity]':'1','line_items[0][price_data][currency]':'brl','line_items[0][price_data][unit_amount]':String(c.valor_centavos),'line_items[0][price_data][product_data][name]':c.descricao})
    const r=await chamar('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':c.id},body})
    return {gateway_id:r.id,checkout_url:r.url}
  }
  if(c.gateway==='asaas') {
    const r=await chamar(asaasBase(env)+'/paymentLinks',{method:'POST',headers:{access_token:env.ASAAS_API_KEY,'Content-Type':'application/json','User-Agent':'LicitaForce'},body:JSON.stringify({name:c.descricao,value:c.valor_centavos/100,billingType:'UNDEFINED',chargeType:'DETACHED',dueDateLimitDays:3,externalReference:c.id,limit:1,endDate:c.vencimento})})
    return {gateway_id:r.id,checkout_url:r.url}
  }
  if(c.gateway==='mercadopago') {
    const r=await chamar('https://api.mercadopago.com/checkout/preferences',{method:'POST',headers:{Authorization:`Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,'Content-Type':'application/json','X-Idempotency-Key':c.id},body:JSON.stringify({items:[{id:c.id,title:c.descricao,quantity:1,currency_id:'BRL',unit_price:c.valor_centavos/100}],external_reference:c.id,back_urls:{success:url,pending:url,failure:url}})})
    return {gateway_id:r.id,checkout_url:env.MERCADOPAGO_ENV==='production'?r.init_point:r.sandbox_init_point}
  }
  if(c.gateway==='infinitepay') {
    const r=await chamar('https://api.checkout.infinitepay.io/links',{method:'POST',headers:{'X-Api-Key':env.INFINITEPAY_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({handle:env.INFINITEPAY_HANDLE,order_nsu:c.id,redirect_url:url,items:[{quantity:1,price:c.valor_centavos,description:c.descricao}]})})
    return {gateway_id:c.id,checkout_url:r.url}
  }
  throw new Error('Provedor inválido')
}

export async function consultarPagamento(c,env,retorno={}) {
  const valor=c.valor_centavos
  if(c.gateway==='stripe') {
    const r=await chamar(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(c.gateway_id)}`,{headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`}})
    return r.payment_status==='paid' && r.amount_total===valor && r.currency==='brl' && r.client_reference_id===c.id
  }
  if(c.gateway==='asaas') {
    const r=await chamar(asaasBase(env)+'/payments?limit=100&externalReference='+encodeURIComponent(c.id),{headers:{access_token:env.ASAAS_API_KEY,'User-Agent':'LicitaForce'}})
    return (r.data ?? []).some(p=>p.externalReference===c.id && p.paymentLink===c.gateway_id && ['RECEIVED','CONFIRMED'].includes(p.status) && Math.round(Number(p.value)*100)===valor)
  }
  if(c.gateway==='mercadopago') {
    const r=await chamar('https://api.mercadopago.com/v1/payments/search?external_reference='+encodeURIComponent(c.id),{headers:{Authorization:`Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`}})
    return (r.results ?? []).some(p=>p.external_reference===c.id && p.status==='approved' && p.currency_id==='BRL' && Math.round(Number(p.transaction_amount)*100)===valor)
  }
  if(c.gateway==='infinitepay') {
    if(!retorno.transaction_nsu || !retorno.slug) throw new Error('Informe transaction_nsu e slug do retorno ou comprovante da InfinitePay.')
    const r=await chamar('https://api.checkout.infinitepay.io/payment_check',{method:'POST',headers:{'X-Api-Key':env.INFINITEPAY_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({handle:env.INFINITEPAY_HANDLE,order_nsu:c.id,transaction_nsu:retorno.transaction_nsu,slug:retorno.slug})})
    return r.success===true && r.paid===true && r.amount===valor
  }
  throw new Error('Provedor inválido')
}
