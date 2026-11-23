import { emCache, excedeuLimite, guardarNoNavegador, usuarioLogado } from './protecao.js'
import { cnpjBloqueado } from './bloqueio.js'
import { createHash } from 'node:crypto'
import { HASH_PORTAL } from './propostas-portal.js'
// Leitura das atas de sessão publicadas no PNCP: abre os PDFs (ata da sessão, julgamento, homologação)
// e separa os trechos de desclassificação, inabilitação e recusa, com empresa, itens e motivo.
// As atas do Compras.gov.br (federais) ficam atrás de captcha e normalmente não vão para o PNCP;
// por isso a cobertura é maior em compras de estados e municípios. Nada é guardado no banco.

const PNCP = 'https://pncp.gov.br/api/pncp/v1/orgaos'
const MAX_DOCS = 2
const MAX_BYTES = 12 * 1024 * 1024
const MAX_PAGINAS = 80
const MAX_ENVIO = 3 * 1024 * 1024 // PDF enviado pelo usuário (o corpo da requisição na Vercel vai até 4,5 MB)

/** Documento com cara de ata/relatório da sessão (não minuta de ARP, edital ou contrato). Menor = mais relevante. */
export function prioridadeDocumento(titulo = '', tipo = '') {
  const t = `${titulo} ${tipo}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (/minuta|registro de preco|\barp\b|edital|termo de referencia|estudo tecnico|contrato|aviso|dfd|mapa de risco|parecer/.test(t)) return null
  if (/\bata\b.*(sessao|preg|disputa|julg|licita|abertura|realiza)|sessao publica|ata_da_sessao|ata-sessao|ata da sessao/.test(t)) return 1
  if (/julgament|relatorio.*(disputa|sessao|licita)|resultado.*(licita|julg)|habilitac/.test(t)) return 2
  if (/\bata\b/.test(t) && !/registro/.test(t)) return 3
  if (/adjudica|homologa/.test(t)) return 4
  return null
}

// Empresa que não chegou a mandar proposta/documentos (ou desistiu): também entra na lista de empresas.
const SEM_PROPOSTA = /n[ãa]o\s+(?:enviou|encaminhou|apresentou|anexou|cadastrou|inseriu)\s+(?:a\s+|sua\s+|nenhuma\s+)?(?:proposta|documenta|anexo)|deixou\s+de\s+(?:enviar|encaminhar|apresentar|anexar)\s+(?:a\s+|sua\s+)?(?:proposta|documenta)|proposta\s+n[ãa]o\s+(?:informada|enviada|anexada|apresentada)|n[ãa]o\s+compareceu|desist(?:iu|[êe]ncia)\s+d[aoe]/i
const CHAVE = new RegExp(`desclassificad|desclassifica[çc][ãa]o|inabilitad|inabilita[çc][ãa]o|recusad|reprovad|n[ãa]o\\s+(?:foi\\s+)?aceit|${SEM_PROPOSTA.source}`, 'i')
// Regras do edital lidas na ata ("será desclassificada", "sob pena de"): não são ocorrências.
// Decisões que afastam a desclassificação ("não há motivo para inabilitação") também não contam.
const NEGACAO = /aus[êe]ncia de (?:motivo|irregularidade)|n[ãa]o (?:h[áa]|se (?:identifica|verifica)|houve)\b[^.]{0,60}(?:desclassifica|inabilita)|capaz de justificar|justificar a (?:desclassifica|inabilita)|pela conformidade|consider[ae]-?\s?se superad|revers[ãa]o da (?:desclassifica|inabilita)|n[ãa]o assiste raz[ãa]o|inexistindo fundamento|n[ãa]o tendo sido demonstrad|rejeitando\s?-?\s?se o pedido|antes de qualquer|n[ãa]o tem raz[ãa]o/i
// Só conta o que afirma a decisão: "foi desclassificada", "pela inabilitação", "Motivo:", "restando desclassificada"...
const AFIRMA_BASE = /\b(?:foi|foram|fica|ficam|ficou|resta(?:ndo)?|est[áa]|sendo|considerad[oa]s?)\s+(?:\w+\s+){0,2}(?:desclassificad|inabilitad|recusad|reprovad)|\bpela\s+(?:sua\s+)?(?:desclassifica|inabilita|recusa)|decid\w*\s?-?\s?se\s+pela|(?:desclassificad|inabilitad|recusad)[oa]s?\s*[.:(-]\s*(?:Motivo|\w)|Motivo\s*:|(?:Desclassifica[çc][ãa]o|Inabilita[çc][ãa]o)\s*:|\bdesclassific(?:o|amos|a-se)\b|\binabilit(?:o|amos|a-se)\b|\brecus(?:o|amos|a-se)\b/i
const AFIRMA = new RegExp(`${AFIRMA_BASE.source}|${SEM_PROPOSTA.source}`, 'i')
const GENERICO = /\b(poder[áa]|ser[áa]|ser[ãa]o|ficar[áa]|implicar[áa]|acarretar[áa]|ensejar[áa]|dever[áa]|sob pena|s[óo] ser[áa] poss[íi]vel|na hip[óo]tese|se houver|implica(?:r)? na|motivo de desclassifica)\b/i
const SUFIXO = '(?:LTDA\\.?|EIRELI|S\\/A|S\\.A\\.?|ME|EPP|MEI|SA)'
const NOME_EMPRESA = new RegExp(`([A-ZÀ-Ü0-9&][A-ZÀ-Ü0-9&.,'/\\- ]{2,90}?\\s${SUFIXO})(?![A-Za-zÀ-ü])`, 'g')
const CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/

const limpar = (s) => s.replace(/\s+/g, ' ').trim()
const so = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/** Apelidos que alguns portais usam no lugar do nome (ex.: LIC004 → CORREA & BOSSOLAN LTDA). */
function apelidos(texto) {
  const mapa = {}
  const re = new RegExp(`\\b((?:LIC|FORN|F)\\d{2,4})\\s+([A-ZÀ-Ü0-9&][A-ZÀ-Ü0-9&.,'/\\- ]{2,90}?\\s${SUFIXO})(?![A-Za-zÀ-ü])`, 'g')
  for (const m of texto.matchAll(re)) mapa[m[1]] ??= limpar(m[2])
  return mapa
}

const PREFIXO_NOME = /^(?:(?:\d+[º°]?|-|MENSAGEM|PREGOEIR[OA]|SISTEMA|AGENTE|CONTRATA[ÇC][ÃA]O|COMISS[ÃA]O|PARA|TODOS|DE|DA|DO|A|O|EMPRESA|FORNECEDOR|LICITANTE|PARTICIPANTE|DESCLASSIFICA[ÇC][ÃA]O|INABILITA[ÇC][ÃA]O|RECUSA|ITEM|LOTE|GRUPO)\s+)+/i
const limparNome = (s) => limpar(s).replace(/^[\d.,/\-–() ]+(?:\(proposta\)\s*)?[\d.,/\-–() ]*/i, '').replace(PREFIXO_NOME, '').replace(/^[\d.,/\-–() ]+/, '')

function empresaDoTrecho(trecho, pos) {
  const cnpj = trecho.match(CNPJ)?.[0]?.replace(/\D/g, '') ?? null
  let melhor = null
  for (const m of trecho.matchAll(NOME_EMPRESA)) {
    const nome = limparNome(m[1])
    if (nome.length < 5) continue
    const d = m.index <= pos ? pos - m.index : (m.index - pos) * 2 // prefere o nome que vem antes da palavra-chave
    if (!melhor || d < melhor.d) melhor = { nome, d }
  }
  if (!melhor) {
    const m = /(?:[Ee]mpresa|EMPRESA|[Ll]icitante|LICITANTE|[Ff]ornecedora?|FORNECEDORA?)\s+([A-ZÀ-Ü][\wÀ-ü&.,'\- ]{2,80}?)(?=\s+(?:foi|est[áa]|teve|n[ãa]o|para)\b|,|\.|\s-|\s–|\s\()/.exec(trecho)
    if (m) melhor = { nome: limparNome(m[1]) }
  }
  return { empresa: melhor?.nome ?? null, cnpj }
}

function itensDoTrecho(trecho) {
  const m = /\b(ite(?:m|ns)|lotes?|grupos?)\s*(?:n[º°o]\.?\s*)?(\d{1,4}(?:\s*(?:,|e|a|-)\s*\d{1,4})*)(?![.,]?\d)/i.exec(trecho)
  if (!m) return null
  const varios = /\d\D+\d/.test(m[2])
  const rotulo = /^l/i.test(m[1]) ? (varios ? 'Lotes' : 'Lote') : /^g/i.test(m[1]) ? (varios ? 'Grupos' : 'Grupo') : varios ? 'Itens' : 'Item'
  return `${rotulo} ${m[2].replace(/\s+/g, ' ')}`
}

/** Separa, no texto de uma ata, os trechos de desclassificação/inabilitação com empresa, itens e motivo. */
export function extrairOcorrencias(textoBruto) {
  let texto = limpar(textoBruto)
    .replace(/Desclassifica\s+do/g, 'Desclassificado').replace(/Inabilita\s+do/g, 'Inabilitado')
  const mapa = apelidos(texto)
  // Cada mensagem do chat começa com data/hora; dentro dela, divide por frases.
  const partes = texto.split(/(?=\b\d{2}\/\d{2}\/\d{4}\s*(?:-|às)?\s*\d{2}:\d{2})|(?=De:\s*(?:SISTEMA|PREGOEIR|AGENTE))/i)
    .flatMap((p) => (p.length > 700 ? p.split(/(?<=[.;])\s+(?=[A-ZÀ-Ü])/) : [p]))
  const vistos = new Set()
  const lista = []
  for (const parte of partes) {
    const k = parte.search(CHAVE)
    if (k < 0) continue
    let trecho = parte.length > 600 ? parte.slice(Math.max(0, k - 280), k + 320) : parte
    if ((trecho.match(/\d+,\d{2}\b/g) ?? []).length >= 3 || /Raz[ãa]o Social Num Documento|Proponente \/ Fornecedor|arquivo .{1,120}? foi adicionado/i.test(trecho)) continue
    if (NEGACAO.test(trecho) || !AFIRMA.test(trecho)) continue
    if (GENERICO.test(trecho.slice(Math.max(0, trecho.search(CHAVE) - 60), trecho.search(CHAVE) + 40))) continue
    for (const [ap, nome] of Object.entries(mapa)) trecho = trecho.replace(new RegExp(`\\b${ap}\\b`, 'g'), `${ap} (${nome})`)
    const quando0 = /\b(\d{2}\/\d{2}\/\d{4})\s*(?:-|às)?\s*(\d{2}:\d{2})/.exec(trecho)
    // "LIC004 (NOME LTDA) (Desclassificado: Proposta não informada.)": uma ocorrência por empresa.
    const listados = [...trecho.matchAll(/\(([^()]{4,100})\)\s*\((Desclassificad[oa]|Inabilitad[oa])\s*:\s*([^)]{3,200})\)/gi)]
    if (listados.length) {
      for (const l of listados) {
        const motivo = limpar(l[3]), chave = so(l[1] + motivo + (quando0?.[0] ?? ''))
        if (vistos.has(chave)) continue
        vistos.add(chave)
        lista.push({ tipo: /inabilit/i.test(l[2]) ? 'inabilitacao' : SEM_PROPOSTA.test(motivo) ? 'sem_proposta' : 'desclassificacao', empresa: limparNome(l[1]), cnpj: null, itens: null, data: quando0 ? `${quando0[1]} ${quando0[2]}` : null, motivo })
      }
      continue
    }
    const quando = /\b(\d{2}\/\d{2}\/\d{4})\s*(?:-|às)?\s*(\d{2}:\d{2})/.exec(trecho)
    const motivo = limpar(trecho
      .replace(/^\s*\d{2}\/\d{2}\/\d{4}\s*(?:-|às)?\s*\d{2}:\d{2}(?::\d{2})?/, '')
      .replace(/^\s*(?:MENSAGEM\s+)?(?:PREGOEIR[OA]|SISTEMA|AGENTE DE CONTRATA[ÇC][ÃA]O)\s*/i, '')
      .replace(/^De:\s*\S+\s*-\s*Para:\s*\S+\s*-\s*\(Data e Hora:[^)]*\)\s*/i, ''))
    if (motivo.length < 15) continue
    const chave = so(motivo).replace(/\d/g, '').replace(/\s+/g, ' ').slice(0, 160)
    if (vistos.has(chave)) continue
    vistos.add(chave)
    const tipo = /inabilit/i.test(trecho) ? 'inabilitacao' : SEM_PROPOSTA.test(trecho) ? 'sem_proposta' : /recusad|n[ãa]o\s+(?:foi\s+)?aceit/i.test(trecho) && !/desclassific/i.test(trecho) ? 'recusa' : 'desclassificacao'
    const pos = trecho.search(CHAVE)
    lista.push({ tipo, ...empresaDoTrecho(trecho, pos), itens: itensDoTrecho(motivo), data: quando ? `${quando[1]} ${quando[2]}` : null, motivo: motivo.slice(0, 450) })
  }
  return lista.slice(0, 80)
}

// Palavras que ficam entre o nome e o CNPJ ("inscrita no CNPJ nº") e podem ser puladas.
const ROTULO_CNPJ = /^(?:\d{1,4}|cnpj|cpf\/cnpj|cpf|mf|n[º°o.]*|sob|o|a|no|na|inscrit[oa]|portador[a]?|com|sede|-|–|:|,|\(|\)|\/)[:,.]?$/i
const LIGA_NOME = /^(?:de|da|do|das|dos|e|&|em|-|–)$/i
// Cabeçalhos e falas da ata que não fazem parte da razão social.
const NAO_NOME = /^(?:FORNECEDOR(?:ES)?|LICITANTES?|EMPRESAS?|PARTICIPANTES?|PROPONENTES?|VALIDADE|EDITAL|DIAS|CNPJ|CPF|ITEM|ITENS|LOTE|GRUPO|VALOR|LANCES?|PROPOSTAS?|MENSAGEM|PREGOEIR[OA]|SISTEMA|ESCLARECIMENTO|REQUERIDO|REQUERIMENTO|IMPUGNA[ÇC][ÃA]O|PEDIDO|RECURSO|RESPOSTA|DECIS[ÃA]O|ARREMATANTE|VENCEDOR[A]?|HABILITAD[OA]|INABILITAD[OA]|CLASSIFICAD[OA]|DESCLASSIFICAD[OA]|ACEIT[OA]|RECUSAD[OA]|SITUA[ÇC][ÃA]O|RAZ[ÃA]O|SOCIAL|NOME|DOCUMENTO|PORTE|ME\/EPP|SIM|N[ÃA]O|TOTAL|UNIT[ÁA]RIO|MARCA|MODELO|DATA|HORA|STATUS|CONFORME|ABERT[OA]|NEGOCIA[ÇC][ÃA]O|BENEF[ÍI]CIO|ENCERRAD[OA]|ADJUDICAD[OA]|HOMOLOGAD[OA]|CANCELAD[OA]|FRACASSAD[OA]|DESERT[OA]|SUSPENS[OA]|AN[ÁA]LISE|AGUARDANDO|OFERTA|INICIAL|FINAL)[:.,]?$/i
const PALAVRA_NOME = /^(?:[A-ZÀ-Ý][\wÀ-ÿ&.'’\/-]*|\d+[A-Za-zÀ-ÿ][\wÀ-ÿ&.\/-]*|S\/A|S\.A\.?)[,]?$/

/**
 * Lê palavras a partir do CNPJ (para trás ou para frente) e junta a razão social: palavras com inicial
 * maiúscula, ligadas por "de/da/e/&". Para em números, cabeçalhos ou palavras minúsculas.
 */
function nomeJunto(palavras, paraTras) {
  let i = 0, pulos = 0
  while (i < palavras.length && pulos < 6 && ROTULO_CNPJ.test(palavras[i])) { i++; pulos++ }
  const nome = []
  for (; i < palavras.length && nome.length < 14; i++) {
    const p = palavras[i]
    if (LIGA_NOME.test(p) && nome.length) { nome.push(p); continue }
    if (NAO_NOME.test(p) || !PALAVRA_NOME.test(p)) break
    nome.push(p)
    if (!paraTras && /[,;]$/.test(p)) break
  }
  while (nome.length && LIGA_NOME.test(nome.at(-1))) nome.pop()
  const ordem = paraTras ? nome.reverse() : nome
  const texto = limparNome(ordem.join(' ').replace(/[,;]$/, ''))
  if (texto.replace(/[^A-Za-zÀ-ÿ]/g, '').length < 4 || ordem.length < 2 && !/\b(?:LTDA|EIRELI|S\/?A|ME|EPP|MEI)\b/i.test(texto)) return null
  return { nome: texto, dist: pulos }
}

/** Dígitos verificadores do CNPJ conferem (evita pegar números de processo ou telefone). */
export function cnpjValido(c) {
  if (!/^\d{14}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false
  const dv = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const r = pesos.reduce((t, p, i) => t + p * Number(c[i]), 0) % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13])
}

/**
 * Empresas que aparecem na ata (licitantes, propostas, classificação): cada CNPJ válido com a razão
 * social mais próxima. O CNPJ do órgão (dono da compra) fica de fora.
 */
export function extrairParticipantes(textoBruto, cnpjOrgao = null) {
  const texto = limpar(textoBruto)
  const achados = [...texto.matchAll(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\s?\d{2}\b/g)]
  // Para cada CNPJ, o nome logo antes e logo depois dele (sem passar por outro CNPJ) e a distância em palavras.
  const candidatos = achados.map((m, k) => {
    const limite = k ? achados[k - 1].index + achados[k - 1][0].length : 0
    const fim = k + 1 < achados.length ? achados[k + 1].index : texto.length
    const antes = nomeJunto(texto.slice(Math.max(limite, m.index - 200), m.index).split(' ').filter(Boolean).reverse(), true)
    const depois = nomeJunto(texto.slice(m.index + m[0].length, Math.min(fim, m.index + m[0].length + 200)).split(' ').filter(Boolean), false)
    return { m, antes: antes?.nome ?? null, depois: depois?.nome ?? null, distA: antes?.dist ?? Infinity, distD: depois?.dist ?? Infinity }
  })
  // Tabelas "Fornecedor  CNPJ" trazem o nome antes; "CNPJ  Razão social", depois. Empate: vale o padrão do documento.
  let votos = 0
  for (const c of candidatos) votos += c.distA < c.distD ? 1 : c.distD < c.distA ? -1 : 0
  const porCnpj = new Map()
  for (const c of candidatos) {
    const cnpj = c.m[0].replace(/\D/g, '')
    if (!cnpjValido(cnpj) || cnpj === cnpjOrgao) continue
    const nome = c.distA < c.distD ? c.antes : c.distD < c.distA ? c.depois : votos >= 0 ? (c.antes ?? c.depois) : (c.depois ?? c.antes)
    const atual = porCnpj.get(cnpj)
    if (!atual) porCnpj.set(cnpj, { cnpj, nome, mencoes: 1 })
    else { atual.mencoes++; atual.nome ??= nome }
  }
  return [...porCnpj.values()].slice(0, 200)
}

const COLOCACAO = [
  /(?:^|\D)(\d{1,2})\s*[º°ª]\s*(?:lugar|colocad[oa]|classificad[oa]|posi[çc][ãa]o)/i,
  /(?:classifica[çc][ãa]o|coloca[çc][ãa]o|posi[çc][ãa]o)\s*[:\-–]?\s*(\d{1,2})\s*[º°ª]?(?!\d)/i,
]
/**
 * Colocação de cada empresa escrita perto do CNPJ dela ("2º lugar", "Classificação: 3").
 * Só vale o que está a até 120 caracteres do CNPJ, sem passar por outro CNPJ; sem isso, fica sem colocação.
 */
export function colocacoesNoTexto(textoBruto) {
  const texto = limpar(textoBruto)
  const achados = [...texto.matchAll(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\s?\d{2}\b/g)]
  const saida = {}
  achados.forEach((m, k) => {
    const cnpj = m[0].replace(/\D/g, '')
    if (saida[cnpj] || !cnpjValido(cnpj)) return
    const ini = Math.max(k ? achados[k - 1].index + achados[k - 1][0].length : 0, m.index - 120)
    const fim = Math.min(k + 1 < achados.length ? achados[k + 1].index : texto.length, m.index + m[0].length + 120)
    for (const trecho of [texto.slice(m.index + m[0].length, fim), texto.slice(ini, m.index)]) {
      for (const re of COLOCACAO) {
        const n = Number(re.exec(trecho)?.[1])
        if (n >= 1 && n <= 50) { saida[cnpj] = n; return }
      }
    }
  })
  return saida
}

async function textoDoPdf(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'licitaforce-atas' }, signal: AbortSignal.timeout(25000) })
  if (!r.ok) return { erro: 'O arquivo da ata não pôde ser aberto.' }
  if (Number(r.headers.get('content-length')) > MAX_BYTES) return { erro: 'Arquivo grande demais para ler aqui.' }
  const bytes = new Uint8Array(await r.arrayBuffer())
  if (bytes.length > MAX_BYTES) return { erro: 'Arquivo grande demais para ler aqui.' }
  return textoDosBytes(bytes)
}

/** Texto de um PDF já baixado (ou enviado pelo usuário). */
async function textoDosBytes(bytes, maxPaginas = MAX_PAGINAS) {
  if (String.fromCharCode(...bytes.slice(0, 4)) !== '%PDF') return { erro: 'O arquivo não é PDF (pode ser compactado ou Word).' }
  const { getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(bytes)
  const paginas = Math.min(pdf.numPages, maxPaginas)
  let texto = ''
  for (let p = 1; p <= paginas; p++) {
    const c = await (await pdf.getPage(p)).getTextContent()
    texto += c.items.map((i) => ('str' in i ? i.str : '')).join(' ') + '\n'
  }
  if (limpar(texto).length < 80) return { erro: 'PDF escaneado (imagem): não tem texto para ler.', paginas: pdf.numPages }
  return { texto, paginas: pdf.numPages }
}

/** Abre as atas de uma compra do PNCP (número de controle CNPJ-1-SEQ/ANO). */
export async function lerAtas(controle) {
  const m = /^(\d{14})-1-0*(\d+)\/(\d{4})$/.exec(controle)
  if (!m) throw Object.assign(new Error('Número de controle inválido.'), { status: 400 })
  const r = await fetch(`${PNCP}/${m[1]}/compras/${m[3]}/${m[2]}/arquivos`, { headers: { Accept: 'application/json', 'User-Agent': 'licitaforce-atas' }, signal: AbortSignal.timeout(15000) })
  const arquivos = r.ok ? await r.json().catch(() => []) : []
  const candidatos = (Array.isArray(arquivos) ? arquivos : [])
    .filter((a) => a.statusAtivo !== false && a.url)
    .map((a) => ({ titulo: a.titulo ?? a.tipoDocumentoNome ?? 'Documento', url: a.url, prioridade: prioridadeDocumento(a.titulo, a.tipoDocumentoNome) }))
    .filter((a) => a.prioridade !== null)
    .sort((a, b) => a.prioridade - b.prioridade)
    .slice(0, MAX_DOCS)
  const documentos = [], ocorrencias = [], participantes = new Map(), colocacoes = {}
  for (const d of candidatos) {
    try {
      const lido = await textoDoPdf(d.url)
      if (lido.erro) { documentos.push({ titulo: d.titulo, url: d.url, lido: false, aviso: lido.erro }); continue }
      for (const p of extrairParticipantes(lido.texto, m[1])) {
        if (cnpjBloqueado(p.cnpj)) continue
        const atual = participantes.get(p.cnpj)
        if (!atual) participantes.set(p.cnpj, { ...p, documento: d.titulo, url: d.url })
        else { atual.mencoes += p.mencoes; atual.nome ??= p.nome }
      }
      for (const [c, n] of Object.entries(colocacoesNoTexto(lido.texto))) colocacoes[c] ??= n
      const achadas = extrairOcorrencias(lido.texto)
      documentos.push({ titulo: d.titulo, url: d.url, lido: true, paginas: lido.paginas, ocorrencias: achadas.length })
      for (const o of achadas) if (!falaDeBloqueada(o) && !ocorrencias.some((x) => so(x.motivo).slice(0, 160) === so(o.motivo).slice(0, 160))) ocorrencias.push({ ...o, documento: d.titulo, url: d.url })
    } catch {
      documentos.push({ titulo: d.titulo, url: d.url, lido: false, aviso: 'Não foi possível ler este arquivo.' })
    }
  }
  // Situação de cada empresa (desclassificada, inabilitada, sem proposta) e colocação, quando a ata diz.
  const lista = [...participantes.values()].map((p) => ({
    ...p, colocacao: colocacoes[p.cnpj] ?? null,
    situacoes: ocorrencias.filter((o) => falaDaEmpresa(o, p.cnpj, p.nome)).map((o) => ({ tipo: o.tipo, itens: o.itens, motivo: o.motivo.slice(0, 240) })),
  }))
  return { controle, documentos, ocorrencias, participantes: lista }
}

/** Ocorrência que cita uma empresa bloqueada (pelo CNPJ, com ou sem pontuação). */
const falaDeBloqueada = (o) => cnpjBloqueado(o.cnpj) ||
  [...`${o.empresa ?? ''} ${o.motivo ?? ''}`.matchAll(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g)].some((x) => cnpjBloqueado(x[0]))

const PALAVRAS_VAZIAS = new Set(['LTDA', 'EIRELI', 'ME', 'EPP', 'SA', 'MEI', 'COMERCIO', 'SERVICOS', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'EM', 'INDUSTRIA', 'DISTRIBUIDORA'])
/** A ocorrência fala desta empresa? Pelo CNPJ ou pelas primeiras palavras marcantes da razão social. */
export function falaDaEmpresa(o, cnpj, nome) {
  if (o.cnpj && o.cnpj === cnpj) return true
  const texto = so(`${o.empresa ?? ''} ${o.motivo}`)
  if (texto.replace(/ /g, '').includes(cnpj)) return true
  const chave = so(nome ?? '').split(' ').filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p)).slice(0, 2)
  if (!chave.length) return false
  return chave.every((p) => new RegExp(`\\b${p}\\b`).test(texto))
}

