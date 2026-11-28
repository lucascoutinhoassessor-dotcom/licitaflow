import webpushPadrao from 'web-push'

/** Preferências são por conta, em todos os aparelhos. Ausência de registro mantém os avisos ativos. */
export async function filtrarPushAgente(inscricoes, agente, chamar) {
  const usuarios = [...new Set(inscricoes.map(s => s.user_id))]
  if (!usuarios.length) return []
  const bloqueados = new Set()
  for (let i = 0; i < usuarios.length; i += 100) {
    const preferencias = await chamar(`/rest/v1/push_agentes_preferencias?select=user_id,${agente}&user_id=in.(${usuarios.slice(i, i + 100).join(',')})`)
    for (const p of preferencias ?? []) if (p[agente] === false) bloqueados.add(p.user_id)
  }
  return inscricoes.filter(s => !bloqueados.has(s.user_id))
}

/**
 * Registra no sino (public.notificacoes) quem recebeu um push direto do servidor (Radar, Sentinela),
 * para o número do sino bater com o do ícone do app. Uma linha por pessoa; falha aqui não impede o push.
 * `linhas`: [{ org_id, user_id, tipo, titulo, mensagem, link }].
 */
export async function registrarNoSino(chamar, linhas) {
  const unicas = [...new Map(linhas.map((l) => [`${l.org_id}|${l.user_id}|${l.link}`, l])).values()]
  if (!unicas.length) return
  try {
    await chamar('/rest/v1/notificacoes', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(unicas.map((l) => ({
      org_id: l.org_id, user_id: l.user_id, tipo: l.tipo, titulo: String(l.titulo ?? '').slice(0, 120), mensagem: String(l.mensagem ?? '').slice(0, 1000), link: l.link,
    }))) })
  } catch { /* o push já saiu; o sino é complementar */ }
}

/** A fila é reservada no banco com lease; somente o token privado do agendador consegue retirá-la. */
export async function enviarResumoAgentes({ token, chamar, webpush = webpushPadrao }) {
  const rpc = (nome, corpo) => chamar(`/rest/v1/rpc/${nome}`, { method: 'POST', body: JSON.stringify(corpo) })
  // Valida o token mesmo quando não há chave/aparelhos.
  await rpc('push_agentes_autorizar', { p_token: token })
  const [chave] = (await chamar('/rest/v1/push_vapid?select=publica,privada&id=eq.true')) ?? []
  if (!chave) return { enviados: 0, falhas: 0 }
  webpush.setVapidDetails('https://licitaforce-app.vercel.app', chave.publica, chave.privada)
  const lote = (await rpc('push_agentes_lote', { p_token: token })) ?? []
  let enviados = 0, falhas = 0
  // Até 50 aparelhos por rodada; falhas transitórias ficam na fila para nova tentativa.
  for (let i = 0; i < lote.length; i += 10) {
    await Promise.all(lote.slice(i, i + 10).map(async item => {
      let status = 201
      try {
        await webpush.sendNotification({ endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } }, JSON.stringify(item.payload), { TTL: 3600, urgency: 'normal', timeout: 10000 })
        enviados++
      } catch (e) { status = e?.statusCode || 503; falhas++ }
      await rpc('push_agentes_concluir', { p_token: token, p_id: item.id, p_reserva: item.reserva, p_status: status })
    }))
  }
  return { enviados, falhas }
}
