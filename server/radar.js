// Agente Radar: a busca diária roda no banco (licitaflow_radar.rodada, pg_cron às 7h). Quando há sugestões
// novas, o banco chama GET /api/agentes?agente=radar&acao=avisar (header x-coleta) e aqui sai o push:
// um por empresa, para os membros da organização. Não usa IA. Detalhes em docs/radar.md.
import webpushPadrao from 'web-push'

const CONTATO = 'https://licitaforce-app.vercel.app'

/** Texto do push de uma empresa: "Radar · 7 oportunidades para Papelaria Ana" / destaque. */
export function mensagemRadar({ empresa, quantidade, destaque }) {
  const q = Number(quantidade) || 0
  return {
    titulo: `Radar · ${q} ${q === 1 ? 'oportunidade nova' : 'oportunidades novas'}${empresa ? ` para ${String(empresa).slice(0, 50)}` : ''}`,
    texto: destaque ? `Destaque: ${String(destaque).replace(/\s+/g, ' ').slice(0, 150)}${q > 1 ? ` (+${q - 1})` : ''}` : 'Toque para ver as oportunidades encontradas.',
  }
}

/** Manda o push das sugestões ainda não avisadas. `rpc`/`chamar` usam a chave de serviço. */
export async function avisarRadar({ token, rpc, chamar, webpush = webpushPadrao }) {
  const grupos = (await rpc('radar_para_avisar', { p_token: token })) ?? []
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
