import { emailChamado, enviarEmail, montarSmtp } from './email.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIPOS = { suporte: 'Suporte', sugestao: 'Sugestão', solicitacao: 'Solicitação', liberacao_conta: 'Liberação de conta' }
const STATUS = { aberto: 'Aberto', em_andamento: 'Em andamento', aguardando_cliente: 'Aguardando cliente', resolvido: 'Resolvido', fechado: 'Fechado' }
const PRIORIDADES = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })
  const env = process.env
  const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
  const service = env.SUPABASE_SERVICE_ROLE_KEY
  const token = req.headers.authorization
  if (!base || !anon || !service) return res.status(503).json({ error: 'Configuração Supabase ausente no servidor' })
  if (!/^Bearer \S+$/.test(token ?? '')) return res.status(401).json({ error: 'Entre na sua conta' })
  async function banco(path, options = {}, privado = false) {
    const r = await fetch(base + path, { ...options, headers: { 'Content-Type': 'application/json', apikey: privado ? service : anon, Authorization: privado ? `Bearer ${service}` : token }, signal: AbortSignal.timeout(15000) })
    const json = await r.json().catch(() => null)
    if (!r.ok) { const e = new Error(privado ? 'Falha ao consultar os dados do atendimento' : json?.message || 'Acesso negado'); e.status = r.status; throw e }
    return json
  }
  const rpc = (nome, args) => banco('/rest/v1/rpc/' + nome, { method: 'POST', body: JSON.stringify(args) })
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}
    if (!['abrir', 'responder', 'atualizar'].includes(body.acao)) return res.status(400).json({ error: 'Ação inválida' })
    if (!UUID.test(body.acao === 'abrir' ? body.org : body.chamado)) return res.status(400).json({ error: 'Organização ou ticket inválido' })
    if (body.acao === 'abrir' && !Object.hasOwn(TIPOS, body.tipo)) return res.status(400).json({ error: 'Tipo inválido' })
    // Autorização e limites continuam nas RPCs, sempre com o token de quem pediu.
    const eu = await banco('/auth/v1/user')
    let id = body.chamado
    if (body.acao === 'abrir') id = await rpc('abrir_chamado', { p_org: body.org, p_assunto: body.assunto, p_texto: body.texto, p_tipo: body.tipo })
    else if (body.acao === 'responder') await rpc('responder_chamado', { p_chamado: id, p_texto: body.texto })
    else await rpc('admin_atualizar_chamado', { p_chamado: id, p_status: body.status, p_prioridade: body.prioridade })

    // Falhas de e-mail não transformam uma gravação concluída em erro (evita tickets duplicados).
    let aviso
    try {
      const [c] = await banco(`/rest/v1/suporte_chamados?select=*&id=eq.${id}`)
      if (!c) throw new Error('Ticket indisponível')
      const [linha] = await banco('/rest/v1/plataforma_email?select=*&id=eq.smtp', {}, true)
      const cfg = montarSmtp(linha, env)
      if (!cfg?.ativo) throw new Error('E-mail da plataforma indisponível')
      const admin = await rpc('is_platform_admin', {})
      const [org] = await banco(`/rest/v1/organizations?select=nome&id=eq.${c.org_id}`, {}, true)
      const cliente = c.criado_por ? await banco(`/auth/v1/admin/users/${c.criado_por}`, {}, true) : null
      const dados = { id, assunto: c.assunto, organizacao: org?.nome, tipo: TIPOS[c.tipo] || c.tipo, texto: body.acao === 'atualizar' ? `Status: ${STATUS[body.status] || body.status}\nPrioridade: ${PRIORIDADES[body.prioridade] || body.prioridade}` : body.texto, evento: body.acao }
      const destinos = [{ para: cfg.endereco, master: true }]
      if (cliente?.email) destinos.push({ para: cliente.email, master: false })
      if (body.acao === 'responder' && !admin && eu.email && eu.email !== cliente?.email) destinos.push({ para: eu.email, master: false })
      const resultados = await Promise.allSettled(destinos.map(d => enviarEmail(cfg, { para: d.para, ...emailChamado({ ...dados, master: d.master }) })))
      if (resultados.some(r => r.status === 'rejected')) throw new Error('Envio incompleto')
    } catch {
      aviso = 'O ticket foi salvo, mas não foi possível enviar todos os e-mails. Confira a configuração de e-mail no painel master.'
    }
    return res.json({ ok: true, chamado: id, emailEnviado: !aviso, ...(aviso ? { aviso } : {}) })
  } catch (e) {
    return res.status(e.status === 401 ? 401 : e.status === 403 ? 403 : 400).json({ error: e.message || 'Falha no atendimento' })
  }
}
