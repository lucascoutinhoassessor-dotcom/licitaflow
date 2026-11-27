// Entrega da fila de lembretes e avisos (public.notificacoes_envios), reservada pelo banco com o token privado do agendador.
// Canal "push": aparelhos inscritos (se todos falharem, cai no canal de reserva escolhido no master).
// Canais de reserva: e-mail (SMTP de Master → Integrações) e WhatsApp (API oficial da Meta, modelo aprovado).
import webpushPadrao from 'web-push'
import { decifrar } from './asaas.js'
import { emailNotificacao, enviarEmail as enviarEmailPadrao, montarSmtp } from './email.js'

const GRAPH = 'https://graph.facebook.com/v21.0'

/** Celular brasileiro em formato internacional (só dígitos), ou null. */
export function telefoneWhatsapp(bruto) {
  let d = String(bruto ?? '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 10 || d.length === 11) d = '55' + d
  return /^55\d{10,11}$/.test(d) ? d : null
}

/** Parâmetro de modelo do WhatsApp: sem quebras de linha, tabulação ou 4+ espaços seguidos (a Meta recusa). */
export function paramWhatsapp(texto, max = 900) {
  const t = String(texto ?? '').replace(/\s*\n+\s*/g, ' · ').replace(/[\t ]{2,}/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t || '-'
}

export async function enviarWhatsapp(cfg, { para, titulo, texto }, fetcher = fetch) {
  const r = await fetcher(`${GRAPH}/${cfg.phoneId}/messages`, {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: para, type: 'template',
      template: { name: cfg.template, language: { code: cfg.idioma }, components: [{ type: 'body', parameters: [{ type: 'text', text: paramWhatsapp(titulo, 120) }, { type: 'text', text: paramWhatsapp(texto) }] }] },
    }),
  })
  if (r.ok) return
  let msg = `WhatsApp recusou (${r.status})`
  try { const j = await r.json(); if (j?.error?.message) msg = `WhatsApp: ${String(j.error.message).slice(0, 200)}` } catch { /* sem corpo */ }
  const e = new Error(msg); e.status = r.status; throw e
}

/** Configuração do WhatsApp a partir da linha de notificacoes_config (token decifrado). null se desligado. */
export function montarWhatsapp(linha, env) {
  if (!linha?.whatsapp_ativo || !linha.whatsapp_phone_id || !linha.whatsapp_token_cifrado) return null
  return { phoneId: linha.whatsapp_phone_id, token: decifrar(linha.whatsapp_token_cifrado, env), template: linha.whatsapp_template, idioma: linha.whatsapp_idioma }
}

export async function entregarNotificacoes({ token, chamar, env = process.env, webpush = webpushPadrao, fetcher = fetch, enviarEmail = enviarEmailPadrao, limiteMs = 45000 }) {
  const rpc = (nome, corpo) => chamar(`/rest/v1/rpc/${nome}`, { method: 'POST', body: JSON.stringify(corpo) })
  await rpc('lembretes_autorizar', { p_token: token })
  const [[cfgLinha], [smtpLinha], [vapid]] = await Promise.all([
    chamar('/rest/v1/notificacoes_config?select=*&id=eq.true'),
    chamar('/rest/v1/plataforma_email?select=*&id=eq.smtp'),
    chamar('/rest/v1/push_vapid?select=publica,privada&id=eq.true'),
  ].map(p => p.then(x => x ?? [])))
  let smtp = null, whats = null
  try { smtp = montarSmtp(smtpLinha, env); if (!smtp?.ativo) smtp = null } catch { smtp = null }
  try { whats = montarWhatsapp(cfgLinha, env) } catch { whats = null }
  const reserva = cfgLinha?.canal_reserva || 'email'
  if (vapid) webpush.setVapidDetails('https://licitaforce-app.vercel.app', vapid.publica, vapid.privada)

  async function porPush(item) {
    if (!vapid || !item.inscricoes?.length) return { ok: 0, mortas: [] }
    const payload = JSON.stringify({ titulo: item.titulo, texto: item.texto.replace(/\s*\n\s*/g, ' '), url: item.link, tag: `lembrete-${item.id}` })
    let ok = 0; const mortas = []
    await Promise.all(item.inscricoes.map(async s => {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: 'normal', timeout: 10000 }); ok++ }
      catch (e) { if (e?.statusCode === 404 || e?.statusCode === 410) mortas.push(s.id) }
    }))
    return { ok, mortas }
  }
  async function porEmail(item) {
    if (!smtp) return 'e-mail da plataforma não configurado'
    if (!item.email) return 'sem e-mail'
    const m = emailNotificacao({ nome: item.nome, titulo: item.titulo, texto: item.texto, link: item.link })
    try { await enviarEmail(smtp, { para: item.email, ...m }); return null } catch (e) { return String(e?.message || 'falha no e-mail').slice(0, 150) }
  }
  async function porWhatsapp(item) {
    if (!whats) return 'WhatsApp não configurado'
    const para = telefoneWhatsapp(item.telefone)
    if (!para) return 'sem celular cadastrado'
    try { await enviarWhatsapp(whats, { para, titulo: item.titulo, texto: item.texto }, fetcher); return null } catch (e) { return String(e?.message || 'falha no WhatsApp').slice(0, 150) }
  }
  /** Canal de reserva: WhatsApp sem celular/config cai para e-mail, e vice-versa. */
  async function porReserva(item, canal) {
    const ordem = canal === 'whatsapp' ? ['whatsapp', 'email'] : canal === 'email_whatsapp' ? ['email', 'whatsapp'] : ['email', 'whatsapp']
    const erros = []; let entregues = 0
    for (const c of ordem) {
      const erro = c === 'email' ? await porEmail(item) : await porWhatsapp(item)
      if (!erro) { entregues++; if (canal !== 'email_whatsapp') break } else erros.push(erro)
    }
    if (canal === 'email_whatsapp' && entregues === 1) return { status: 'parcial', detalhe: erros.join('; ') }
    if (entregues) return { status: 'enviado', detalhe: erros.length ? `${ordem.find((_, i) => i > 0)} usado: ${erros.join('; ')}` : null }
    const semContato = erros.every(e => /^sem |não configurado/.test(e))
    return { status: semContato ? 'sem_contato' : 'tentar', detalhe: erros.join('; ') }
  }

  const inicio = Date.now()
  let enviados = 0, falhas = 0
  while (Date.now() - inicio < limiteMs) {
    const lote = (await rpc('notificacoes_lote', { p_token: token })) ?? []
    if (!lote.length) break
    for (let i = 0; i < lote.length; i += 5) {
      await Promise.all(lote.slice(i, i + 5).map(async item => {
        let r, mortas = null
        if (item.canal === 'push') {
          const p = await porPush(item)
          mortas = p.mortas.length ? p.mortas : null
          r = p.ok ? { status: 'enviado', detalhe: null } : await porReserva(item, reserva).then(x => ({ ...x, detalhe: `push sem aparelho ativo; ${x.detalhe ?? 'reserva usada'}` }))
        } else r = await porReserva(item, item.canal)
        if (r.status === 'enviado' || r.status === 'parcial') enviados++; else falhas++
        await rpc('notificacoes_concluir', { p_token: token, p_id: item.id, p_reserva: item.reserva, p_status: r.status, p_detalhe: r.detalhe, p_mortas: mortas })
      }))
    }
    if (lote.length < 30) break
  }
  return { enviados, falhas }
}
