// Agente Sentinela: compara a foto atual de cada edital no PNCP com a anterior e descreve o que mudou.
// Chamado pelo pg_cron (POST /api/agentes?agente=sentinela&acao=verificar com o token x-coleta).
// Não usa IA. Detalhes em docs/sentinela.md.
import webpushPadrao from 'web-push'

const CONSULTA = 'https://pncp.gov.br/api/consulta/v1/orgaos'
const PNCP = 'https://pncp.gov.br/api/pncp/v1/orgaos'
const CONTROLE = /^(\d{14})-1-0*(\d{1,9})\/(\d{4})$/
const COMPLETO_A_CADA_MS = 6 * 3600e3 // relê a lista de arquivos ao menos a cada 6 h, mesmo sem mudança na compra
const CONTATO = 'https://licitaflow-prod.vercel.app'
// Situações da compra no PNCP: 1 Divulgada, 2 Revogada, 3 Anulada, 4 Suspensa.
const SITUACAO_GRAVE = new Set([2, 3, 4])
const DOC_IMPORTANTE = /retifica|errata|aditamento|impugna|esclarec|suspens|revoga|anula|adiamento|prorroga|nova data|reabertura|aviso/i

/** "2026-11-25T08:30:00" (horário de Brasília, como o PNCP manda) → "25/11/2026 08:30". */
export function dataLegivel(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(s ?? ''))
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : 'sem data'
}
/** Data do PNCP (sem fuso, horário de Brasília) → milissegundos. */
const ms = (s) => (s ? Date.parse(`${String(s).slice(0, 19)}-03:00`) : NaN)

/** Foto do edital que fica guardada para a próxima comparação. */
export function fotoDoPncp(compra, arquivos, agora = new Date()) {
  return {
    atualizacao: compra.dataAtualizacaoGlobal ?? compra.dataAtualizacao ?? null,
    situacao_id: compra.situacaoCompraId ?? null,
    situacao: compra.situacaoCompraNome ?? null,
    abertura: compra.dataAberturaProposta ?? null,
    encerramento: compra.dataEncerramentoProposta ?? null,
    valor_estimado: compra.valorTotalEstimado ?? null,
    existe_resultado: !!compra.existeResultado,
    arquivos: (Array.isArray(arquivos) ? arquivos : []).slice(0, 300).map((a) => ({
      seq: a.sequencialDocumento, titulo: String(a.titulo ?? '').slice(0, 200), tipo: a.tipoDocumentoNome ?? null,
      data: a.dataPublicacaoPncp ?? null, ativo: a.statusAtivo !== false, url: a.url ?? null,
    })),
    completo_em: agora.toISOString(),
  }
}

/** Eventos entre duas fotos. A primeira leitura (sem foto anterior) não gera eventos. */
export function compararFotos(antes, depois) {
  if (!antes) return []
  const ev = []
  if (depois.retirado && !antes.retirado) {
    return [{ tipo: 'retirado', nivel: 'alto', titulo: 'O edital saiu do PNCP (retirado ou excluído pelo órgão)', detalhe: {} }]
  }
  if (antes.situacao_id !== depois.situacao_id && depois.situacao_id != null) {
    const grave = SITUACAO_GRAVE.has(depois.situacao_id)
    ev.push({ tipo: 'situacao', nivel: grave ? 'alto' : 'medio', titulo: `Situação da compra mudou: ${antes.situacao ?? '—'} → ${depois.situacao ?? '—'}`, detalhe: { de: antes.situacao, para: depois.situacao } })
  }
  if (antes.encerramento !== depois.encerramento && depois.encerramento) {
    ev.push({ tipo: 'encerramento', nivel: 'alto', titulo: `Prazo das propostas mudou: ${dataLegivel(antes.encerramento)} → ${dataLegivel(depois.encerramento)}`, detalhe: { de: antes.encerramento, para: depois.encerramento } })
  }
  if (antes.abertura !== depois.abertura && depois.abertura) {
    ev.push({ tipo: 'abertura', nivel: 'medio', titulo: `Início do recebimento de propostas mudou: ${dataLegivel(antes.abertura)} → ${dataLegivel(depois.abertura)}`, detalhe: { de: antes.abertura, para: depois.abertura } })
  }
  if (!antes.existe_resultado && depois.existe_resultado) {
    ev.push({ tipo: 'resultado', nivel: 'medio', titulo: 'Resultado publicado no PNCP', detalhe: {} })
  }
  if (antes.valor_estimado != null && depois.valor_estimado != null && Number(antes.valor_estimado) !== Number(depois.valor_estimado)) {
    ev.push({ tipo: 'valor', nivel: 'baixo', titulo: 'Valor estimado da compra mudou', detalhe: { de: antes.valor_estimado, para: depois.valor_estimado } })
  }
  // Documentos: só compara quando as duas fotos trazem a lista (a foto rápida reaproveita a anterior).
  if (Array.isArray(antes.arquivos) && Array.isArray(depois.arquivos)) {
    const ativosAntes = new Map(antes.arquivos.filter((a) => a.ativo).map((a) => [a.seq, a]))
    const ativosDepois = new Map(depois.arquivos.filter((a) => a.ativo).map((a) => [a.seq, a]))
    for (const [seq, a] of ativosDepois) {
      if (ativosAntes.has(seq)) continue
      const nome = [a.tipo, a.titulo].filter(Boolean).join(' · ')
      ev.push({ tipo: 'documento_novo', nivel: DOC_IMPORTANTE.test(`${a.tipo} ${a.titulo}`) ? 'alto' : 'medio', titulo: `Novo documento publicado: ${nome}`.slice(0, 300), detalhe: { seq, titulo: a.titulo, tipo: a.tipo, url: a.url } })
    }
    for (const [seq, a] of ativosAntes) {
      if (ativosDepois.has(seq)) continue
      ev.push({ tipo: 'documento_retirado', nivel: 'baixo', titulo: `Documento retirado: ${[a.tipo, a.titulo].filter(Boolean).join(' · ')}`.slice(0, 300), detalhe: { seq, titulo: a.titulo, tipo: a.tipo } })
    }
  }
  return ev
}

