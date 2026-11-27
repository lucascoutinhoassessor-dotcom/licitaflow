// Cadastro e "esqueci minha senha" com e-mail próprio (padrão CallBot AI), sem login.
// O link é gerado pelo Supabase (admin/generate_link, que NÃO envia e-mail) e mandado pelo SMTP da plataforma
// com a marca LicitaForce. O link aponta para o próprio site (token_hash), então não depende das Redirect URLs do Supabase.
// Sem SMTP configurado, responde 503 "sem_smtp" e o site usa o envio padrão do Supabase.
import { emailConfirmarCadastro, emailRedefinirSenha, enviarEmail, montarSmtp, URL_SITE } from './email.js'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Mesma regra de src/lib/telefone.ts: só dígitos, DDD + número (10 ou 11), aceita o 55 na frente. */
export function normalizarWhatsapp(valor) {
  let d = String(valor ?? '').replace(/\D/g, '')
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  if (d.length !== 10 && d.length !== 11) return null
  if (d[0] === '0' || d[2] === '0' || (d.length === 11 && d[2] !== '9')) return null
  return d
}

export const ACOES_PUBLICAS = ['cadastrar', 'recuperar_senha']

export async function contaPublica(body, req, res, env) {
  const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const chave = env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !chave) return res.status(503).json({ error: 'Configuração Supabase ausente no servidor', codigo: 'sem_smtp' })
  async function sv(path, options = {}) {
    const r = await fetch(base + path, { ...options, headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(15000) })
    let json = null
    try { json = await r.json() } catch { /* sem corpo */ }
    if (!r.ok) { const e = new Error(json?.msg || json?.message || 'Falha no servidor de autenticação'); e.status = r.status; e.codigo = json?.error_code || json?.code; throw e }
    return json
  }
  const limite = (k, n, min) => sv('/rest/v1/rpc/registrar_pedido_email', { method: 'POST', body: JSON.stringify({ p_chave: k, p_limite: n, p_minutos: min }) })

  const [linha] = await sv('/rest/v1/plataforma_email?select=*&id=eq.smtp')
  const cfg = montarSmtp(linha, env)
  if (!cfg?.ativo) return res.status(503).json({ error: 'E-mail da plataforma não configurado', codigo: 'sem_smtp' })

  const email = String(body.email ?? '').trim().toLowerCase()
  if (!EMAIL.test(email) || email.length > 254) return res.status(400).json({ error: 'E-mail inválido' })
  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim().slice(0, 60) || 'sem-ip'

  if (body.acao === 'recuperar_senha') {
    // Resposta sempre igual: não revela se o e-mail tem conta.
    const ok = { ok: true }
    if (!(await limite('ip:' + ip, 20, 60)) || !(await limite('senha:' + email, 3, 60))) return res.json(ok)
    let link
    try { link = await sv('/auth/v1/admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'recovery', email }) }) }
    catch (e) { if (e.status === 404 || e.status === 422 || e.status === 400) return res.json(ok); throw e }
    if (!link?.hashed_token) return res.json(ok)
    const url = `${URL_SITE}/redefinir-senha?token_hash=${encodeURIComponent(link.hashed_token)}&type=recovery`
    await enviarEmail(cfg, { para: email, ...emailRedefinirSenha({ nome: link.user_metadata?.nome, url }) })
    return res.json(ok)
  }

  // cadastrar
  const nome = String(body.nome ?? '').trim()
  const senha = String(body.senha ?? '')
  const voltar = String(body.voltar ?? '')
  if (nome.length < 2 || nome.length > 120) return res.status(400).json({ error: 'Informe seu nome (2 a 120 caracteres).' })
  const telefone = normalizarWhatsapp(body.telefone)
  if (!telefone) return res.status(400).json({ error: 'Informe um WhatsApp válido com DDD.' })
  if (senha.length < 8 || senha.length > 72) return res.status(400).json({ error: 'A senha precisa ter de 8 a 72 caracteres.' })
  if (!(await limite('ip:' + ip, 20, 60)) || !(await limite('cadastro:' + email, 3, 60))) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' })
  let link
  try { link = await sv('/auth/v1/admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'signup', email, password: senha, data: { nome, telefone } }) }) }
  catch (e) {
    if (e.status === 422 || /already|registered|exists/i.test(e.message)) return res.status(409).json({ error: 'Já existe uma conta com este e-mail. Use "Entrar" ou "Esqueci minha senha".' })
    if (e.status === 400 && /password/i.test(e.message)) return res.status(400).json({ error: 'Senha fraca: use letras e números, com pelo menos 8 caracteres.' })
    throw e
  }
  if (!link?.hashed_token) return res.status(409).json({ error: 'Já existe uma conta com este e-mail. Use "Entrar" ou "Esqueci minha senha".' })
  const destino = voltar.startsWith('/') && !voltar.startsWith('//') && voltar.length < 300 ? `&voltar=${encodeURIComponent(voltar)}` : ''
  const url = `${URL_SITE}/confirmar-email?token_hash=${encodeURIComponent(link.hashed_token)}&type=signup${destino}`
  await enviarEmail(cfg, { para: email, ...emailConfirmarCadastro({ nome, url }) })
  return res.json({ ok: true })
}
