import suporteHandler from '../server/suporte.js'
// Criação de usuários pelo master, sem passar pelo cadastro público nem pelo pagamento.
// Cria o login (e-mail já confirmado), e opcionalmente a organização com o plano e o prazo de teste
// escolhidos, com o novo usuário como dono. Tudo com a chave de serviço, depois de conferir que quem
// pediu é master. Fica registrado em admin_audit.
import {ACOES_PUBLICAS,contaPublica} from '../server/conta-emails.js'
import {ErroEmail,emailContaLiberada,emailRedefinirSenha,enviarEmail,montarSmtp,URL_SITE} from '../server/email.js'

const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATA=/^\d{4}-\d{2}-\d{2}$/
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Ficha do cliente no master: editar login, mandar redefinição de senha e mandar a liberação da conta.
const ACOES_MASTER=['editar_usuario','enviar_redefinicao','enviar_liberacao','excluir_usuario']

async function acaoMaster(body,eu,chamar,env,res) {
  const id=String(body.usuario ?? '')
  if(!UUID.test(id)) return res.status(400).json({error:'Usuário inválido'})
  const usuario=await chamar(`/auth/v1/admin/users/${id}`)
  const auditar=(acao,dados)=>chamar('/rest/v1/admin_audit',{method:'POST',body:JSON.stringify({ator:eu.id,acao,alvo:'auth.users',dados:{usuario:id,...dados}})}).catch(()=>{})

  // Exclusão do login, seja cliente ou master. Só não deixa excluir a si mesmo (perderia o acesso no meio da sessão).
  // As tabelas ligadas ao usuário usam "on delete cascade" (vínculos, permissão master, push) ou "set null" (autoria);
  // a organização que fica sem nenhum usuário é excluída pelo banco (trigger org_sem_membros) ou suspensa se tiver financeiro.
  if(body.acao==='excluir_usuario') {
    if(id===eu.id) return res.status(400).json({error:'Você não pode excluir a sua própria conta por aqui.'})
    const [master]=await chamar(`/rest/v1/platform_admins?select=user_id&user_id=eq.${id}`).catch(()=>[])
    await auditar('usuario.excluir',{email:usuario.email,nome:usuario.user_metadata?.nome ?? null,master:!!master})
    await chamar(`/auth/v1/admin/users/${id}`,{method:'DELETE'})
    return res.json({ok:true})
  }

  if(body.acao==='editar_usuario') {
    const mudar={}
    if(body.nome!==undefined) {
      const nome=String(body.nome).trim()
      if(nome.length<2 || nome.length>120) return res.status(400).json({error:'Informe o nome (2 a 120 caracteres)'})
      mudar.user_metadata={...(usuario.user_metadata ?? {}),nome}
    }
    if(body.email!==undefined) {
      const email=String(body.email).trim().toLowerCase()
      if(!EMAIL.test(email) || email.length>254) return res.status(400).json({error:'E-mail inválido'})
      // Troca direta pelo master: já confirmado, sem e-mail de confirmação no endereço antigo.
      if(email!==usuario.email) { mudar.email=email; mudar.email_confirm=true }
    }
    if(body.confirmar_email===true) mudar.email_confirm=true
    if(body.senha!==undefined) {
      const senha=String(body.senha)
      if(senha.length<8 || senha.length>72) return res.status(400).json({error:'A senha precisa ter de 8 a 72 caracteres'})
      mudar.password=senha
    }
    if(!Object.keys(mudar).length) return res.status(400).json({error:'Nada para alterar'})
    try { await chamar(`/auth/v1/admin/users/${id}`,{method:'PUT',body:JSON.stringify(mudar)}) }
    catch(e) { if(e.status===422 || /already|registered|exists/i.test(e.message)) return res.status(409).json({error:'Já existe um usuário com esse e-mail'}); throw e }
    await auditar('usuario.editar',{nome:mudar.user_metadata?.nome ?? null,email:mudar.email ?? null,senha:!!mudar.password,confirmou:!!mudar.email_confirm})
    return res.json({ok:true})
  }

  // Os dois envios usam o SMTP da plataforma (Master → Integrações).
  const [linha]=await chamar('/rest/v1/plataforma_email?select=*&id=eq.smtp')
  const cfg=montarSmtp(linha,env)
  if(!cfg?.ativo) return res.status(503).json({error:'Configure e ative o e-mail da plataforma em Integrações antes de enviar.'})
  const linkSenha=async()=>{
    const l=await chamar('/auth/v1/admin/generate_link',{method:'POST',body:JSON.stringify({type:'recovery',email:usuario.email})})
    return l?.hashed_token?`${URL_SITE}/redefinir-senha?token_hash=${encodeURIComponent(l.hashed_token)}&type=recovery`:null
  }
  const nome=usuario.user_metadata?.nome

  if(body.acao==='enviar_redefinicao') {
    const url=await linkSenha()
    if(!url) return res.status(502).json({error:'Não foi possível gerar o link de redefinição agora.'})
    try { await enviarEmail(cfg,{para:usuario.email,...emailRedefinirSenha({nome,url})}) } catch(e) { return res.status(502).json({error:e instanceof ErroEmail?e.message:'Falha ao enviar o e-mail'}) }
    await auditar('usuario.redefinicao_enviada',{email:usuario.email})
    return res.json({ok:true,para:usuario.email})
  }

  // enviar_liberacao: e-mail "conta liberada" com os dados de acesso; com com_senha, inclui o link para criar a senha.
  if(!UUID.test(String(body.org ?? ''))) return res.status(400).json({error:'Organização inválida'})
  const [org]=await chamar(`/rest/v1/organizations?select=nome,trial_ate,plano&id=eq.${body.org}`)
  if(!org) return res.status(404).json({error:'Organização não encontrada'})
  if(!usuario.email_confirmed_at) await chamar(`/auth/v1/admin/users/${id}`,{method:'PUT',body:JSON.stringify({email_confirm:true})})
  const urlSenha=body.com_senha?await linkSenha():null
  const [assinatura]=await chamar(`/rest/v1/assinaturas?select=pago_ate&org_id=eq.${body.org}&status=in.(ativa,atrasada)&order=pago_ate.desc.nullslast&limit=1`).catch(()=>[])
  const ate=assinatura?.pago_ate ?? (org.plano==='trial'?org.trial_ate:null)
  try { await enviarEmail(cfg,{para:usuario.email,...emailContaLiberada({nome,email:usuario.email,organizacao:org.nome,ate,urlSenha})}) } catch(e) { return res.status(502).json({error:e instanceof ErroEmail?e.message:'Falha ao enviar o e-mail'}) }
  await auditar('usuario.liberacao_enviada',{email:usuario.email,org:body.org,com_senha:!!urlSenha})
  return res.json({ok:true,para:usuario.email})
}

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
  if(['suporte_abrir','suporte_responder','suporte_atualizar'].includes(pedido.acao)) return suporteHandler({method:req.method,headers:req.headers,body:{...pedido,acao:pedido.acao.slice(8)}},res)
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
    // Token de uma sessão já encerrada no servidor: 401 para o app renovar o login e tentar de novo.
    let eu
    try { eu=await chamar('/auth/v1/user',{},false) }
    catch(e) { if(e.status===401 || e.status===403) return res.status(401).json({error:'Sua sessão expirou. Entre novamente.'}); throw e }
    const admin=await chamar('/rest/v1/rpc/is_platform_admin',{method:'POST',body:'{}'},false)
    if(admin!==true) return res.status(403).json({error:'Acesso restrito ao master'})

    const body=typeof req.body==='string'?JSON.parse(req.body):req.body ?? {}
    if(ACOES_MASTER.includes(body.acao)) return await acaoMaster(body,eu,chamar,env,res)
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
