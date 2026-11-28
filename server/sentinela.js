// Agente Sentinela: compara a foto atual de cada edital no PNCP com a anterior e descreve o que mudou.
// Chamado pelo pg_cron (POST /api/agentes?agente=sentinela&acao=verificar com o token x-coleta).
// Não usa IA. Detalhes em docs/sentinela.md.
import webpushPadrao from 'web-push'
import { filtrarPushAgente, registrarNoSino } from './pushAgentes.js'

const CONSULTA = 'https://pncp.gov.br/api/consulta/v1/orgaos'
const PNCP = 'https://pncp.gov.br/api/pncp/v1/orgaos'
const CONTROLE = /^(\d{14})-1-0*(\d{1,9})\/(\d{4})$/
const COMPLETO_A_CADA_MS = 6 * 3600e3 // relê a lista de arquivos ao menos a cada 6 h, mesmo sem mudança na compra
const CONTATO = 'https://licitaforce-app.vercel.app'
// Situações da compra no PNCP: 1 Divulgada, 2 Revogada, 3 Anulada, 4 Suspensa.
const SITUACOES = {
  1: { titulo: 'Compra divulgada', nivel: 'medio', orientacao: 'A compra está ativa no PNCP. Confira as datas e os documentos publicados.' },
  2: { titulo: 'Compra revogada pelo órgão', nivel: 'alto', orientacao: 'A licitação foi desfeita por decisão da Administração e não haverá disputa nesta compra. Confira o aviso de revogação para saber o motivo e se haverá nova licitação.' },
  3: { titulo: 'Compra anulada pelo órgão', nivel: 'alto', orientacao: 'A licitação foi anulada por ilegalidade. Leia o aviso de anulação: normalmente o órgão publica uma nova licitação, com outro número.' },
  4: { titulo: 'Compra suspensa pelo órgão', nivel: 'alto', orientacao: 'A sessão não acontece na data prevista enquanto a suspensão durar. A Sentinela avisa quando o órgão retomar a compra ou publicar nova data.' },
}

/** "2026-11-25T08:30:00" (horário de Brasília, como o PNCP manda) → "25/11/2026 08:30". */
export function dataLegivel(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(s ?? ''))
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : 'sem data'
}
/** Data do PNCP (sem fuso, horário de Brasília) → milissegundos. */
const ms = (s) => (s ? Date.parse(`${String(s).slice(0, 19)}-03:00`) : NaN)
const moeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const sem = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Nome do arquivo apresentável: sem extensão, sem sublinhados e sem códigos internos do sistema de origem. */
export function nomeDocumento(titulo) {
  let t = String(titulo ?? '').replace(/\.(pdf|docx?|xlsx?|odt|ods|zip|rar|7z|txt|jpe?g|png)$/i, '')
  t = t.replace(/[_]+/g, ' ').replace(/\s*-\s*/g, ' - ')
  t = t.split(/\s+/).filter((p) => !(p.length >= 14 && /\d/.test(p) && /[a-z]/i.test(p) && /^[a-z0-9]+$/i.test(p))).join(' ')
  t = t.replace(/\s+/g, ' ').replace(/^[\s\-–]+|[\s\-–]+$/g, '').trim()
  return (t || 'documento sem nome').slice(0, 110)
}