/** Quando verificar de novo: mais perto do prazo das propostas, mais vezes. */
export function proximaVerificacao(estado, agora = new Date(), falhas = 0) {
  const t = agora.getTime()
  if (falhas > 0) return new Date(t + Math.min(6 * 3600e3, 15 * 60e3 * 2 ** Math.min(falhas, 5))).toISOString()
  const enc = ms(estado?.encerramento)
  let min = 120
  if (estado?.retirado) min = 24 * 60
  else if (estado?.situacao_id === 4) min = 60
  else if (!Number.isNaN(enc)) {
    const h = (enc - t) / 3600e3
    if (h <= 72 && h >= -7 * 24) min = 30 // nos 3 dias antes da sessão e na semana seguinte (recursos, resultado)
    else if (h < -30 * 24) min = 12 * 60
  }
  return new Date(t + min * 60e3).toISOString()
}

/** Lê um edital no PNCP e devolve {estado, eventos} ou {erro}. */
export async function verificarEdital({ controle, estado: antes }, { fetcher = fetch, agora = new Date() } = {}) {
  const m = CONTROLE.exec(controle)
  if (!m) return { erro: 'Número de controle inválido' }
  const [, cnpj, seq, ano] = m
  const pedir = (url) => fetcher(url, { headers: { Accept: 'application/json', 'User-Agent': 'licitaflow-sentinela' }, signal: AbortSignal.timeout(20000) })
  const r = await pedir(`${CONSULTA}/${cnpj}/compras/${ano}/${seq}`)
  if (r.status === 404) {
    // Confirma pela lista de arquivos antes de dizer que o edital saiu do PNCP.
    const a = await pedir(`${PNCP}/${cnpj}/compras/${ano}/${seq}/arquivos`)
    if (a.status !== 404) return { erro: `PNCP respondeu ${r.status}/${a.status}` }
    const estado = { ...(antes ?? {}), retirado: true }
    return { estado, eventos: compararFotos(antes, estado) }
  }
  if (!r.ok) return { erro: `PNCP respondeu ${r.status}` }
  const compra = await r.json().catch(() => null)
  if (!compra?.numeroControlePNCP) return { erro: 'Resposta inesperada do PNCP' }
  const atualizacao = compra.dataAtualizacaoGlobal ?? compra.dataAtualizacao ?? null
  const recente = antes?.completo_em && agora.getTime() - Date.parse(antes.completo_em) < COMPLETO_A_CADA_MS
  if (antes && !antes.retirado && antes.atualizacao === atualizacao && recente) return { estado: antes, eventos: [] }
  const a = await pedir(`${PNCP}/${cnpj}/compras/${ano}/${seq}/arquivos`)
  if (!a.ok) return { erro: `Arquivos: PNCP respondeu ${a.status}` }
  const estado = fotoDoPncp(compra, await a.json().catch(() => []), agora)
  return { estado, eventos: compararFotos(antes, estado) }
}

