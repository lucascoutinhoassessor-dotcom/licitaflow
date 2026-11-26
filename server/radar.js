// Agente Radar: a busca diária roda no banco (licitaflow_radar.rodada, pg_cron às 7h). Quando há sugestões
// novas, o banco chama GET /api/agentes?agente=radar&acao=avisar (header x-coleta) para push e e-mail.
// Os e-mails têm fila própria por empresa e membro, com tentativas nas próximas rodadas. Não usa IA.
import webpushPadrao from 'web-push'
import { emailRadar, enviarEmail, montarSmtp } from './email.js'

const CONTATO = 'https://licitaforce-app.vercel.app'

/** Texto do push de uma empresa: "Radar · 7 oportunidades para Papelaria Ana" / destaque. */
export function mensagemRadar({ empresa, quantidade, destaque }) {
  const q = Number(quantidade) || 0
  return {
    titulo: `Radar · ${q} ${q === 1 ? 'oportunidade nova' : 'oportunidades novas'}${empresa ? ` para ${String(empresa).slice(0, 50)}` : ''}`,
    texto: destaque ? `Destaque: ${String(destaque).replace(/\s+/g, ' ').slice(0, 150)}${q > 1 ? ` (+${q - 1})` : ''}` : 'Toque para ver as oportunidades encontradas.',
  }
}

/** Manda push e e-mail de forma independente. `rpc`/`chamar` usam a chave de serviço. */
export async function avisarRadar({ token, rpc, chamar, webpush = webpushPadrao, env = process.env, enviar = enviarEmail }) {
  const grupos = (await rpc('radar_para_avisar', { p_token: token })) ?? []
  // O banco valida o token acima antes de qualquer leitura de configuração ou envio.
  const resultados = await Promise.allSettled([
    avisarPush({ grupos, chamar, webpush }),
    avisarEmailsRadar({ token, rpc, chamar, env, enviar }),
  ])
  for (const r of resultados) if (r.status === 'rejected') throw r.reason
  return { ...resultados[0].value, ...resultados[1].value }
}

export async function avisarEmailsRadar({ token, rpc, chamar, env, enviar }) {
  const [linha] = (await chamar('/rest/v1/plataforma_email?select=*&id=eq.smtp')) ?? []
  const cfg = montarSmtp(linha, env)
  if (!cfg?.ativo) return { emails_enviados: 0, emails_falhas: 0, email_configurado: false }
  const lotes = (await rpc('radar_emails_reservar', { p_token: token })) ?? []
  let enviados = 0, falhas = 0
  // No máximo 10 envios simultâneos; cada destinatário recebe seu próprio e-mail.
  for (let inicio = 0; inicio < lotes.length; inicio += 10) {
    const resultados = await Promise.allSettled(lotes.slice(inicio, inicio + 10).map(async (lote) => {
      let sucesso = false
      try {
        const resultado = await enviar(cfg, { para: lote.email, ...emailRadar(lote) })
        sucesso = !resultado?.rejected?.length
      } catch { /* a reserva será liberada e a próxima rodada tentará novamente */ }
      if (sucesso) enviados++
      else falhas++
      await rpc('radar_email_concluir', { p_token: token, p_id: lote.id, p_reserva: lote.reserva, p_sucesso: sucesso })
    }))
    for (const r of resultados) if (r.status === 'rejected') throw r.reason
  }
  return { emails_enviados: enviados, emails_falhas: falhas, email_configurado: true }
}

async function avisarPush({ grupos, chamar, webpush }) {
  if (!grupos.length) return { empresas: 0, enviados: 0, falhas: 0 }
  const [chave] = (await chamar('/rest/v1/push_vapid?select=publica,privada&id=eq.true')) ?? []
  if (!chave) return { empresas: grupos.length, enviados: 0, falhas: 0 } // ninguém ativou notificações ainda
  webpush.setVapidDetails(CONTATO, chave.publica, chave.privada)
  const orgs = [...new Set(grupos.map((g) => g.org_id))]
  const membros = (await chamar(`/rest/v1/memberships?select=org_id,user_id&org_id=in.(${orgs.join(',')})`)) ?? []
  const usuarios = [...new Set(membros.map((m) => m.user_id))]
  const inscricoes = usuarios.length ? ((await chamar(`/rest/v1/push_inscricoes?select=id,user_id,endpoint,p256dh,auth&user_id=in.(${usuarios.join(',')})`)) ?? []) : []
  let enviados = 0, falhas = 0
  const mortas = []
  for (const g of grupos) {
    const quem = new Set(membros.filter((m) => m.org_id === g.org_id).map((m) => m.user_id))
    const payload = JSON.stringify({ ...mensagemRadar(g), url: '/app/agentes/radar', tag: `radar-${g.empresa_id}` })
    await Promise.all(inscricoes.filter((s) => quem.has(s.user_id)).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: 'normal', timeout: 10000 })
        enviados++
      } catch (e) {
        falhas++
        if (e?.statusCode === 404 || e?.statusCode === 410) mortas.push(s.id)
      }
    }))
  }
  if (mortas.length) await chamar(`/rest/v1/push_inscricoes?id=in.(${mortas.join(',')})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }).catch(() => undefined)
  return { empresas: grupos.length, enviados, falhas }
}