/** Tipo de documento publicado, com o nível do aviso e a orientação ao licitante. */
export function categoriaDocumento(tipo, titulo) {
  const t = sem(`${tipo ?? ''} ${titulo ?? ''}`)
  const c = (rotulo, nivel, orientacao) => ({ rotulo, nivel, orientacao })
  if (/errata|retifica|aditamento|alteracao do edital|edital retificado/.test(t))
    return c('Errata / retificação do edital', 'alto', 'Confira se a retificação altera exigências de habilitação, da proposta ou as datas. Se a mudança afetar a formulação das propostas, o prazo de divulgação deve ser reaberto (Lei 14.133, art. 55, § 1º).')
  if (/esclarec/.test(t))
    return c('Resposta a pedido de esclarecimento', 'alto', 'As respostas a esclarecimentos complementam o edital e valem para todos os licitantes. Leia antes de fechar a proposta e os documentos.')
  if (/impugna/.test(t))
    return c('Impugnação / decisão sobre impugnação', 'alto', 'Se a impugnação for acolhida, o edital pode ser alterado e a data remarcada. Acompanhe a decisão e eventual nova publicação.')
  if (/suspens|adiamento|adiad|prorroga|nova data|reabertura|remarca/.test(t))
    return c('Aviso de suspensão ou nova data', 'alto', 'O cronograma da compra mudou. Confira a nova data da sessão e reorganize a proposta e os documentos.')
  if (/revoga|anula|cancelament/.test(t))
    return c('Aviso de revogação ou anulação', 'alto', 'O órgão publicou a revogação ou anulação da compra. Leia o motivo e verifique se haverá nova licitação.')
  if (/recurso|contrarraz/.test(t))
    return c('Recurso / contrarrazões', 'alto', 'Fase recursal em andamento: as razões e as contrarrazões têm prazo de 3 dias úteis (Lei 14.133, art. 165). Avalie se precisa se manifestar.')
  if (/\bata\b(?!.*registro)|sessao publica|relatorio de disputa|julgamento/.test(t))
    return c('Ata / julgamento da sessão', 'medio', 'A ata registra lances, aceitação e habilitação. Confira a sua colocação e eventuais motivos de desclassificação ou inabilitação.')
  if (/homologa|adjudica|resultado/.test(t))
    return c('Resultado / homologação', 'medio', 'Confira o vencedor de cada item. Após a homologação, o órgão convoca o vencedor para assinar o contrato ou a ata.')
  if (/registro de preco|\barp\b|contrato|empenho/.test(t))
    return c('Contrato / ata de registro de preços', 'medio', 'Documento da fase de contratação. Se a sua empresa venceu, confira prazos de assinatura e de entrega.')
  if (/\bedital\b/.test(t))
    return c('Nova versão do edital', 'alto', 'Compare com a versão anterior: mudanças no edital podem alterar a proposta e a habilitação.')
  if (/termo de referencia|projeto basico|anexo|planilha|especifica|memorial|estudo tecnico|\betp\b/.test(t))
    return c('Anexo do edital', 'medio', 'Novo anexo ou especificação. Verifique se altera quantitativos, especificações ou o modelo da proposta.')
  if (/aviso|comunicado|informe/.test(t))
    return c('Aviso do órgão', 'medio', 'Leia o aviso: comunicados do órgão podem trazer mudanças de cronograma ou de procedimento.')
  return c('Documento publicado', 'medio', 'O órgão publicou um documento novo nesta compra. Abra para conferir se afeta a sua participação.')
}

/** Identificação curta da compra para avisos: "Pregão Eletrônico nº 45/2026 · Prefeitura de X (MG)". */
export function identificacao(ident) {
  if (!ident) return null
  const modalidade = String(ident.modalidade ?? '').replace(/\s*-\s*/g, ' ').trim()
  const numero = ident.numero ? ` nº ${ident.numero}` : ''
  const local = ident.uf ? ` (${ident.uf})` : ''
  const orgao = ident.orgao ? ` · ${String(ident.orgao).slice(0, 60)}${local}` : ''
  return `${modalidade}${numero}${orgao}`.trim() || null
}

