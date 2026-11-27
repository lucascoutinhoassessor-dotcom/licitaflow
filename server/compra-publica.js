import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { cifrar, decifrar, montarConfig } from './asaas.js'
import { montarSmtp } from './email.js'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const resumo = v => createHash('sha256').update(String(v)).digest()
/** A chave do pedido fica só no navegador de quem comprou; o servidor guarda o hash (app_metadata, que o usuário não edita). */
export function mesmaChave(recebida, hashGuardado) {
  if (!recebida || !hashGuardado) return false
  const a = resumo(recebida), b = Buffer.from(String(hashGuardado), 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

// Provisiona (ou retoma) uma conta pendente para a compra. Somente a confirmação do provedor libera o produto.
// Quem tenta de novo com o mesmo e-mail antes de pagar continua o mesmo pedido, em vez de esbarrar em erro.
export async function iniciarCompra(body, req, res, env) {
  const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
  if (!base || !key || !anon) return res.status(503).json({ error: 'Cadastro de compras indisponível.' })
  async function sv(path, options = {}) {
    const r = await fetch(base + path, { ...options, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(15000) })
    const j = r.status === 204 ? null : await r.json().catch(() => null)
    if (!r.ok) { const e = new Error(j?.msg || j?.message || 'Falha ao preparar sua conta.'); e.status = r.status; e.codigo = j?.error_code || j?.code; throw e }
    return j
  }
  async function entrar(email, senha) {
    const r = await fetch(base + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: senha }), signal: AbortSignal.timeout(15000) })
    if (!r.ok) throw new Error('Não foi possível iniciar sua sessão de compra.')
    return r.json()
  }
  const nome = String(body.nome || '').trim(), email = String(body.email || '').trim().toLowerCase()
  const empresa = String(body.empresa || '').trim()
  const tipo = body.tipo === 'assessoria' ? 'assessoria' : 'fornecedor'
  if (nome.length < 2 || nome.length > 120 || empresa.length < 2 || empresa.length > 120 || !EMAIL.test(email) || email.length > 254) return res.status(400).json({ error: 'Informe seu nome, empresa e um e-mail válido.' })
  const ip = String(req.headers['x-forwarded-for'] || 'sem-ip').split(',')[0].trim().slice(0, 60)
  for (const [chave, limite] of [['compra-ip:' + ip, 20], ['compra-email:' + email, 10]]) {
    if (!await sv('/rest/v1/rpc/registrar_pedido_email', { method: 'POST', body: JSON.stringify({ p_chave: chave, p_limite: limite, p_minutos: 60 }) })) return res.status(429).json({ error: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.' })
  }
  const [[smtp], [gateway], [plano]] = await Promise.all([
    sv('/rest/v1/plataforma_email?select=*&id=eq.smtp'), sv('/rest/v1/plataforma_gateways?select=*&id=eq.asaas'),
    sv(`/rest/v1/plataforma_planos?select=id,ativo,mensal_centavos&id=eq.${encodeURIComponent(String(body.plano || ''))}`),
  ])
  if (!montarSmtp(smtp, env)?.ativo || !smtp.boas_vindas || !montarConfig(gateway, env)?.ativo) return res.status(503).json({ error: 'Contratação indisponível no momento. Fale com o suporte.' })
  if (!plano?.ativo || ['trial', 'cancelado'].includes(plano.id) || plano.mensal_centavos < 100) return res.status(400).json({ error: 'Selecione um plano disponível.' })

  /** Conta já existente com este e-mail: retoma se for uma compra ainda não paga; senão, pede para entrar. */
  async function retomar(usuario) {
    const [acesso] = await sv(`/rest/v1/checkout_acessos?select=org_id,senha_cifrada&usuario_id=eq.${usuario.id}&order=created_at.desc&limit=1`)
    if (!acesso) return res.status(409).json({ error: 'Este e-mail já tem cadastro. Entre na sua conta para contratar o plano.', entrar: true })
    // Sem a chave do pedido (outro navegador), não entrega a sessão: evita que terceiros assumam a conta só com o e-mail.
    if (!mesmaChave(body.chave_pedido, usuario.app_metadata?.chave_compra)) return res.status(409).json({ error: 'Já existe um pedido em andamento para este e-mail. Continue pelo mesmo navegador em que começou ou fale com o suporte.' })
    await sv(`/rest/v1/organizations?id=eq.${acesso.org_id}`, { method: 'PATCH', body: JSON.stringify({ nome: empresa, tipo }) }).catch(() => {})
    await sv(`/auth/v1/admin/users/${usuario.id}`, { method: 'PUT', body: JSON.stringify({ user_metadata: { ...usuario.user_metadata, nome } }) }).catch(() => {})
    const session = await entrar(email, decifrar(acesso.senha_cifrada, env))
    return res.json({ org: acesso.org_id, access_token: session.access_token, refresh_token: session.refresh_token, retomada: true })
  }
  async function buscarUsuario() {
    const r = await sv(`/auth/v1/admin/users?per_page=50&filter=${encodeURIComponent(email)}`)
    return (r?.users ?? []).find(u => String(u.email || '').toLowerCase() === email) ?? null
  }

  try {
    const existente = await buscarUsuario().catch(() => null)
    if (existente) return await retomar(existente)
  } catch (e) {
    return res.status(502).json({ error: 'Não foi possível retomar seu pedido. Tente novamente em instantes.' })
  }

  const senha = randomBytes(18).toString('base64url')
  const chave = randomBytes(24).toString('base64url')
  let usuario, org
  try {
    usuario = await sv('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: senha, email_confirm: true, user_metadata: { nome }, app_metadata: { chave_compra: resumo(chave).toString('hex') } }) })
    ;[org] = await sv('/rest/v1/organizations', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ nome: empresa, tipo, created_by: usuario.id, plano: 'trial', trial_ate: '2000-01-01', suspensa: true, motivo_suspensao: 'Aguardando o primeiro pagamento' }) })
    await sv('/rest/v1/memberships', { method: 'POST', body: JSON.stringify({ org_id: org.id, user_id: usuario.id, papel: 'owner' }) })
    await sv('/rest/v1/checkout_acessos', { method: 'POST', body: JSON.stringify({ org_id: org.id, usuario_id: usuario.id, senha_cifrada: cifrar(senha, env) }) })
    const session = await entrar(email, senha)
    return res.json({ org: org.id, access_token: session.access_token, refresh_token: session.refresh_token, chave_pedido: chave })
  } catch (e) {
    if (usuario?.id) {
      if (org?.id) await sv('/rest/v1/organizations?id=eq.' + org.id, { method: 'DELETE' }).catch(() => {})
      await sv('/auth/v1/admin/users/' + usuario.id, { method: 'DELETE' }).catch(() => {})
    }
    // E-mail criado entre a busca e o cadastro (ou busca indisponível): tenta retomar uma última vez.
    if (!usuario?.id && (e.status === 422 || e.codigo === 'email_exists')) {
      const outro = await buscarUsuario().catch(() => null)
      if (outro) return retomar(outro).catch(() => res.status(502).json({ error: 'Não foi possível retomar seu pedido. Tente novamente em instantes.' }))
      return res.status(409).json({ error: 'Este e-mail já tem cadastro. Entre na sua conta para contratar o plano.', entrar: true })
    }
    console.error('iniciar_compra', e.status, e.codigo, e.message)
    return res.status(502).json({ error: 'Não foi possível preparar sua conta. Tente novamente.' })
  }
}
