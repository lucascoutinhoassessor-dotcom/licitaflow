// Criação de usuários pelo master, sem passar pelo cadastro público nem pelo pagamento.
// Cria o login (e-mail já confirmado), e opcionalmente a organização com o plano e o prazo de teste
// escolhidos, com o novo usuário como dono. Tudo com a chave de serviço, depois de conferir que quem
// pediu é master. Fica registrado em admin_audit.
import {ACOES_PUBLICAS,contaPublica} from '../server/conta-emails.js'
import {ErroEmail} from '../server/email.js'

const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATA=/^\d{4}-\d{2}-\d{2}$/

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store')
  if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'})
  const env=process.env
  const base=env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const anon=env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
  const servico=env.SUPABASE_SERVICE_ROLE_KEY
  const token=req.headers.authorization
  // Cadastro e "esqueci minha senha" com e-mail da plataforma: públicos (sem login).
  const pedido=typeof req.body==='string'?(()=>{try{return JSON.parse(req.body)}catch{return {}}})():req.body ?? {}
  if(ACOES_PUBLICAS.includes(pedido.acao)) {
    try { return await contaPublica(pedido,req,res,env) }
    catch(e) { return res.status(502).json({error:e instanceof ErroEmail?e.message:'Não foi possível enviar o e-mail agora. Tente de novo em instantes.'}) }
  }
  if(!base || !anon || !servico) return res.status(503).json({error:'Configuração Supabase ausente no servidor'})
  if(!/^Bearer \S+$/.test(token ?? '')) return res.status(401).json({error:'Entre na sua conta'})

  async function chamar(path,options={},comServico=true) {
    const h=comServico?{apikey:servico,Authorization:`Bearer ${servico}`}:{apikey:anon,Authorization:token}
    const r=await fetch(base+path,{...options,headers:{'Content-Type':'application/json',...h,...options.headers},signal:AbortSignal.timeout(15000)})
    let json=null
    try { json=await r.json() } catch { /* resposta sem corpo */ }
    if(!r.ok) { const e=new Error(json?.msg || json?.message || json?.error_description || 'Falha ao gravar no banco'); e.status=r.status; e.codigo=json?.error_code || json?.code; throw e }
    return json
  }

  let criado=null, orgId=null
  try {
    const eu=await chamar('/auth/v1/user',{},false)
    const admin=await chamar('/rest/v1/rpc/is_platform_admin',{method:'POST',body:'{}'},false)
    if(admin!==true) return res.status(403).json({error:'Acesso restrito ao master'})

    const body=typeof req.body==='string'?JSON.parse(req.body):req.body ?? {}
    const email=String(body.email ?? '').trim().toLowerCase()
    const nome=String(body.nome ?? '').trim()
    const senha=String(body.senha ?? '')
    if(!EMAIL.test(email) || email.length>254) return res.status(400).json({error:'E-mail inválido'})
    if(nome.length<2 || nome.length>120) return res.status(400).json({error:'Informe o nome (2 a 120 caracteres)'})
    if(senha.length<8 || senha.length>72) return res.status(400).json({error:'A senha precisa ter de 8 a 72 caracteres'})

    const o=body.org
    let org=null
    if(o) {
      org={nome:String(o.nome ?? '').trim(),tipo:o.tipo==='assessoria'?'assessoria':'fornecedor',plano:String(o.plano ?? 'trial')}
      if(org.nome.length<2 || org.nome.length>120) return res.status(400).json({error:'Nome da organização: 2 a 120 caracteres'})
      if(!/^[a-z0-9_]{3,40}$/.test(org.plano)) return res.status(400).json({error:'Plano inválido'})
      if(o.trial_ate) { if(!DATA.test(o.trial_ate)) return res.status(400).json({error:'Data do teste inválida'}); org.trial_ate=o.trial_ate }
      const planos=await chamar(`/rest/v1/plataforma_planos?select=id&id=eq.${org.plano}`)
      if(!planos.length) return res.status(400).json({error:'Plano não encontrado'})
    }

    try {
      criado=await chamar('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email,password:senha,email_confirm:true,user_metadata:{nome}})})
    } catch(e) {
      if(e.status===422 || /already|registered|exists/i.test(e.message)) return res.status(409).json({error:'Já existe um usuário com esse e-mail'})
      throw e
    }

    if(org) {
      const [linha]=await chamar('/rest/v1/organizations',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({...org,created_by:criado.id})})
      orgId=linha.id
      await chamar('/rest/v1/memberships',{method:'POST',body:JSON.stringify({org_id:orgId,user_id:criado.id,papel:'owner'})})
    }
    await chamar('/rest/v1/admin_audit',{method:'POST',body:JSON.stringify({ator:eu.id,acao:'usuario.criar',alvo:'auth.users',dados:{usuario:criado.id,email,org:orgId,plano:org?.plano ?? null}})}).catch(()=>{})
    return res.json({ok:true,usuario:criado.id,org:orgId})
  } catch(e) {
    // Desfaz o login se a organização não pôde ser criada, para não deixar usuário pela metade.
    if(orgId) await chamar(`/rest/v1/organizations?id=eq.${orgId}`,{method:'DELETE'}).catch(()=>{})
    if(criado?.id) await chamar(`/auth/v1/admin/users/${criado.id}`,{method:'DELETE'}).catch(()=>{})
    return res.status(e.status && e.status<500?400:500).json({error:e.message || 'Falha ao criar o usuário'})
  }
}