/** Foto do edital que fica guardada para a próxima comparação. */
export function fotoDoPncp(compra, arquivos, agora = new Date()) {
  return {
    atualizacao: compra.dataAtualizacaoGlobal ?? compra.dataAtualizacao ?? null,
    situacao_id: compra.situacaoCompraId ?? null,
    situacao: compra.situacaoCompraNome ?? null,
    abertura: compra.dataAberturaProposta ?? null,
    encerramento: compra.dataEncerramentoProposta ?? null,
    valor_estimado: compra.valorTotalEstimado ?? null,
    valor_homologado: compra.valorTotalHomologado ?? null,
    existe_resultado: !!compra.existeResultado,
    ident: {
      modalidade: compra.modalidadeNome ?? null,
      numero: compra.numeroCompra && compra.anoCompra ? `${compra.numeroCompra}/${compra.anoCompra}` : (compra.numeroCompra ?? null),
      orgao: compra.orgaoEntidade?.razaoSocial ?? null,
      municipio: compra.unidadeOrgao?.municipioNome ?? null,
      uf: compra.unidadeOrgao?.ufSigla ?? null,
      objeto: compra.objetoCompra ? String(compra.objetoCompra).slice(0, 200) : null,
    },
    arquivos: (Array.isArray(arquivos) ? arquivos : []).slice(0, 300).map((a) => ({
      seq: a.sequencialDocumento, titulo: String(a.titulo ?? '').slice(0, 200), tipo: a.tipoDocumentoNome ?? null,
      data: a.dataPublicacaoPncp ?? null, ativo: a.statusAtivo !== false, url: a.url ?? null,
    })),
    completo_em: agora.toISOString(),
  }
}

/** Diferença entre duas datas do PNCP em texto: "+5 dias", "-2 dias", "+3 h". */
function diferenca(de, para) {
  const d = ms(para) - ms(de)
  if (Number.isNaN(d) || d === 0) return ''
  const h = Math.round(Math.abs(d) / 3600e3)
  const sinal = d > 0 ? '+' : '−'
  if (h < 24) return `${sinal}${h} h`
  const dias = Math.round(h / 24)
  return `${sinal}${dias} dia${dias > 1 ? 's' : ''}`
}

/**
 * Eventos entre duas fotos. A primeira leitura (sem foto anterior) não gera eventos.
 * Cada evento: {tipo, nivel, titulo, orientacao, detalhe: {antes, depois, contexto, categoria, url, ...}}.
 */
