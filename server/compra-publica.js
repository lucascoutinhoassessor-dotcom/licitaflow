import { randomBytes } from 'node:crypto'
import { cifrar, montarConfig } from './asaas.js'
import { montarSmtp } from './email.js'

// Provisiona uma conta pendente. Somente a confirmação do provedor libera o produto.
export async function iniciarCompra(body, req, res, env) {
  const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
  if (!base || !key || !anon) return res.status(503).json({ error: 'Cadastro de compras indisponível.' })
  async function sv(path, options = {}) {
    const r = await fetch(base + path, { ...options, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(15000) })
    const j = r.status === 204 ? null : await r.json()
    if (!r.ok) { const e = new Error(j?.msg || j?.message || 'Falha ao preparar sua conta.'); e.status = r.status; throw e }
    return j
  }
  const nome = String(body.nome || '').trim(), email = String(body.email || '').trim().toLowerCase()
  const empresa = String(body.empresa || '').trim()
  if (nome.length < 2 || nome.length > 120 || empresa.length < 2 || empresa.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: 'Informe seu nome, empresa e um e-mail válido.' })
  const ip = String(req.headers['x-forwarded-for'] || 'sem-ip').split(',')[0].trim().slice(0, 60)
  for (const [chave, limite] of [['compra-ip:' + ip, 10], ['compra-email:' + email, 3]]) {
    if (!await sv('/rest/v1/rpc/registrar_pedido_email', { method: 'POST', body: JSON.stringify({ p_chave: chave, p_limite: limite, p_minutos: 60 }) })) return res.status(429).json({ error: 'Aguarde alguns minutos antes de tentar novamente.' })
  }
  const [[smtp], [gateway], [plano]] = await Promise.all([
    sv('/rest/v1/plataforma_email?select=*&id=eq.smtp'), sv('/rest/v1/plataforma_gateways?select=*&id=eq.asaas'),
    sv(`/rest/v1/plataforma_planos?select=id,ativo,mensal_centavos&id=eq.${encodeURIComponent(String(body.plano || ''))}`),
  ])
  if (!montarSmtp(smtp, env)?.ativo || !smtp.boas_vindas || !montarConfig(gateway, env)?.ativo) return res.status(503).json({ error: 'Contratação indisponível no momento. Fale com o suporte.' })
  if (!plano?.ativo || ['trial', 'cancelado'].includes(plano.id) || plano.mensal_centavos < 100) return res.status(400).json({ error: 'Selecione um plano disponível.' })
  const senha = randomBytes(18).toString('base64url')
  let usuario, org
  try {
    usuario = await sv('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: senha, email_confirm: true, user_metadata: { nome } }) })
    ;[org] = await sv('/rest/v1/organizations', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ nome: empresa, tipo: body.tipo === 'assessoria' ? 'assessoria' : 'fornecedor', created_by: usuario.id, plano: 'trial', trial_ate: '2000-01-01', suspensa: true, motivo_suspensao: 'Teste grátis encerrado (automático)' }) })
    await sv('/rest/v1/memberships', { method: 'POST', body: JSON.stringify({ org_id: org.id, user_id: usuario.id, papel: 'owner' }) })
    await sv('/rest/v1/checkout_acessos', { method: 'POST', body: JSON.stringify({ org_id: org.id, usuario_id: usuario.id, senha_cifrada: cifrar(senha, env) }) })
    const r = await fetch(base + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: senha }), signal: AbortSignal.timeout(15000) })
    if (!r.ok) throw new Error('Não foi possível iniciar sua sessão de compra.')
    const session = await r.json()
    return res.json({ org: org.id, access_token: session.access_token, refresh_token: session.refresh_token })
  } catch (e) {
    if (usuario?.id) {
      if (org?.id) await sv('/rest/v1/organizations?id=eq.' + org.id, { method: 'DELETE' }).catch(() => {})
      await sv('/auth/v1/admin/users/' + usuario.id, { method: 'DELETE' }).catch(() => {})
    }
    return res.status(e.status === 422 ? 409 : 502).json({ error: e.status === 422 ? 'Este e-mail já tem cadastro. Entre na sua conta para contratar o plano.' : 'Não foi possível preparar sua conta. Tente novamente.' })
  }
}
