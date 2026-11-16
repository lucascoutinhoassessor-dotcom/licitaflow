import {configuracao,criarCheckout,consultarPagamento} from '../server/gateways.js'

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store')
  if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'})
  const env=process.env
  const base=env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const anon=env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
  const token=req.headers.authorization
  if(!base || !anon) return res.status(503).json({error:'Configuração Supabase ausente no servidor'})
  if(!/^Bearer \S+$/.test(token ?? '')) return res.status(401).json({error:'Entre na sua conta'})
  const headers={apikey:anon,Authorization:token,'Content-Type':'application/json'}
  async function banco(path,options={},service=false) {
    const h=service?{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'}:headers
    const r=await fetch(base+path,{...options,headers:{...h,...options.headers},signal:AbortSignal.timeout(15000)})
    if(!r.ok) { const erro=new Error('Falha ao consultar ou gravar a cobrança no banco'); erro.status=r.status; throw erro }
    return r.status===204?null:r.json()
  }
  try {
    const admin=await banco('/rest/v1/rpc/is_platform_admin',{method:'POST',body:'{}'})
    if(admin!==true) return res.status(403).json({error:'Acesso restrito ao master'})
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body ?? {}
    const cfg=configuracao(env)
    if(body.acao==='configuracao') return res.json({gateways:cfg})
    if(!['checkout','verificar'].includes(body.acao) || !/^[0-9a-f-]{36}$/i.test(body.id ?? '')) return res.status(400).json({error:'Ação ou cobrança inválida'})
    const [c]=await banco('/rest/v1/plataforma_cobrancas?select=*&id=eq.'+body.id)
    if(!c) return res.status(404).json({error:'Cobrança não encontrada'})
    const g=cfg.find(x=>x.id===c.gateway)
    if(!g?.habilitado || !g.credenciais || !g.configurado) return res.status(503).json({error:'Provedor ainda não ativado. Configure as credenciais no servidor e habilite o gateway.'})
    const patch=(dados,filtro='')=>banco('/rest/v1/plataforma_cobrancas?id=eq.'+c.id+filtro,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(dados)},true)
    if(body.acao==='checkout') {
      if(c.checkout_url) return res.json({url:c.checkout_url})
      if(c.status!=='rascunho') return res.status(409).json({error:'Esta cobrança já foi processada. Confira no provedor antes de emitir outra.'})
      if(c.vencimento<new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})) return res.status(400).json({error:'Cobrança vencida. Emita uma nova cobrança.'})
      const reservado=await patch({status:'gerando'},'&status=eq.rascunho')
      if(!reservado?.length) return res.status(409).json({error:'Cobrança em processamento em outra sessão'})
      try {
        const resultado=await criarCheckout(c,env)
        if(!resultado.gateway_id || !resultado.checkout_url?.startsWith('https://')) throw new Error('Resposta de checkout inválida')
        await patch({...resultado,status:'pendente'},'&status=eq.gerando')
        return res.json({url:resultado.checkout_url})
      } catch(e) {
        await patch({status:'revisao'},'&status=eq.gerando')
        throw e
      }
    }
    if(!c.gateway_id) return res.status(409).json({error:'Gere o checkout antes de verificar'})
    if(c.status==='paga') return res.json({pago:true})
    const pago=await consultarPagamento(c,env,{transaction_nsu:String(body.transaction_nsu ?? '').slice(0,200),slug:String(body.slug ?? '').slice(0,200)})
    await patch({verificado_em:new Date().toISOString(),...(pago?{status:'paga',confirmado_em:new Date().toISOString()}:{})})
    return res.json({pago})
  } catch(e) {
    return res.status(e.status===401?401:502).json({error:e.message || 'Falha na integração de pagamentos'})
  }
}