export function compararFotos(antes, depois) {
  if (!antes) return []
  const contexto = identificacao(depois.ident ?? antes.ident)
  const ev = []
  const add = (e) => ev.push({ ...e, titulo: e.titulo.slice(0, 300), detalhe: { contexto, ...(e.detalhe ?? {}), orientacao: e.orientacao } })
  if (depois.retirado && !antes.retirado) {
    add({ tipo: 'retirado', nivel: 'alto', titulo: 'Compra removida do PNCP',
      orientacao: 'O órgão retirou a publicação do PNCP. Confirme no portal de origem se a licitação foi cancelada ou republicada com outro número.' })
    return ev
  }
  if (antes.situacao_id !== depois.situacao_id && depois.situacao_id != null) {
    const retomada = antes.situacao_id === 4 && depois.situacao_id === 1
    const s = SITUACOES[depois.situacao_id]
    if (retomada) add({ tipo: 'situacao', nivel: 'alto', titulo: 'Compra retomada pelo órgão', detalhe: { antes: antes.situacao, depois: depois.situacao },
      orientacao: `A suspensão terminou. Confira a data da sessão${depois.encerramento ? ` (prazo final das propostas: ${dataLegivel(depois.encerramento)})` : ''} e os documentos publicados durante a suspensão.` })
    else add({ tipo: 'situacao', nivel: s?.nivel ?? 'medio', titulo: s?.titulo ?? `Situação da compra: ${depois.situacao ?? '—'}`,
      detalhe: { antes: antes.situacao, depois: depois.situacao }, orientacao: s?.orientacao ?? 'A situação da compra mudou no PNCP. Confira o motivo nos documentos publicados.' })
  }
  if (antes.encerramento !== depois.encerramento && depois.encerramento) {
    const adiada = ms(depois.encerramento) > ms(antes.encerramento)
    const dif = diferenca(antes.encerramento, depois.encerramento)
    add({ tipo: 'encerramento', nivel: 'alto',
      titulo: antes.encerramento ? `Prazo final das propostas ${adiada ? 'adiado' : 'antecipado'} para ${dataLegivel(depois.encerramento)}${dif ? ` (${dif})` : ''}` : `Prazo final das propostas definido: ${dataLegivel(depois.encerramento)}`,
      detalhe: { antes: antes.encerramento ? dataLegivel(antes.encerramento) : null, depois: dataLegivel(depois.encerramento) },
      orientacao: adiada || !antes.encerramento
        ? 'Atualize o cronograma da proposta. Pedidos de esclarecimento e impugnações têm prazo de até 3 dias úteis antes da abertura (Lei 14.133, art. 164), contados da nova data.'
        : 'Você tem menos tempo do que o previsto: priorize a proposta e os documentos de habilitação.' })
  }
  if (antes.abertura !== depois.abertura && depois.abertura) {
    add({ tipo: 'abertura', nivel: 'medio', titulo: `Início do recebimento de propostas alterado para ${dataLegivel(depois.abertura)}`,
      detalhe: { antes: antes.abertura ? dataLegivel(antes.abertura) : null, depois: dataLegivel(depois.abertura) },
      orientacao: 'A partir desta data o sistema aceita o cadastro da proposta.' })
  }
  if (!antes.existe_resultado && depois.existe_resultado) {
    const hom = depois.valor_homologado != null && Number(depois.valor_homologado) > 0 ? moeda(depois.valor_homologado) : null
    add({ tipo: 'resultado', nivel: 'medio', titulo: hom ? `Resultado publicado · valor homologado ${hom}` : 'Resultado publicado no PNCP',
      detalhe: { depois: hom },
      orientacao: 'Confira o vencedor e a colocação de cada item. Se for recorrer, a intenção de recurso precisa ser manifestada no sistema logo após o julgamento (Lei 14.133, art. 165).' })
  }
  if (Array.isArray(depois.resultados)) {
    const chave = x => `${x.item}:${x.sequencial ?? x.cnpj}`
    const conteudo = x => x && JSON.stringify([x.cnpj, x.fornecedor, x.situacao_id, x.situacao, x.valor, x.data, x.classificacao, x.reserva])
    const anteriores = new Map((antes.resultados ?? []).map(x => [chave(x), x]))
    for (const resultado of depois.resultados) {
      if (conteudo(anteriores.get(chave(resultado))) === conteudo(resultado)) continue
      add({ tipo: 'resultado_item', nivel: Number(resultado.situacao_id) === 2 ? 'alto' : 'medio',
        titulo: `Resultado do item ${resultado.item}: ${resultado.fornecedor ?? resultado.cnpj} · ${resultado.situacao ?? 'publicado'}`,
        orientacao: 'Confira o resultado publicado e o CNPJ da empresa vinculada ao processo. A publicação no PNCP não informa todos os lances ou a classificação da disputa em tempo real.',
        detalhe: { ...resultado } })
    }
  }
  if (antes.valor_estimado != null && depois.valor_estimado != null && Number(antes.valor_estimado) !== Number(depois.valor_estimado)) {
    const de = Number(antes.valor_estimado), para = Number(depois.valor_estimado)
    const pct = de > 0 ? Math.round(((para - de) / de) * 1000) / 10 : null
    add({ tipo: 'valor', nivel: 'baixo', titulo: `Valor estimado alterado para ${moeda(para)}${pct != null ? ` (${pct > 0 ? '+' : ''}${String(pct).replace('.', ',')}%)` : ''}`,
      detalhe: { antes: moeda(de), depois: moeda(para) },
      orientacao: 'Mudanças no valor estimado costumam acompanhar ajustes de quantitativos ou de itens. Revise a sua planilha de preços.' })
  }
  // Documentos: só compara quando as duas fotos trazem a lista (a foto rápida reaproveita a anterior).
  if (Array.isArray(antes.arquivos) && Array.isArray(depois.arquivos)) {
    const ativosAntes = new Map(antes.arquivos.filter((a) => a.ativo).map((a) => [a.seq, a]))
    const ativosDepois = new Map(depois.arquivos.filter((a) => a.ativo).map((a) => [a.seq, a]))
    for (const [seq, a] of ativosDepois) {
      if (ativosAntes.has(seq)) continue
      const cat = categoriaDocumento(a.tipo, a.titulo)
      const nome = nomeDocumento(a.titulo)
      add({ tipo: 'documento_novo', nivel: cat.nivel, titulo: `${cat.rotulo}: ${nome}`, orientacao: cat.orientacao,
        detalhe: { seq, categoria: cat.rotulo, documento: nome, tipo_pncp: a.tipo, publicado_em: a.data ? dataLegivel(a.data) : null, url: a.url } })
    }
    for (const [seq, a] of ativosAntes) {
      if (ativosDepois.has(seq)) continue
      const nome = nomeDocumento(a.titulo)
      add({ tipo: 'documento_retirado', nivel: 'baixo', titulo: `Documento retirado da publicação: ${nome}`,
        orientacao: 'O órgão removeu ou substituiu este documento. Se ele servia de base para a proposta, procure a versão nova.',
        detalhe: { seq, documento: nome, tipo_pncp: a.tipo } })
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
  const pedir = (url) => fetcher(url, { headers: { Accept: 'application/json', 'User-Agent': 'licitaforce-sentinela' }, signal: AbortSignal.timeout(20000) })
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
  if (antes && !antes.retirado && antes.atualizacao === atualizacao && recente && antes.historico_em && !antes.historico_parcial && !antes.historico_erro && !antes.resultados_parcial && !antes.resultados_erro && (!compra.existeResultado || antes.resultados_consultados_em)) return { estado: antes, eventos: [] }
  const a = await pedir(`${PNCP}/${cnpj}/compras/${ano}/${seq}/arquivos`)
  if (!a.ok) return { erro: `Arquivos: PNCP respondeu ${a.status}` }
  const arquivos = await a.json().catch(() => null)
  if (!Array.isArray(arquivos)) return { erro: 'Lista de arquivos inválida no PNCP' }
  const estado = fotoDoPncp(compra, arquivos, agora)
  Object.assign(estado, await consultarHistorico(`${PNCP}/${cnpj}/compras/${ano}/${seq}`, antes, pedir, agora))
  if (compra.existeResultado) {
    // Retoma em lotes pequenos: compras grandes não podem exceder o tempo da rodada.
    Object.assign(estado, await consultarResultados(`${PNCP}/${cnpj}/compras/${ano}/${seq}`, antes, pedir, agora))
  }
  return { estado, eventos: compararFotos(antes, estado) }
}

async function consultarHistorico(base, antes, pedir, agora) {
  const pagina = antes?.historico_parcial ? (antes.historico_pagina ?? 1) : 1
  try {
    const r = await pedir(`${base}/historico?pagina=${pagina}&tamanhoPagina=100`)
    if (!r.ok) throw new Error(`Histórico: PNCP respondeu ${r.status}`)
    const lista = await r.json()
    if (!Array.isArray(lista) || lista.some(x => !x.logManutencaoDataInclusao || !x.tipoLogManutencaoNome)) throw new Error('Histórico inválido no PNCP')
    const novos = lista.map(x => ({ data: x.logManutencaoDataInclusao, operacao: x.tipoLogManutencaoNome,
      categoria: x.categoriaLogManutencaoNome, item: x.itemNumero ?? x.itemResultadoNumero ?? null,
      documento: x.documentoTitulo ? nomeDocumento(x.documentoTitulo) : null,
      justificativa: String(x.justificativa ?? '').slice(0, 500) }))
    const porChave = new Map([...(antes?.historico ?? []), ...novos].map(x => [JSON.stringify([x.data, x.operacao, x.categoria, x.item, x.documento, x.justificativa]), x]))
    return { historico: [...porChave.values()].sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 200),
      historico_parcial: lista.length === 100, historico_pagina: pagina + 1, historico_erro: null, historico_em: agora.toISOString() }
  } catch (e) {
    return { historico: antes?.historico ?? [], historico_parcial: true, historico_pagina: pagina,
      historico_erro: e instanceof Error ? e.message : 'Falha ao consultar o histórico no PNCP', historico_em: antes?.historico_em ?? null }
  }
}

/** Resultados são públicos e compartilhados; o CNPJ privado do cliente é cruzado apenas no resumo da organização. */
async function consultarResultados(base, antes, pedir, agora) {
  const pagina = antes?.resultados_parcial ? (antes.resultados_pagina ?? 1) : 1
  const inicio = antes?.resultados_parcial ? (antes.resultados_offset ?? 0) : 0
  const anteriores = antes?.resultados ?? []
  try {
    const r = await pedir(`${base}/itens?pagina=${pagina}&tamanhoPagina=100`)
    if (!r.ok) throw new Error(`Itens: PNCP respondeu ${r.status}`)
    const itens = await r.json()
    if (!Array.isArray(itens) || itens.some(i => !Number.isInteger(i.numeroItem))) throw new Error('Lista de itens inválida no PNCP')
    const lote = itens.slice(inicio, inicio + 10)
    const novos = await emLotes(lote, 5, async (item) => {
      if (!item.temResultado) return []
      const resposta = await pedir(`${base}/itens/${item.numeroItem}/resultados`)
      if (!resposta.ok) throw new Error(`Resultados do item ${item.numeroItem}: PNCP respondeu ${resposta.status}`)
      const lista = await resposta.json()
      if (!Array.isArray(lista) || lista.some(x => !x.niFornecedor || x.situacaoCompraItemResultadoId == null)) throw new Error(`Resultado inválido do item ${item.numeroItem}`)
      return lista.map(x => ({ item: item.numeroItem, sequencial: x.sequencialResultado,
        cnpj: String(x.niFornecedor).replace(/[^a-z0-9]/gi, '').toUpperCase(), fornecedor: x.nomeRazaoSocialFornecedor,
        situacao_id: x.situacaoCompraItemResultadoId, situacao: x.situacaoCompraItemResultadoNome,
        valor: x.valorTotalHomologado, data: x.dataResultado, classificacao: x.ordemClassificacaoSrp ?? null,
        reserva: x.reservaRemanescenteId ?? null }))
    })
    const consultados = new Set(lote.map(x => x.numeroItem))
    // No início de um ciclo mantém os demais itens até serem novamente conferidos.
    let resultados = [...anteriores.filter(x => !consultados.has(x.item)), ...novos.flat()]
    const fimPagina = inicio + lote.length >= itens.length
    const parcial = !fimPagina || itens.length === 100
    const vistos = [...new Set([...(pagina === 1 && inicio === 0 ? [] : (antes?.resultados_itens_vistos ?? [])), ...itens.map(x => x.numeroItem)])]
    if (!parcial) resultados = resultados.filter(x => vistos.includes(x.item))
    return { resultados, resultados_parcial: parcial, resultados_pagina: fimPagina ? pagina + 1 : pagina,
      resultados_itens_vistos: vistos,
      resultados_offset: fimPagina ? 0 : inicio + lote.length, resultados_erro: null,
      resultados_consultados_em: agora.toISOString() }
  } catch (e) {
    return { resultados: anteriores, resultados_parcial: true, resultados_pagina: pagina, resultados_offset: inicio,
      resultados_itens_vistos: antes?.resultados_itens_vistos ?? [],
      resultados_consultados_em: antes?.resultados_consultados_em ?? null,
      resultados_erro: e instanceof Error ? e.message : 'Falha ao consultar resultados no PNCP' }
  }
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
      if (r.erro) return { controle: e.controle, erro: r.erro, proxima_em: proximaVerificacao(null, agora(), (e.falhas ?? 0) + 1) }
      return { controle: e.controle, estado: r.estado, eventos: r.eventos, proxima_em: r.estado.resultados_parcial || r.estado.historico_parcial ? new Date(agora().getTime() + 30 * 60e3).toISOString() : proximaVerificacao(r.estado, agora()) }
    } catch {
      return { controle: e.controle, erro: 'Falha ao consultar o PNCP', proxima_em: proximaVerificacao(null, agora(), (e.falhas ?? 0) + 1) }
    }
  })
  const avisos = itens.length ? ((await rpc('sentinela_gravar', { p_token: token, p_itens: itens })) ?? []) : []
  // Identificação da compra de cada edital, para o push dizer de qual licitação se trata.
  const contextos = Object.fromEntries(itens.filter((i) => i.estado?.ident).map((i) => [i.controle, identificacao(i.estado.ident)]))
  const push = await avisarPorPush(avisos.map((a) => ({ ...a, contexto: a.contexto ?? contextos[a.controle] ?? null })), { chamar, webpush }).catch(() => ({ enviados: 0, falhas: 0 }))
  return { verificados: itens.filter((i) => !i.erro).length, erros: itens.filter((i) => i.erro).length, eventos: itens.reduce((s, i) => s + (i.eventos?.length ?? 0), 0), avisos: avisos.length, ...push }
}

