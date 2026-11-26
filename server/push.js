// Notificações push (Web Push) dos avisos do LicitaForce.
// GET                      → chave pública VAPID (o aparelho precisa dela para se inscrever)
// POST {acao:'inscrever'}  → grava a inscrição deste aparelho para o usuário logado
// POST {acao:'cancelar'}   → remove a inscrição deste aparelho
// POST {acao:'testar'}     → manda uma notificação de teste para os aparelhos do usuário logado
// POST {acao:'enviar'}     → (só master) manda o push de um aviso recém-publicado, uma vez só
// POST {acao:'agendados'}  → (pg_cron, sem login) manda os pushes agendados que já venceram
// As chaves VAPID são geradas no primeiro uso e guardadas em push_vapid (só a chave de serviço lê).
import webpushPadrao from 'web-push'
import { enviarResumoAgentes } from './pushAgentes.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CONTATO = 'https://licitaforce-app.vercel.app'

/** Texto curto para caber na notificação do celular. */
export function resumo(texto, max = 180) {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t
}

/** Confere o formato da inscrição que o navegador devolveu (PushSubscription.toJSON()). */
export function inscricaoValida(s) {
  return !!s && typeof s.endpoint === 'string' && /^https:\/\/\S+$/.test(s.endpoint) && s.endpoint.length <= 1000
    && typeof s.keys?.p256dh === 'string' && s.keys.p256dh.length > 0 && s.keys.p256dh.length <= 200
    && typeof s.keys?.auth === 'string' && s.keys.auth.length > 0 && s.keys.auth.length <= 100
}