// ---------------------------------------------------------------- Leitura por item (termo de julgamento / ata enviada)

const CNPJ_G = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{14}\b/g
const CABECALHO_ITEM = /\b(Item|Grupo|Lote)\s+(?:n[º°o]\.?\s*)?(\d{1,4})(?![.,]?\d)\s*[-–:]/gi
const DATA_HORA = /\b\d{2}\/\d{2}\/\d{4}\s*(?:-|às)?\s*\d{2}:\d{2}/g
// Título de evento do termo de julgamento no fim do trecho ("Aceite de proposta", "Inabilitação de fornecedor").
const TITULO_EVENTO = /\s(?:Recusa|Aceite|Inabilita[çc][ãa]o|Habilita[çc][ãa]o|Desclassifica[çc][ãa]o|Adjudica[çc][ãa]o|Homologa[çc][ãa]o|Reabertura|Encerramento|Convoca[çc][ãa]o|Cancelamento|Registro|Intercorr[êe]ncia|Item)\s+(?:de|do|da|dos|das)\s+[\wÀ-ü]+(?:\s+[\wÀ-ü]+)?\s*$/i
const GRAVIDADE = { inabilitacao: 5, desclassificacao: 4, recusa: 3, classificada: 2, participou: 1 }

/** Situação dita num trecho do evento ("Recusa da proposta", "Inabilitação", "Aceite"...). */
function situacaoDoTrecho(t) {
  if (NEGACAO.test(t)) return 'participou'
  if (/inabilit/i.test(t)) return 'inabilitacao'
  if (/desclassific/i.test(t)) return 'desclassificacao'
  if (/recus|n[ãa]o\s+(?:foi\s+)?aceit/i.test(t)) return 'recusa'
  if (/aceit|adjudica|homologa|habilitad|vencedor|arrematante|classificad/i.test(t)) return 'classificada'
  return 'participou'
}