/** Junta os avisos por processo (um push por processo) e manda para os membros da organização. Nível baixo não vai por push. */
export async function avisarPorPush(avisos, { chamar, webpush }) {
  const porProcesso = new Map()
  for (const a of avisos) {
    if (a.nivel === 'baixo') continue
    const k = a.processo_id
    if (!porProcesso.has(k)) porProcesso.set(k, { org_id: a.org_id, processo_id: k, titulos: [], alto: false, contexto: null })
    const p = porProcesso.get(k)
    // Os de atenção primeiro.
    if (a.nivel === 'alto') p.titulos.unshift(a.titulo)
    else p.titulos.push(a.titulo)
    p.alto ||= a.nivel === 'alto'
    p.contexto ||= a.contexto ?? null
  }
  if (!porProcesso.size) return { enviados: 0, falhas: 0 }
  const [chave] = (await chamar('/rest/v1/push_vapid?select=publica,privada&id=eq.true')) ?? []
  if (!chave) return { enviados: 0, falhas: 0 } // ninguém ativou notificações ainda
  webpush.setVapidDetails(CONTATO, chave.publica, chave.privada)
  const orgs = [...new Set([...porProcesso.values()].map((p) => p.org_id))]
  const membros = (await chamar(`/rest/v1/memberships?select=org_id,user_id&org_id=in.(${orgs.join(',')})`)) ?? []
  const usuarios = [...new Set(membros.map((m) => m.user_id))]
  const inscricoes = await filtrarPushAgente(usuarios.length ? ((await chamar(`/rest/v1/push_inscricoes?select=id,user_id,endpoint,p256dh,auth&user_id=in.(${usuarios.join(',')})`)) ?? []) : [], 'sentinela', chamar)
  let enviados = 0, falhas = 0
  const mortas = [], sino = []
  for (const p of porProcesso.values()) {
    const quem = new Set(membros.filter((m) => m.org_id === p.org_id).map((m) => m.user_id))
    const mais = p.titulos.length > 1 ? ` (+${p.titulos.length - 1} ${p.titulos.length > 2 ? 'outras mudanças' : 'outra mudança'})` : ''
    const msg = {
      titulo: `${p.alto ? 'Sentinela · Atenção' : 'Sentinela'}${p.contexto ? ` · ${p.contexto}` : ''}`.slice(0, 120),
      texto: `${p.titulos[0]}${mais}`.slice(0, 180), url: `/app/processos/${p.processo_id}`, tag: `sentinela-${p.processo_id}`,
    }
    const payload = JSON.stringify(msg)
    await Promise.all(inscricoes.filter((s) => quem.has(s.user_id)).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: p.alto ? 'high' : 'normal', timeout: 10000 })
        enviados++
        sino.push({ org_id: p.org_id, user_id: s.user_id, tipo: 'sentinela', titulo: msg.titulo, mensagem: msg.texto, link: msg.url })
      } catch (e) {
        falhas++
        if (e?.statusCode === 404 || e?.statusCode === 410) mortas.push(s.id)
      }
    }))
  }
  if (mortas.length) await chamar(`/rest/v1/push_inscricoes?id=in.(${mortas.join(',')})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }).catch(() => undefined)
  await registrarNoSino(chamar, sino)
  return { enviados, falhas }
}