async function emLotes(lista, n, fn) {
  const saida = []
  for (let i = 0; i < lista.length; i += n) saida.push(...(await Promise.all(lista.slice(i, i + n).map(fn))))
  return saida
}

/**
 * Rodada da Sentinela: pega o lote vencido, verifica cada edital, grava e manda os pushes.
 * `rpc(nome, corpo)` chama o banco com a chave de serviço; `chamar(caminho)` lê tabelas com ela.
 */
export async function rodadaSentinela({ token, rpc, chamar, fetcher = fetch, webpush = webpushPadrao, agora = () => new Date(), prazoMs = 100_000 }) {
  const inicio = Date.now()
  const lote = (await rpc('sentinela_lote', { p_token: token, p_limite: 30 })) ?? []
  const itens = await emLotes(lote, 5, async (e) => {
    if (Date.now() - inicio > prazoMs) return { controle: e.controle, erro: 'Sem tempo nesta rodada', proxima_em: new Date(Date.now() + 10 * 60e3).toISOString() }
    try {
      const r = await verificarEdital(e, { fetcher, agora: agora() })
      if (r.erro) return { controle: e.controle, erro: r.erro, proxima_em: proximaVerificacao(null, agora(), 1) }
      return { controle: e.controle, estado: r.estado, eventos: r.eventos, proxima_em: proximaVerificacao(r.estado, agora()) }
    } catch {
      return { controle: e.controle, erro: 'Falha ao consultar o PNCP', proxima_em: proximaVerificacao(null, agora(), 1) }
    }
  })
  const avisos = itens.length ? ((await rpc('sentinela_gravar', { p_token: token, p_itens: itens })) ?? []) : []
  const push = await avisarPorPush(avisos, { chamar, webpush }).catch(() => ({ enviados: 0, falhas: 0 }))
  return { verificados: itens.filter((i) => !i.erro).length, erros: itens.filter((i) => i.erro).length, eventos: itens.reduce((s, i) => s + (i.eventos?.length ?? 0), 0), avisos: avisos.length, ...push }
}

/** Junta os avisos por processo (um push por processo) e manda para os membros da organização. Nível baixo não vai por push. */
export async function avisarPorPush(avisos, { chamar, webpush }) {
  const porProcesso = new Map()
  for (const a of avisos) {
    if (a.nivel === 'baixo') continue
    const k = a.processo_id
    if (!porProcesso.has(k)) porProcesso.set(k, { org_id: a.org_id, processo_id: k, titulos: [], alto: false })
    const p = porProcesso.get(k)
    p.titulos.push(a.titulo)
    p.alto ||= a.nivel === 'alto'
  }
  if (!porProcesso.size) return { enviados: 0, falhas: 0 }
  const [chave] = (await chamar('/rest/v1/push_vapid?select=publica,privada&id=eq.true')) ?? []
  if (!chave) return { enviados: 0, falhas: 0 } // ninguém ativou notificações ainda
  webpush.setVapidDetails(CONTATO, chave.publica, chave.privada)
  const orgs = [...new Set([...porProcesso.values()].map((p) => p.org_id))]
  const membros = (await chamar(`/rest/v1/memberships?select=org_id,user_id&org_id=in.(${orgs.join(',')})`)) ?? []
  const usuarios = [...new Set(membros.map((m) => m.user_id))]
  const inscricoes = usuarios.length ? ((await chamar(`/rest/v1/push_inscricoes?select=id,user_id,endpoint,p256dh,auth&user_id=in.(${usuarios.join(',')})`)) ?? []) : []
  let enviados = 0, falhas = 0
  const mortas = []
  for (const p of porProcesso.values()) {
    const quem = new Set(membros.filter((m) => m.org_id === p.org_id).map((m) => m.user_id))
    const payload = JSON.stringify({
      titulo: p.alto ? 'Sentinela: atenção no edital' : 'Sentinela: novidade no edital',
      texto: p.titulos.join(' · ').slice(0, 180), url: `/app/processos/${p.processo_id}`, tag: `sentinela-${p.processo_id}`,
    })
    await Promise.all(inscricoes.filter((s) => quem.has(s.user_id)).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: p.alto ? 'high' : 'normal', timeout: 10000 })
        enviados++
      } catch (e) {
        falhas++
        if (e?.statusCode === 404 || e?.statusCode === 410) mortas.push(s.id)
      }
    }))
  }
  if (mortas.length) await chamar(`/rest/v1/push_inscricoes?id=in.(${mortas.join(',')})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }).catch(() => undefined)
  return { enviados, falhas }
}
