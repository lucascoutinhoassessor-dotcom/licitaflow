// Prévia pública de cupom para o checkout e o cadastro (sem conta): diz se o código vale, o tipo, o valor e o plano.
// Não registra uso nem revela a lista de cupons; o uso de verdade continua em conferir_cupom/resgatar_cupom_dias,
// que exigem o dono ou um administrador da organização. Limite de consultas por IP contra tentativa e erro.
const FORMATO = /^[A-Z0-9_-]{3,40}$/

export async function previaCupom(body, req, res, env) {
  const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const chave = env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !chave) return res.status(503).json({ error: 'Cupons indisponíveis no momento.' })
  const codigo = String(body.codigo ?? '').trim().toUpperCase().replace(/\s/g, '')
  if (!FORMATO.test(codigo)) return res.status(400).json({ error: 'Cupom inválido' })
  async function sv(path, options = {}) {
    const r = await fetch(base + path, { ...options, headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(10000) })
    if (!r.ok) throw new Error('Falha ao consultar o cupom')
    return r.json()
  }
  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim().slice(0, 60) || 'sem-ip'
  if (!(await sv('/rest/v1/rpc/registrar_pedido_email', { method: 'POST', body: JSON.stringify({ p_chave: 'cupom-ip:' + ip, p_limite: 30, p_minutos: 60 }) })))
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' })
  const [c] = await sv(`/rest/v1/cupons?select=codigo,tipo,valor,plano_id,valido_ate,max_usos,usos,ativo&codigo=eq.${encodeURIComponent(codigo)}`)
  if (!c || !c.ativo) return res.status(400).json({ error: 'Cupom inválido' })
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  if (c.valido_ate && c.valido_ate < hoje) return res.status(400).json({ error: `Este cupom venceu em ${c.valido_ate.split('-').reverse().join('/')}` })
  if (c.max_usos != null && c.usos >= c.max_usos) return res.status(400).json({ error: 'Este cupom já atingiu o limite de usos' })
  // A descrição é interna do master (ex.: parceria): não sai para o público.
  return res.json({ codigo: c.codigo, tipo: c.tipo, valor: c.valor, plano: c.plano_id, descricao: null })
}
