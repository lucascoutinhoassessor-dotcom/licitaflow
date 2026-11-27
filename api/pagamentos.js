import {ABERTOS,PAGOS,dadosCartao,apresentarPagamento} from '../server/checkout.js'
import {configuracao,criarCheckout,consultarPagamento} from '../server/gateways.js'
import {asaas,cifrar,corpoAssinatura,ErroAsaas,hojeSP,montarConfig} from '../server/asaas.js'
import {emailCupomAcesso,emailTeste,enviarEmail,montarSmtp} from '../server/email.js'

export const config={maxDuration:120}

const UUID=/^[0-9a-f-]{36}$/i
// Ações que dono/administrador da organização pode pedir; o restante é exclusivo do master.
const ACOES_CLIENTE=['assinar','trocar_plano','cancelar_assinatura','conferir_cupom','resgatar_cupom','checkout_assinatura','pagar_cartao']

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
    if(service && !env.SUPABASE_SERVICE_ROLE_KEY) { const e=new Error('Chave de serviço do Supabase ausente no servidor'); e.status=503; throw e }
    const h=service?{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'}:headers
    const r=await fetch(base+path,{...options,headers:{...h,...options.headers},signal:AbortSignal.timeout(15000)})
    if(!r.ok) {
      let msg='Falha ao consultar ou gravar no banco'
      try { const j=await r.json(); if(j?.message && !service) msg=j.message } catch { /* resposta sem JSON */ }
      const erro=new Error(msg); erro.status=r.status; throw erro
    }
    return r.status===204?null:r.json()
  }
  const rpc=(nome,args={},service=false)=>banco('/rest/v1/rpc/'+nome,{method:'POST',body:JSON.stringify(args)},service)
  const sv=(path,options={})=>banco(path,options,true)
  const patchSv=(path,dados)=>sv(path,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(dados)})
  async function carregarAsaas() {
    const [linha]=await sv('/rest/v1/plataforma_gateways?select=*&id=eq.asaas')
    return {linha,cfg:montarConfig(linha,env)}
  }

  try {
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body ?? {}
    const admin=(await rpc('is_platform_admin'))===true
    if(!admin && !ACOES_CLIENTE.includes(body.acao)) return res.status(403).json({error:'Acesso restrito ao master'})

    // ------------------------------------------------------------------ Asaas pelo painel
    if(body.acao==='asaas_salvar') {
      const dados={updated_at:new Date().toISOString()}
      if(typeof body.ativo==='boolean') dados.ativo=body.ativo
      if(['sandbox','production'].includes(body.ambiente)) dados.ambiente=body.ambiente
      const chave=String(body.api_key ?? '').trim(), tk=String(body.webhook_token ?? '').trim()
      if(chave) { if(chave.length<20 || chave.length>500) return res.status(400).json({error:'Chave do Asaas inválida'}); dados.api_key_cifrada=cifrar(chave,env); dados.conta_nome=null; dados.testado_em=null }
      if(tk) { if(tk.length<16 || tk.length>255) return res.status(400).json({error:'O token do webhook precisa ter entre 16 e 255 caracteres'}); dados.webhook_token_cifrado=cifrar(tk,env) }
      const {linha}=await carregarAsaas()
      if(dados.ativo && !dados.api_key_cifrada && !linha?.api_key_cifrada) return res.status(400).json({error:'Cadastre a chave antes de ativar'})
      await patchSv('/rest/v1/plataforma_gateways?id=eq.asaas',dados)
      return res.json({ok:true})
    }
    if(body.acao==='asaas_testar') {
      const {cfg}=await carregarAsaas()
      const saldo=await asaas(cfg,'/finance/balance')
      let nome=null
      try { const info=await asaas(cfg,'/myAccount/commercialInfo'); nome=info.companyName || info.name || null } catch { /* conta sem permissão para dados comerciais */ }
      if(cfg.origem==='painel') await patchSv('/rest/v1/plataforma_gateways?id=eq.asaas',{conta_nome:nome,testado_em:new Date().toISOString()})
      return res.json({ok:true,ambiente:cfg.ambiente,saldo:saldo.balance ?? null,conta:nome,origem:cfg.origem})
    }

    // ------------------------------------------------------------------ E-mail da plataforma (SMTP)
    // Padrão Gmail + senha de app. Com conta e senha salvas, o envio fica ativo (sem botão separado).
    if(body.acao==='email_salvar') {
      const [linha]=await sv('/rest/v1/plataforma_email?select=*&id=eq.smtp')
      const usuario=String(body.usuario ?? linha?.usuario ?? '').trim().toLowerCase()
      const host=(String(body.host ?? '').trim().toLowerCase() || linha?.host || 'smtp.gmail.com')
      const porta=Number(body.porta || linha?.porta || 465)
      const senha=String(body.senha ?? '').replace(/\s+/g,'') // a senha de app do Google vem com espaços
      const nome=String(body.remetente_nome ?? '').trim().slice(0,80) || linha?.remetente_nome || 'LicitaForce'
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(usuario) || usuario.length>254) return res.status(400).json({error:'Informe o e-mail que vai enviar (ex.: contato.licitaforce@gmail.com)'})
      if(!/^[a-z0-9.-]{3,253}$/.test(host)) return res.status(400).json({error:'Servidor SMTP inválido'})
      if(![25,465,587,2525].includes(porta)) return res.status(400).json({error:'Porta deve ser 465 ou 587'})
      if(senha.length>500) return res.status(400).json({error:'Senha inválida'})
      if(linha?.usuario && linha.usuario!==usuario && !senha) return res.status(400).json({error:'Informe a senha de app do novo e-mail'})
      const dados={usuario,host,porta,remetente_nome:nome,remetente_email:usuario,boas_vindas:true,updated_at:new Date().toISOString()}
      if(senha) { dados.senha_cifrada=cifrar(senha,env); dados.testado_em=null }
      dados.ativo=!!(senha || linha?.senha_cifrada)
      await patchSv('/rest/v1/plataforma_email?id=eq.smtp',dados)
      return res.json({ok:true,configurado:dados.ativo})
    }
    if(body.acao==='email_testar') {
      const [[linha],eu]=await Promise.all([sv('/rest/v1/plataforma_email?select=*&id=eq.smtp'),banco('/auth/v1/user')])
      const cfg=montarSmtp(linha,env)
      if(!cfg) return res.status(400).json({error:'Salve o e-mail e a senha de app antes de testar'})
      const para=String(body.para ?? '').trim() || eu?.email
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para ?? '')) return res.status(400).json({error:'E-mail de destino inválido'})
      try { await enviarEmail(cfg,{para,...emailTeste()}) }
      catch(e) { return res.status(400).json({error:e.message}) }
      await patchSv('/rest/v1/plataforma_email?id=eq.smtp',{testado_em:new Date().toISOString()})
      return res.json({ok:true,para})
    }

    // ------------------------------------------------------------------ Cupons
    if(body.acao==='conferir_cupom') {
      if(!UUID.test(body.org ?? '')) return res.status(400).json({error:'Organização inválida'})
      try { return res.json(await rpc('conferir_cupom',{p_codigo:String(body.codigo ?? ''),p_org:body.org,p_plano:body.plano?String(body.plano):null})) }
      catch(e) { return res.status(400).json({error:e.message}) }
    }
    if(body.acao==='resgatar_cupom') {
      if(!UUID.test(body.org ?? '')) return res.status(400).json({error:'Organização inválida'})
      let r
      try { r=await rpc('resgatar_cupom_dias',{p_codigo:String(body.codigo ?? ''),p_org:body.org}) }
      catch(e) { return res.status(400).json({error:e.message}) }
      // Confirma o acesso no e-mail cadastrado. Sem SMTP configurado, o cupom vale do mesmo jeito.
      let emailEnviado=false
      try {
        const [[linha],eu]=await Promise.all([sv('/rest/v1/plataforma_email?select=*&id=eq.smtp'),banco('/auth/v1/user')])
        const cfg=montarSmtp(linha,env)
        if(cfg?.ativo && eu?.email) {
          await enviarEmail(cfg,{para:eu.email,...emailCupomAcesso({nome:eu.user_metadata?.nome,email:eu.email,organizacao:r.organizacao,codigo:r.codigo,dias:r.valor,ate:r.ate})})
          emailEnviado=true
        }
      } catch { /* e-mail é complemento */ }
      return res.json({...r,emailEnviado})
    }

    // Checkout da organização: autorização antes de acessar o gateway ou cobrar.
    if(['checkout_assinatura','pagar_cartao'].includes(body.acao)) {
      if(!UUID.test(body.id ?? '') || (body.fatura && !UUID.test(body.fatura))) return res.status(400).json({error:'Assinatura ou fatura inválida'})
      const [a]=await sv('/rest/v1/assinaturas?select=*&id=eq.'+body.id)
      if(!a) return res.status(404).json({error:'Assinatura não encontrada'})
      if(!admin && (await rpc('pode_gerir_cobranca',{p_org:a.org_id}))!==true) return res.status(403).json({error:'Somente o dono ou administrador pode acessar o checkout'})
      if(a.status==='cancelada') return res.status(409).json({error:'Assinatura cancelada'})
      if(!a.gateway_assinatura_id) return res.status(409).json({error:'Assinatura em processamento. Aguarde e atualize.'})
      const {cfg}=await carregarAsaas()
      let pagamento
      if(body.fatura) {
        const [f]=await sv('/rest/v1/assinatura_faturas?select=*&id=eq.'+body.fatura+'&assinatura_id=eq.'+a.id)
        if(!f) return res.status(404).json({error:'Fatura não encontrada nesta assinatura'})
        pagamento=await asaas(cfg,'/payments/'+encodeURIComponent(f.gateway_pagamento_id))
      } else {
        const lista=await asaas(cfg,'/subscriptions/'+encodeURIComponent(a.gateway_assinatura_id)+'/payments?limit=100')
        const ordenada=(lista.data ?? []).sort((x,y)=>String(x.dueDate).localeCompare(String(y.dueDate)))
        pagamento=ordenada.find(p=>ABERTOS.includes(p.status)) ?? ordenada.filter(p=>PAGOS.includes(p.status)).at(-1)
      }
      if(!pagamento) return res.status(409).json({error:'A primeira fatura ainda está sendo emitida. Atualize em instantes.'})
      if(pagamento.subscription!==a.gateway_assinatura_id) return res.status(409).json({error:'Fatura não pertence à assinatura'})
      await rpc('processar_pagamento_asaas',{p_evento:'SYNC',p_pagamento:pagamento},true)
      // Após timeout, só libera nova tentativa depois de consultar o gateway e aguardar a requisição anterior encerrar.
      if(body.acao==='checkout_assinatura' && pagamento.status==='PENDING') {
        const limite=new Date(Date.now()-120000).toISOString()
        await patchSv('/rest/v1/assinatura_faturas?gateway_pagamento_id=eq.'+encodeURIComponent(pagamento.id)+'&pagamento_iniciado_em=lt.'+encodeURIComponent(limite),{pagamento_iniciado_em:null})
      }
      let avisoRecorrencia=null
      if(body.acao==='pagar_cartao' && !PAGOS.includes(pagamento.status)) {
        if(!cfg?.ativo) return res.status(503).json({error:'Pagamentos estão desativados pela plataforma'})
        if(!ABERTOS.includes(pagamento.status) || !['UNDEFINED','CREDIT_CARD'].includes(pagamento.billingType)) return res.status(409).json({error:'Esta fatura não aceita pagamento por cartão'})
        const cartao=dadosCartao(body,req)
        const [f]=await patchSv('/rest/v1/assinatura_faturas?gateway_pagamento_id=eq.'+encodeURIComponent(pagamento.id)+'&pagamento_iniciado_em=is.null',{pagamento_iniciado_em:new Date().toISOString()})
        if(!f) return res.status(409).json({error:'Já existe uma tentativa em processamento. Atualize para conferir o pagamento antes de tentar novamente.'})
        try {
          pagamento=await asaas(cfg,'/payments/'+encodeURIComponent(pagamento.id)+'/payWithCreditCard',{method:'POST',body:cartao,timeout:65000})
        } catch(e) {
          // Uma recusa explícita pode ser corrigida. Timeout ou 5xx mantêm a trava até conciliação.
          if(e instanceof ErroAsaas && e.status===400) await patchSv('/rest/v1/assinatura_faturas?id=eq.'+f.id,{pagamento_iniciado_em:null})
          throw e
        }
        await rpc('processar_pagamento_asaas',{p_evento:'SYNC',p_pagamento:pagamento},true)
        // O cartão tokenizado no Asaas será usado nas próximas cobranças da assinatura.
        if(PAGOS.includes(pagamento.status)) {
          try {
            await asaas(cfg,'/subscriptions/'+encodeURIComponent(a.gateway_assinatura_id)+'/creditCard',{method:'PUT',body:pagamento.creditCard?.creditCardToken?{creditCardToken:pagamento.creditCard.creditCardToken,remoteIp:cartao.remoteIp}:cartao,timeout:15000})
          } catch {
            avisoRecorrencia='Pagamento confirmado. Fale com o suporte para conferir o cartão das próximas cobranças.'
            await patchSv('/rest/v1/assinaturas?id=eq.'+a.id,{erro:'Pagamento processado; conferir cartão da recorrência no Asaas.'}).catch(()=>{})
          }
        }
      }
      const checkout=await apresentarPagamento(cfg,pagamento,body.codigos!==false)
      if(avisoRecorrencia) checkout.aviso=avisoRecorrencia
      return res.json(checkout)
    }

    // ------------------------------------------------------------------ Assinaturas recorrentes
    if(body.acao==='assinar') {
      if(!UUID.test(body.org ?? '')) return res.status(400).json({error:'Organização inválida'})
      const {cfg}=await carregarAsaas()
      if(!cfg?.ativo) return res.status(503).json({error:'Pagamentos ainda não ativados pela plataforma. Fale com o atendimento.'})
      // Cupom de desconto: confere antes de preparar o pedido (código errado não deixa pedido pela metade).
      let cupom=null
      if(String(body.cupom ?? '').trim()) {
        try { cupom=await rpc('conferir_cupom',{p_codigo:String(body.cupom),p_org:body.org,p_plano:String(body.plano ?? '')}) }
        catch(e) { return res.status(400).json({error:e.message}) }
        if(cupom.tipo==='dias') return res.status(400).json({error:'Este cupom é de dias de acesso: use-o em “Tenho um cupom”.'})
      }
      const id=await rpc('preparar_assinatura',{p_org:body.org,p_plano:String(body.plano ?? ''),p_ciclo:String(body.ciclo ?? ''),p_forma:String(body.forma ?? 'UNDEFINED'),p_documento:String(body.documento ?? '')})
      let [a]=await patchSv(`/rest/v1/assinaturas?id=eq.${id}&reservado_em=is.null`,{reservado_em:new Date().toISOString()})
      if(!a) return res.status(409).json({error:'Pedido em processamento em outra sessão'})
      if(cupom) {
        const desconto=cupom.tipo==='percentual'?Math.round(a.valor_centavos*cupom.valor/100):cupom.valor
        ;[a]=await patchSv(`/rest/v1/assinaturas?id=eq.${a.id}`,{valor_centavos:Math.max(100,a.valor_centavos-desconto)})
      }
      let criada=null
      try {
        const [[org],[plano],anteriores,usuario]=await Promise.all([
          sv(`/rest/v1/organizations?select=id,nome&id=eq.${a.org_id}`),
          sv(`/rest/v1/plataforma_planos?select=nome&id=eq.${a.plano_id}`),
          sv(`/rest/v1/assinaturas?select=gateway_cliente_id&org_id=eq.${a.org_id}&documento=eq.${a.documento}&gateway_cliente_id=not.is.null&limit=1`),
          banco('/auth/v1/user'),
        ])
        let cliente=anteriores[0]?.gateway_cliente_id
        if(!cliente) {
          const c=await asaas(cfg,'/customers',{method:'POST',body:{name:org.nome,cpfCnpj:a.documento,email:usuario?.email || undefined,externalReference:a.org_id,notificationDisabled:false}})
          cliente=c.id
        }
        criada=await asaas(cfg,'/subscriptions',{method:'POST',body:corpoAssinatura(a,cliente,plano?.nome ?? a.plano_id)})
        const pagamentos=await asaas(cfg,`/subscriptions/${encodeURIComponent(criada.id)}/payments`).catch(()=>({data:[]}))
        const primeiro=(pagamentos.data ?? []).sort((x,y)=>String(x.dueDate).localeCompare(String(y.dueDate)))[0]
        await patchSv(`/rest/v1/assinaturas?id=eq.${a.id}`,{gateway_cliente_id:cliente,gateway_assinatura_id:criada.id,proximo_vencimento:criada.nextDueDate ?? hojeSP(),link_pagamento:primeiro?.invoiceUrl?.startsWith('https://')?primeiro.invoiceUrl:null,erro:null})
        for(const p of pagamentos.data ?? []) await rpc('processar_pagamento_asaas',{p_evento:'SYNC',p_pagamento:p},true)
        if(cupom) await rpc('registrar_cupom_desconto',{p_codigo:cupom.codigo,p_org:a.org_id,p_usuario:usuario?.id ?? null,p_assinatura:a.id},true).catch(()=>{})
        return res.json({id:a.id,url:primeiro?.invoiceUrl ?? null,valor_centavos:a.valor_centavos})
      } catch(e) {
        // Sem assinatura criada no Asaas, o pedido é descartado e pode ser refeito; com assinatura criada fica para revisão.
        await patchSv(`/rest/v1/assinaturas?id=eq.${a.id}`,criada?{gateway_assinatura_id:criada.id,erro:String(e.message).slice(0,300)}:{status:'cancelada',cancelada_em:new Date().toISOString(),motivo_cancelamento:'Falha ao criar no gateway',erro:String(e.message).slice(0,300)}).catch(()=>{})
        throw e
      }
    }
    if(['trocar_plano','cancelar_assinatura','sincronizar'].includes(body.acao)) {
      if(!UUID.test(body.id ?? '')) return res.status(400).json({error:'Assinatura inválida'})
      const [a]=await sv(`/rest/v1/assinaturas?select=*&id=eq.${body.id}`)
      if(!a) return res.status(404).json({error:'Assinatura não encontrada'})
      if(!admin && (await rpc('pode_gerir_cobranca',{p_org:a.org_id}))!==true) return res.status(403).json({error:'Somente o dono ou um administrador da organização altera a assinatura'})
      if(a.status==='cancelada') return res.status(409).json({error:'Assinatura já cancelada'})
      const {cfg}=await carregarAsaas()
      const gid=a.gateway_assinatura_id && encodeURIComponent(a.gateway_assinatura_id)

      if(body.acao==='cancelar_assinatura') {
        if(gid) await asaas(cfg,`/subscriptions/${gid}`,{method:'DELETE'}).catch(e=>{ if(e.status!==404) throw e })
        await patchSv(`/rest/v1/assinaturas?id=eq.${a.id}`,{status:'cancelada',cancelada_em:new Date().toISOString(),motivo_cancelamento:String(body.motivo ?? (admin?'Cancelada pelo master':'Cancelada pelo cliente')).slice(0,300)})
        return res.json({ok:true,acesso_ate:a.pago_ate})
      }
      if(body.acao==='trocar_plano') {
        if(!gid) return res.status(409).json({error:'Assinatura ainda não criada no gateway'})
        const ciclo=body.ciclo==='anual'?'anual':'mensal'
        const [p]=await sv(`/rest/v1/plataforma_planos?select=*&id=eq.${encodeURIComponent(String(body.plano ?? ''))}`)
        if(!p || ['trial','cancelado'].includes(p.id) || (!p.ativo && !admin)) return res.status(400).json({error:'Plano indisponível'})
        const valor=ciclo==='anual'?p.anual_centavos:p.mensal_centavos
        if(valor<100) return res.status(400).json({error:'Plano sem valor para cobrança'})
        await asaas(cfg,`/subscriptions/${gid}`,{method:'PUT',body:{value:valor/100,cycle:ciclo==='anual'?'YEARLY':'MONTHLY',description:`LicitaForce · Plano ${p.nome} (${ciclo})`,updatePendingPayments:true}})
        await patchSv(`/rest/v1/assinaturas?id=eq.${a.id}`,{plano_id:p.id,ciclo,valor_centavos:valor})
        if(a.status==='ativa') await patchSv(`/rest/v1/organizations?id=eq.${a.org_id}`,{plano:p.id})
        return res.json({ok:true,valor_centavos:valor})
      }
      // sincronizar (somente master): reprocessa as cobranças direto do Asaas, útil se um webhook se perdeu.
      if(!gid) return res.status(409).json({error:'Assinatura ainda não criada no gateway'})
      const sub=await asaas(cfg,`/subscriptions/${gid}`).catch(e=>{ if(e.status===404) return {deleted:true}; throw e })
      const pagamentos=sub.deleted?{data:[]}:await asaas(cfg,`/payments?subscription=${gid}&limit=100`)
      for(const p of pagamentos.data ?? []) await rpc('processar_pagamento_asaas',{p_evento:'SYNC',p_pagamento:p},true)
      if(sub.deleted || sub.status==='INACTIVE') await rpc('encerrar_assinatura_gateway',{p_gateway_id:a.gateway_assinatura_id,p_motivo:'Encerrada no Asaas (sincronização)'},true)
      return res.json({ok:true,faturas:(pagamentos.data ?? []).length,encerrada:!!(sub.deleted || sub.status==='INACTIVE')})
    }

    // ------------------------------------------------------------------ Cobranças avulsas (master)
    // O Asaas configurado no painel também atende os links avulsos.
    let envPag=env
    if(env.SUPABASE_SERVICE_ROLE_KEY) {
      const {cfg}=await carregarAsaas().catch(()=>({cfg:null}))
      if(cfg?.origem==='painel' && cfg.ativo) envPag={...env,ASAAS_API_KEY:cfg.apiKey,ASAAS_ENV:cfg.ambiente,PAYMENTS_ENABLED_PROVIDERS:[env.PAYMENTS_ENABLED_PROVIDERS ?? '','asaas'].join(',')}
    }
    const cfgPag=configuracao(envPag)
    if(body.acao==='configuracao') return res.json({gateways:cfgPag})
    if(!['checkout','verificar'].includes(body.acao) || !UUID.test(body.id ?? '')) return res.status(400).json({error:'Ação ou cobrança inválida'})
    const [c]=await banco('/rest/v1/plataforma_cobrancas?select=*&id=eq.'+body.id)
    if(!c) return res.status(404).json({error:'Cobrança não encontrada'})
    const g=cfgPag.find(x=>x.id===c.gateway)
    if(!g?.habilitado || !g.credenciais || !g.configurado) return res.status(503).json({error:'Provedor ainda não ativado. Configure as credenciais no servidor e habilite o gateway.'})
    const patch=(dados,filtro='')=>banco('/rest/v1/plataforma_cobrancas?id=eq.'+c.id+filtro,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(dados)},true)
    if(body.acao==='checkout') {
      if(c.checkout_url) return res.json({url:c.checkout_url})
      if(c.status!=='rascunho') return res.status(409).json({error:'Esta cobrança já foi processada. Confira no provedor antes de emitir outra.'})
      if(c.vencimento<hojeSP()) return res.status(400).json({error:'Cobrança vencida. Emita uma nova cobrança.'})
      const reservado=await patch({status:'gerando'},'&status=eq.rascunho')
      if(!reservado?.length) return res.status(409).json({error:'Cobrança em processamento em outra sessão'})
      try {
        const resultado=await criarCheckout(c,envPag)
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
    const pago=await consultarPagamento(c,envPag,{transaction_nsu:String(body.transaction_nsu ?? '').slice(0,200),slug:String(body.slug ?? '').slice(0,200)})
    await patch({verificado_em:new Date().toISOString(),...(pago?{status:'paga',confirmado_em:new Date().toISOString()}:{})})
    return res.json({pago})
  } catch(e) {
    const status=[400,401,403,404,409].includes(e.status)?e.status:e instanceof ErroAsaas?(e.status===503?503:502):e.status===400||e.status===409?400:e.status===503?503:502
    return res.status(status).json({error:e instanceof ErroAsaas?`Asaas: ${e.message}`:(e.message || 'Falha na integração de pagamentos')})
  }
}