const valorBr = (s) => { const n = Number(s.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null }

/**
 * Divide o texto em seções "Item N - ..." / "Grupo N - ..." e, em cada uma, junta as empresas (CNPJ e nome),
 * o valor proposto ou lance mais próximo, a situação (classificada, recusada, desclassificada, inabilitada) e o motivo.
 * Cada CNPJ fica com a situação mais grave que aparece para ele no item.
 */
export function lerPorItem(textoBruto, cnpjOrgao = null) {
  const texto = limpar(textoBruto)
  const cabecalhos = [...texto.matchAll(CABECALHO_ITEM)]
  if (!cabecalhos.length) return []
  const nomes = new Map(extrairParticipantes(texto, cnpjOrgao).map((p) => [p.cnpj, p.nome]))
  const secoes = new Map()
  cabecalhos.forEach((h, k) => {
    const tipo = /^item/i.test(h[1]) ? 'item' : 'grupo'
    const chave = `${tipo}:${Number(h[2])}`
    const fim = k + 1 < cabecalhos.length ? cabecalhos[k + 1].index : texto.length
    const sec = secoes.get(chave) ?? { tipo, numero: Number(h[2]), texto: '' }
    sec.texto += ' ' + texto.slice(h.index, fim)
    secoes.set(chave, sec)
  })
  const saida = []
  for (const sec of secoes.values()) {
    const t = sec.texto
    const achados = [...t.matchAll(CNPJ_G)]
    const datas = [...t.matchAll(DATA_HORA)].map((d) => d.index)
    const empresas = new Map()
    achados.forEach((m, k) => {
      const cnpj = m[0].replace(/\D/g, '')
      if (!cnpjValido(cnpj) || cnpj === cnpjOrgao || cnpjBloqueado(cnpj)) return
      const fimCnpj = m.index + m[0].length
      // O evento vai da última data/hora antes do CNPJ até a próxima data/hora (ou o próximo CNPJ).
      const iniEvento = Math.max(k ? achados[k - 1].index + achados[k - 1][0].length : 0, ...datas.filter((d) => d < m.index), m.index - 250)
      const proxData = datas.find((d) => d > fimCnpj) ?? t.length
      const fimEvento = Math.min(k + 1 < achados.length ? achados[k + 1].index : t.length, proxData, fimCnpj + 400)
      const antes = t.slice(iniEvento, m.index), depois = t.slice(fimCnpj, fimEvento)
      // Termo do Compras.gov: "Recusa da proposta. Fornecedor: X, CNPJ ..." (a situação vem antes do CNPJ);
      // atas em texto corrido: "a empresa X, CNPJ ..., foi desclassificada" (vem logo depois, na mesma frase).
      // O título do próximo evento ("Inabilitação de fornecedor 03/09...") fica antes da data e não pode contar.
      const depoisLimpo = depois.replace(TITULO_EVENTO, ' ')
      const frase = depoisLimpo.split(/\.\s+(?=[A-ZÀ-Ü])/)[0]
      let situacao = situacaoDoTrecho(antes)
      if (situacao === 'participou' || situacao === 'classificada') { const s2 = situacaoDoTrecho(frase); if (GRAVIDADE[s2] > GRAVIDADE[situacao]) situacao = s2 }
      const valor = /R\$\s*([\d.]+,\d{2,4})/.exec(depois)?.[1] ?? /R\$\s*([\d.]+,\d{2,4})/.exec(antes)?.[1] ?? null
      const motivo = /Motivo\s*:?\s*(.{5,300}?)(?=\s*(?:Fornecedor|CNPJ|Valor)\s*:|$)/i.exec(depoisLimpo)?.[1] ?? null
      const atual = empresas.get(cnpj)
      const nova = { cnpj, nome: nomes.get(cnpj) ?? null, valor: valor ? valorBr(valor) : null, situacao, motivo: motivo ? limpar(motivo).slice(0, 300) : null }
      if (!atual) { empresas.set(cnpj, nova); return }
      if (GRAVIDADE[situacao] > GRAVIDADE[atual.situacao]) { atual.situacao = situacao; atual.motivo = nova.motivo ?? atual.motivo }
      atual.valor ??= nova.valor
      atual.motivo ??= nova.motivo
    })
    if (empresas.size) saida.push({ tipo: sec.tipo, numero: sec.numero, empresas: [...empresas.values()].slice(0, 100) })
  }
  return saida.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.numero - b.numero).slice(0, 1000)
}

