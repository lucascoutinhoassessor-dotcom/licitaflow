// Webhook do Asaas. Configure em Asaas → Integrações → Webhooks com a URL e o token exibidos no master.
// Idempotente: cada evento é gravado uma vez (id do evento); reenvios do Asaas são ignorados com 200.
import {decifrar,mesmoToken} from '../server/asaas.js'

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store')
  if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'})
  const env=process.env
  const base=env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const chave=env.SUPABASE_SERVICE_ROLE_KEY
  if(!base || !chave) return res.status(503).json({error:'Servidor sem configuração do banco'})
  async function sv(path,options={}) {
    const r=await fetch(base+path,{...options,headers:{apikey:chave,Authorization:`Bearer ${chave}`,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(15000)})
    if(!r.ok) { const e=new Error('Falha no banco ('+r.status+')'); e.status=r.status; throw e }
    return r.status===204?null:r.json()
  }
  try {
    const [g]=await sv('/rest/v1/plataforma_gateways?select=webhook_token_cifrado&id=eq.asaas')
    const esperado=g?.webhook_token_cifrado?decifrar(g.webhook_token_cifrado,env):env.ASAAS_WEBHOOK_TOKEN
    if(!mesmoToken(req.headers['asaas-access-token'],esperado)) return res.status(401).json({error:'Token inválido'})
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body ?? {}
    const evento=String(body.event ?? '')
    if(!evento) return res.status(400).json({error:'Evento ausente'})
    const id=String(body.id ?? `${evento}:${body.payment?.id ?? body.subscription?.id ?? ''}:${body.dateCreated ?? ''}`).slice(0,200)
    const gravado=await sv('/rest/v1/gateway_eventos?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({id,evento,payload:body})})
    if(!gravado?.length) return res.json({recebido:true,duplicado:true})
    let resultado='ignorado'
    try {
      if(evento.startsWith('PAYMENT_') && body.payment) {
        resultado=await sv('/rest/v1/rpc/processar_pagamento_asaas',{method:'POST',body:JSON.stringify({p_evento:evento,p_pagamento:body.payment})})
      } else if(['SUBSCRIPTION_DELETED','SUBSCRIPTION_INACTIVATED'].includes(evento) && body.subscription?.id) {
        resultado=await sv('/rest/v1/rpc/encerrar_assinatura_gateway',{method:'POST',body:JSON.stringify({p_gateway_id:body.subscription.id,p_motivo:evento==='SUBSCRIPTION_DELETED'?'Excluída no Asaas':'Inativada no Asaas'})})
      }
    } catch(e) {
      // Desfaz o registro para que o reenvio do Asaas seja processado.
      await sv('/rest/v1/gateway_eventos?id=eq.'+encodeURIComponent(id),{method:'DELETE'}).catch(()=>{})
      throw e
    }
    await sv('/rest/v1/gateway_eventos?id=eq.'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({resultado:String(resultado).slice(0,200)})}).catch(()=>{})
    // Sempre 200 para eventos válidos: o Asaas pausa a fila depois de erros repetidos.
    return res.json({recebido:true,resultado})
  } catch(e) {
    return res.status(500).json({error:'Falha ao processar o evento'})
  }
}