export function criarHandler({ webpush = webpushPadrao, fetcher = fetch } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    const env = process.env
    const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL
    const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
    const servico = env.SUPABASE_SERVICE_ROLE_KEY
    if (!base || !anon || !servico) return res.status(503).json({ error: 'Configuração Supabase ausente no servidor' })
    const token = req.headers.authorization

    async function chamar(path, options = {}, comServico = true) {
      const h = comServico ? { apikey: servico, Authorization: `Bearer ${servico}` } : { apikey: anon, Authorization: token }
      const r = await fetcher(base + path, { ...options, headers: { 'Content-Type': 'application/json', ...h, ...options.headers }, signal: AbortSignal.timeout(15000) })
      let json = null
      try { json = await r.json() } catch { /* resposta sem corpo */ }
      if (!r.ok) { const e = new Error(json?.message || json?.msg || 'Falha no banco'); e.status = r.status; throw e }
      return json
    }

    async function chaves() {
      const [linha] = await chamar('/rest/v1/push_vapid?select=publica,privada&id=eq.true')
      if (linha) return linha
      const k = webpush.generateVAPIDKeys()
      // Se duas chamadas gerarem ao mesmo tempo, vale a que gravou primeiro.
      await chamar('/rest/v1/push_vapid?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ id: true, publica: k.publicKey, privada: k.privateKey }) })
      const [gravada] = await chamar('/rest/v1/push_vapid?select=publica,privada&id=eq.true')
      return gravada
    }

    /** Envia o push de um aviso que já está na hora. Devolve null se já foi enviado, está agendado ou foi arquivado. */
    async function enviarAviso(id) {
      // Reserva o envio: só uma chamada consegue marcar push_enviado_em.
      const agora = new Date().toISOString()
      const reservados = await chamar(`/rest/v1/plataforma_avisos?id=eq.${id}&ativo=is.true&enviar_push=is.true&push_enviado_em=is.null&publicar_em=lte.${agora}&select=id,titulo,texto,org_id,org_ids,som`,
        { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ push_enviado_em: agora }) })
      const aviso = reservados?.[0]
      if (!aviso) return null

      // Destinatários: membros das organizações do aviso (ou de qualquer organização ativa, se for para todos).
      const orgs = aviso.org_ids?.length ? aviso.org_ids : aviso.org_id ? [aviso.org_id] : []
      const membros = await chamar(`/rest/v1/memberships?select=user_id,organizations!inner(suspensa)&organizations.suspensa=eq.false${orgs.length ? `&org_id=in.(${orgs.join(',')})` : ''}`)
      const usuarios = [...new Set((membros ?? []).map(m => m.user_id))]
      if (!usuarios.length) return { enviados: 0, falhas: 0 }
      let inscricoes = []
      for (let i = 0; i < usuarios.length; i += 100) {
        const lote = usuarios.slice(i, i + 100).join(',')
        inscricoes = inscricoes.concat(await chamar(`/rest/v1/push_inscricoes?select=id,endpoint,p256dh,auth&user_id=in.(${lote})`))
      }
      if (!inscricoes.length) return { enviados: 0, falhas: 0 }
      const r = await disparar(inscricoes, { id: aviso.id, titulo: aviso.titulo, texto: resumo(aviso.texto), url: '/app/avisos', tag: aviso.id, som: aviso.som || 'principal' })
      return { enviados: r.enviados, falhas: r.falhas, ...(r.falhas ? { erros: r.erros.slice(0, 5) } : {}) }
    }

    /** Manda o push para cada aparelho e devolve o resultado de cada um (o motivo vem do serviço de push do navegador). */
    async function disparar(inscricoes, dados) {
      const k = await chaves()
      webpush.setVapidDetails(CONTATO, k.publica, k.privada)
      const payload = JSON.stringify(dados)
      let enviados = 0, falhas = 0
      const mortas = [], erros = [], resultados = []
      for (let i = 0; i < inscricoes.length; i += 25) {
        await Promise.all(inscricoes.slice(i, i + 25).map(async s => {
          try {
            // urgency high: o Android/Chrome entrega na hora, sem esperar o aparelho "acordar" (modo soneca).
            const r = await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: 'high', timeout: 10000 })
            enviados++
            resultados.push({ aparelho: s.aparelho ?? '', ok: true, status: r?.statusCode ?? 201 })
          } catch (e) {
            falhas++
            const status = e?.statusCode ?? 0
            const motivo = resumo(e?.body || e?.message || 'sem resposta', 160)
            erros.push({ status, motivo })
            resultados.push({ aparelho: s.aparelho ?? '', ok: false, status, motivo })
            if (status === 404 || status === 410) mortas.push(s.id)
          }
        }))
      }
      // Aparelhos que desinstalaram ou revogaram a permissão: some da lista.
      if (mortas.length) await chamar(`/rest/v1/push_inscricoes?id=in.(${mortas.join(',')})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }).catch(() => undefined)
      return { enviados, falhas, erros, resultados, removidos: mortas.length }
    }

    try {
      if (req.method === 'GET') return res.status(200).json({ chave: (await chaves()).publica })
      if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })
      const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}
      if (corpo.acao === 'resumo-agentes') {
        const coleta = String(req.headers['x-coleta'] ?? '')
        if (!/^[0-9a-f]{32,128}$/.test(coleta)) return res.status(401).json({ error: 'Não autorizado' })
        try {
          return res.status(200).json(await enviarResumoAgentes({ token: coleta, chamar, webpush }))
        } catch (e) {
          return res.status(/token/i.test(e.message) ? 401 : 502).json({ error: 'Não foi possível enviar o resumo dos agentes' })
        }
      }
      // Chamado pelo pg_cron a cada minuto quando há push vencido. Não precisa de login: só dispara o que
      // já está na hora e ainda não saiu (cada aviso é reservado antes de enviar, então nunca sai duas vezes).
      if (corpo.acao === 'agendados') {
        const agora = new Date().toISOString(), ontem = new Date(Date.now() - 86400000).toISOString()
        const vencidos = await chamar(`/rest/v1/plataforma_avisos?select=id&enviar_push=is.true&ativo=is.true&push_enviado_em=is.null&publicar_em=lte.${agora}&publicar_em=gt.${ontem}&order=publicar_em&limit=10`)
        let avisos = 0, enviados = 0, falhas = 0
        for (const { id } of vencidos ?? []) {
          const r = await enviarAviso(id)
          if (r) { avisos++; enviados += r.enviados; falhas += r.falhas }
        }
        return res.status(200).json({ avisos, enviados, falhas })
      }
      if (!/^Bearer \S+$/.test(token ?? '')) return res.status(401).json({ error: 'Entre na sua conta' })
      const eu = await chamar('/auth/v1/user', {}, false)
      if (!eu?.id) return res.status(401).json({ error: 'Entre na sua conta' })
      const body = corpo

      if (body.acao === 'inscrever') {
        const s = body.inscricao
        if (!inscricaoValida(s)) return res.status(400).json({ error: 'Inscrição inválida' })
        // O mesmo aparelho pode trocar de conta: a inscrição passa a ser de quem está logado agora.
        await chamar('/rest/v1/push_inscricoes?on_conflict=endpoint', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ user_id: eu.id, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, aparelho: String(req.headers['user-agent'] ?? '').slice(0, 300) }) })
        return res.status(200).json({ ok: true })
      }

      if (body.acao === 'cancelar') {
        if (typeof body.endpoint !== 'string' || body.endpoint.length > 1000) return res.status(400).json({ error: 'Aparelho inválido' })
        await chamar(`/rest/v1/push_inscricoes?user_id=eq.${eu.id}&endpoint=eq.${encodeURIComponent(body.endpoint)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
        return res.status(200).json({ ok: true })
      }

      // Teste: manda uma notificação só para os aparelhos de quem pediu e devolve o resultado de cada um.
      if (body.acao === 'testar') {
        const inscricoes = await chamar(`/rest/v1/push_inscricoes?select=id,endpoint,p256dh,auth,aparelho&user_id=eq.${eu.id}`)
        if (!inscricoes?.length) return res.status(200).json({ enviados: 0, falhas: 0, resultados: [], removidos: 0 })
        const r = await disparar(inscricoes, { titulo: 'Teste de notificação', texto: 'Se você está vendo isto, o push chegou neste aparelho.', url: '/app/avisos', tag: `licitaforce-teste-${Date.now()}` })
        return res.status(200).json({ enviados: r.enviados, falhas: r.falhas, resultados: r.resultados, removidos: r.removidos })
      }

      if (body.acao === 'enviar') {
        const admin = await chamar('/rest/v1/rpc/is_platform_admin', { method: 'POST', body: '{}' }, false)
        if (admin !== true) return res.status(403).json({ error: 'Acesso restrito ao master' })
        if (!UUID.test(String(body.aviso ?? ''))) return res.status(400).json({ error: 'Aviso inválido' })
        const r = await enviarAviso(body.aviso)
        return res.status(200).json(r ?? { enviados: 0, falhas: 0, motivo: 'já enviado, agendado ou arquivado' })
      }

      return res.status(400).json({ error: 'Ação inválida' })
    } catch (e) {
      return res.status(e?.status === 401 ? 401 : 500).json({ error: e?.status === 401 ? 'Entre na sua conta' : 'Não foi possível concluir agora' })
    }
  }
}

export default criarHandler()