/** Lê um PDF enviado pelo usuário: empresas por item, participantes, desclassificações e motivos. */
export async function lerAtaEnviada(bytes, arquivo, cnpjOrgao = null) {
  const lido = await textoDosBytes(bytes, 300)
  if (lido.erro) throw Object.assign(new Error(lido.erro), { status: 422 })
  const ocorrencias = extrairOcorrencias(lido.texto).filter((o) => !falaDeBloqueada(o)).map((o) => ({ ...o, documento: arquivo, url: null }))
  const colocacoes = colocacoesNoTexto(lido.texto)
  const participantes = extrairParticipantes(lido.texto, cnpjOrgao).filter((p) => !cnpjBloqueado(p.cnpj)).map((p) => ({
    ...p, documento: arquivo, url: null, colocacao: colocacoes[p.cnpj] ?? null,
    situacoes: ocorrencias.filter((o) => falaDaEmpresa(o, p.cnpj, p.nome)).map((o) => ({ tipo: o.tipo, itens: o.itens, motivo: o.motivo.slice(0, 240) })),
  }))
  const itens = lerPorItem(lido.texto, cnpjOrgao)
  if (!itens.length && !participantes.length && !ocorrencias.length) throw Object.assign(new Error('O arquivo foi lido, mas não traz empresas com CNPJ. Envie o termo de julgamento ou a ata da sessão.'), { status: 422 })
  return { documentos: [{ titulo: arquivo, url: null, lido: true, paginas: lido.paginas, ocorrencias: ocorrencias.length }], ocorrencias, participantes, itens }
}

async function atasEnviadas({ base, anon, token, servico, req, res, q, usuario }) {
  const idCompra = String(q.idCompra ?? '')
  if (!/^\d{15,20}$/.test(idCompra)) return res.status(400).json({ error: 'Código da compra inválido.' })
  if (q.acao === 'enviadas') {
    const r = await fetch(`${base}/rest/v1/atas_enviadas?id_compra=eq.${idCompra}&select=hash,arquivo,resultado,created_at&order=created_at.desc&limit=10`, { headers: { apikey: anon, Authorization: token }, signal: AbortSignal.timeout(15000) })
    if (!r.ok) return res.status(502).json({ error: 'Não foi possível buscar as atas enviadas.' })
    return res.json({ enviadas: await r.json() })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })
  if (q.acao === 'propostas') return propostasDoPortal({ base, servico, req, res, idCompra, usuario })
  if (!servico) return res.status(503).json({ error: 'Envio de atas indisponível no momento.' })
  if (excedeuLimite('atas-enviar', usuario, 5)) return res.status(429).json({ error: 'Muitos envios em pouco tempo. Aguarde um minuto.' })
  const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}
  const arquivo = String(corpo.arquivo ?? 'ata.pdf').replace(/[^\wÀ-ÿ .()-]/g, '_').slice(0, 200) || 'ata.pdf'
  const pdf = String(corpo.pdf ?? '')
  if (!pdf || pdf.length > MAX_ENVIO * 1.4) return res.status(413).json({ error: 'Envie um PDF de até 3 MB.' })
  const bytes = new Uint8Array(Buffer.from(pdf, 'base64'))
  if (!bytes.length || bytes.length > MAX_ENVIO) return res.status(413).json({ error: 'Envie um PDF de até 3 MB.' })
  const cnpjOrgao = /^(\d{14})-1-\d+\/\d{4}$/.exec(String(corpo.controle ?? ''))?.[1] ?? null
  const hash = createHash('sha256').update(bytes).digest('hex')
  const resultado = await lerAtaEnviada(bytes, arquivo, cnpjOrgao)
  const linha = { id_compra: idCompra, hash, arquivo, resultado, enviado_por: /^[0-9a-f-]{36}$/i.test(usuario) ? usuario : null }
  const r = await fetch(`${base}/rest/v1/atas_enviadas?on_conflict=id_compra,hash`, {
    method: 'POST', body: JSON.stringify(linha), signal: AbortSignal.timeout(15000),
    headers: { apikey: servico, Authorization: `Bearer ${servico}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
  })
  if (!r.ok) return res.status(502).json({ error: 'A ata foi lida, mas não foi possível guardá-la. Tente de novo.' })
  return res.json({ hash, arquivo, resultado, created_at: new Date().toISOString() })
}

// Situação da proposta no Compras.gov (SituacaoPropostaItemEnum) → situação usada nos concorrentes do item.
const SITUACAO_PORTAL = { 1: 'desclassificacao', 2: 'desclassificacao', 9: 'desclassificacao', 5: 'inabilitacao', 3: 'classificada', 4: 'classificada', 6: 'classificada' }
const ARQUIVO_PORTAL = 'Propostas do Compras.gov.br'
const txt = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const valorOk = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e12 ? v : null)

/** Propostas de cada item capturadas pelo botão favorito na página de acompanhamento do Compras.gov.br. */
export function itensDoPortal(itens) {
  if (!Array.isArray(itens)) return []
  const saida = []
  for (const i of itens.slice(0, 600)) {
    const numero = Number(i?.n)
    if (!Number.isInteger(numero) || numero < 1 || numero > 99999 || !Array.isArray(i?.p)) continue
    const empresas = []
    const vistos = new Set()
    for (const p of i.p.slice(0, 300)) {
      const cnpj = String(p?.c ?? '')
      // Pessoa física (CPF) fica de fora: só empresas com CNPJ válido.
      if (!cnpjValido(cnpj) || vistos.has(cnpj) || cnpjBloqueado(cnpj)) continue
      vistos.add(cnpj)
      const colocacao = Number.isInteger(p?.cl) && p.cl > 0 && p.cl < 10000 ? p.cl : null
      const situacao = SITUACAO_PORTAL[Number(p?.st)] ?? (colocacao ? 'classificada' : 'participou')
      empresas.push({
        cnpj, nome: txt(p?.nm, 200), valor: valorOk(p?.v), situacao, motivo: txt(p?.mo, 400),
        colocacao, valorTotal: valorOk(p?.vt), valorInicial: valorOk(p?.vi), marca: txt(p?.ma, 80), modelo: txt(p?.mod, 120), quantidade: valorOk(p?.q),
        uf: /^[A-Z]{2}$/.test(String(p?.uf ?? '')) ? p.uf : null, meEpp: p?.me === true, adjudicada: Number(p?.st) === 6,
      })
    }
    if (empresas.length) saida.push({ tipo: i.t === 'g' ? 'grupo' : 'item', numero, fonte: 'portal', empresas })
  }
  return saida
}

async function propostasDoPortal({ base, servico, req, res, idCompra, usuario }) {
  if (!servico) return res.status(503).json({ error: 'Envio indisponível no momento.' })
  if (excedeuLimite('atas-propostas', usuario, 10)) return res.status(429).json({ error: 'Muitos envios em pouco tempo. Aguarde um minuto.' })
  const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}
  const novos = itensDoPortal(corpo.itens)
  if (!novos.length) return res.status(422).json({ error: 'Nenhuma proposta com CNPJ veio do Compras.gov.br. Abra os itens na página da compra e tente de novo.' })
  const cabecalho = { apikey: servico, Authorization: `Bearer ${servico}`, 'Content-Type': 'application/json' }
  // Uma linha por compra: cada envio junta os itens novos aos já guardados (o item reenviado substitui o antigo).
  const atual = await fetch(`${base}/rest/v1/atas_enviadas?id_compra=eq.${idCompra}&hash=eq.${HASH_PORTAL}&select=resultado`, { headers: cabecalho, signal: AbortSignal.timeout(15000) })
  const antigos = atual.ok ? ((await atual.json())[0]?.resultado?.itens ?? []) : []
  const porChave = new Map([...antigos, ...novos].map((i) => [`${i.tipo}${i.numero}`, i]))
  const itens = [...porChave.values()].sort((a, b) => a.numero - b.numero)
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const url = `https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra?compra=${idCompra}`
  const resultado = { documentos: [{ titulo: `${ARQUIVO_PORTAL} (${itens.length} itens, ${hoje})`, url, lido: true }], ocorrencias: [], participantes: [], itens }
  const linha = { id_compra: idCompra, hash: HASH_PORTAL, arquivo: ARQUIVO_PORTAL, resultado, enviado_por: /^[0-9a-f-]{36}$/i.test(usuario) ? usuario : null }
  const r = await fetch(`${base}/rest/v1/atas_enviadas?on_conflict=id_compra,hash`, {
    method: 'POST', body: JSON.stringify(linha), signal: AbortSignal.timeout(15000),
    headers: { ...cabecalho, Prefer: 'resolution=merge-duplicates,return=minimal' },
  })
  if (!r.ok) return res.status(502).json({ error: 'As propostas chegaram, mas não foi possível guardá-las. Tente de novo.' })
  return res.json({ hash: HASH_PORTAL, arquivo: ARQUIVO_PORTAL, resultado, created_at: new Date().toISOString(), novos: novos.length })
}

async function emLotes(lista, n, fn) {
  const saida = []
  for (let i = 0; i < lista.length; i += n) saida.push(...(await Promise.all(lista.slice(i, i + n).map(fn))))
  return saida
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const q = req.query ?? {}
  const envio = q.acao === 'enviar' || q.acao === 'enviadas' || q.acao === 'propostas'
  if (req.method !== 'GET' && !((q.acao === 'enviar' || q.acao === 'propostas') && req.method === 'POST')) return res.status(405).json({ error: 'Método não permitido' })
  const env = process.env
  const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
  const token = req.headers.authorization
  if (!base || !anon) return res.status(503).json({ error: 'Configuração Supabase ausente no servidor' })
  if (!/^Bearer \S+$/.test(token ?? '')) return res.status(401).json({ error: 'Entre na sua conta' })
  // Atas enviadas pelos usuários (termo de julgamento / ata da sessão baixados no portal da compra).
  if (envio) {
    try {
      const usuario = await usuarioLogado(base, anon, token)
      if (!usuario) return res.status(401).json({ error: 'Entre na sua conta' })
      return await atasEnviadas({ base, anon, token, servico: env.SUPABASE_SERVICE_ROLE_KEY, req, res, q, usuario })
    } catch (e) {
      return res.status(e.status ?? 500).json({ error: e.status ? e.message : 'Não foi possível ler o arquivo enviado.' })
    }
  }
  const controle = String(q.controle ?? '')
  const cnpj = String(q.cnpj ?? '').replace(/\D/g, '')
  const controles = String(q.controles ?? '').split(',').map((c) => c.trim()).filter((c) => /^\d{14}-1-\d+\/\d{4}$/.test(c))
  if (!controle && !(cnpj.length === 14 && controles.length)) return res.status(400).json({ error: 'Informe a compra ou a empresa.' })
  if (cnpjBloqueado(cnpj)) return res.status(404).json({ error: 'Empresa não encontrada.' })
  try {
    const usuario = await usuarioLogado(base, anon, token)
    if (!usuario) return res.status(401).json({ error: 'Entre na sua conta' })
    if (excedeuLimite('atas', usuario, 20)) return res.status(429).json({ error: 'Muitas consultas em pouco tempo. Aguarde um minuto e tente de novo.' })
    const ler = (c) => emCache('atas-v4', c, 6 * 60 * 60_000, () => lerAtas(c), 500)
    if (controle) { const lida = await ler(controle); guardarNoNavegador(res, 3600); return res.json(lida) }
    // Empresa: lê as atas das compras dela e fica só com o que fala dela.
    const lidas = await emLotes([...new Set(controles)].slice(0, 15), 4, (c) => ler(c).catch(() => ({ controle: c, documentos: [], ocorrencias: [] })))
    const nome = String(q.nome ?? '').slice(0, 200)
    guardarNoNavegador(res, 1800)
    return res.json({
      cnpj,
      comprasConsultadas: lidas.length,
      comAta: lidas.filter((l) => l.documentos.some((d) => d.lido)).length,
      ocorrencias: lidas.flatMap((l) => l.ocorrencias.filter((o) => falaDaEmpresa(o, cnpj, nome)).map((o) => ({ ...o, controle: l.controle }))),
    })
  } catch (e) {
    return res.status(e.status ?? 500).json({ error: e.status ? e.message : 'Não foi possível ler as atas agora.' })
  }
}
