import { emCache, excedeuLimite, guardarNoNavegador, usuarioLogado } from './protecao.js'
import { cnpjBloqueado } from './bloqueio.js'
// Leitura das atas de sessão publicadas no PNCP: abre os PDFs (ata da sessão, julgamento, homologação)
// e separa os trechos de desclassificação, inabilitação e recusa, com empresa, itens e motivo.
// As atas do Compras.gov.br (federais) ficam atrás de captcha e normalmente não vão para o PNCP;
// por isso a cobertura é maior em compras de estados e municípios. Nada é guardado no banco.

const PNCP = 'https://pncp.gov.br/api/pncp/v1/orgaos'
const MAX_DOCS = 2
const MAX_BYTES = 12 * 1024 * 1024
const MAX_PAGINAS = 80

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

const CHAVE = /desclassificad|desclassifica[çc][ãa]o|inabilitad|inabilita[çc][ãa]o|recusad|reprovad|n[ãa]o\s+(?:foi\s+)?aceit/i
// Regras do edital lidas na ata ("será desclassificada", "sob pena de"): não são ocorrências.
// Decisões que afastam a desclassificação ("não há motivo para inabilitação") também não contam.
const NEGACAO = /aus[êe]ncia de (?:motivo|irregularidade)|n[ãa]o (?:h[áa]|se (?:identifica|verifica)|houve)\b[^.]{0,60}(?:desclassifica|inabilita)|capaz de justificar|justificar a (?:desclassifica|inabilita)|pela conformidade|consider[ae]-?\s?se superad|revers[ãa]o da (?:desclassifica|inabilita)|n[ãa]o assiste raz[ãa]o|inexistindo fundamento|n[ãa]o tendo sido demonstrad|rejeitando\s?-?\s?se o pedido|antes de qualquer|n[ãa]o tem raz[ãa]o/i
// Só conta o que afirma a decisão: "foi desclassificada", "pela inabilitação", "Motivo:", "restando desclassificada"...
const AFIRMA = /\b(?:foi|foram|fica|ficam|ficou|resta(?:ndo)?|est[áa]|sendo|considerad[oa]s?)\s+(?:\w+\s+){0,2}(?:desclassificad|inabilitad|recusad|reprovad)|\bpela\s+(?:sua\s+)?(?:desclassifica|inabilita|recusa)|decid\w*\s?-?\s?se\s+pela|(?:desclassificad|inabilitad|recusad)[oa]s?\s*[.:(-]\s*(?:Motivo|\w)|Motivo\s*:|(?:Desclassifica[çc][ãa]o|Inabilita[çc][ãa]o)\s*:|\bdesclassific(?:o|amos|a-se)\b|\binabilit(?:o|amos|a-se)\b|\brecus(?:o|amos|a-se)\b/i
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
        lista.push({ tipo: /inabilit/i.test(l[2]) ? 'inabilitacao' : 'desclassificacao', empresa: limparNome(l[1]), cnpj: null, itens: null, data: quando0 ? `${quando0[1]} ${quando0[2]}` : null, motivo })
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
    const tipo = /inabilit/i.test(trecho) ? 'inabilitacao' : /recusad|n[ãa]o\s+(?:foi\s+)?aceit/i.test(trecho) && !/desclassific/i.test(trecho) ? 'recusa' : 'desclassificacao'
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

async function textoDoPdf(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'licitaflow-atas' }, signal: AbortSignal.timeout(25000) })
  if (!r.ok) return { erro: 'O arquivo da ata não pôde ser aberto.' }
  if (Number(r.headers.get('content-length')) > MAX_BYTES) return { erro: 'Arquivo grande demais para ler aqui.' }
  const bytes = new Uint8Array(await r.arrayBuffer())
  if (bytes.length > MAX_BYTES) return { erro: 'Arquivo grande demais para ler aqui.' }
  if (String.fromCharCode(...bytes.slice(0, 4)) !== '%PDF') return { erro: 'O arquivo não é PDF (pode ser compactado ou Word).' }
  const { getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(bytes)
  const paginas = Math.min(pdf.numPages, MAX_PAGINAS)
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
  const r = await fetch(`${PNCP}/${m[1]}/compras/${m[3]}/${m[2]}/arquivos`, { headers: { Accept: 'application/json', 'User-Agent': 'licitaflow-atas' }, signal: AbortSignal.timeout(15000) })
  const arquivos = r.ok ? await r.json().catch(() => []) : []
  const candidatos = (Array.isArray(arquivos) ? arquivos : [])
    .filter((a) => a.statusAtivo !== false && a.url)
    .map((a) => ({ titulo: a.titulo ?? a.tipoDocumentoNome ?? 'Documento', url: a.url, prioridade: prioridadeDocumento(a.titulo, a.tipoDocumentoNome) }))
    .filter((a) => a.prioridade !== null)
    .sort((a, b) => a.prioridade - b.prioridade)
    .slice(0, MAX_DOCS)
  const documentos = [], ocorrencias = [], participantes = new Map()
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
      const achadas = extrairOcorrencias(lido.texto)
      documentos.push({ titulo: d.titulo, url: d.url, lido: true, paginas: lido.paginas, ocorrencias: achadas.length })
      for (const o of achadas) if (!falaDeBloqueada(o) && !ocorrencias.some((x) => so(x.motivo).slice(0, 160) === so(o.motivo).slice(0, 160))) ocorrencias.push({ ...o, documento: d.titulo, url: d.url })
    } catch {
      documentos.push({ titulo: d.titulo, url: d.url, lido: false, aviso: 'Não foi possível ler este arquivo.' })
    }
  }
  return { controle, documentos, ocorrencias, participantes: [...participantes.values()] }
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

async function emLotes(lista, n, fn) {
  const saida = []
  for (let i = 0; i < lista.length; i += n) saida.push(...(await Promise.all(lista.slice(i, i + n).map(fn))))
  return saida
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' })
  const env = process.env
  const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
  const token = req.headers.authorization
  if (!base || !anon) return res.status(503).json({ error: 'Configuração Supabase ausente no servidor' })
  if (!/^Bearer \S+$/.test(token ?? '')) return res.status(401).json({ error: 'Entre na sua conta' })
  const q = req.query ?? {}
  const controle = String(q.controle ?? '')
  const cnpj = String(q.cnpj ?? '').replace(/\D/g, '')
  const controles = String(q.controles ?? '').split(',').map((c) => c.trim()).filter((c) => /^\d{14}-1-\d+\/\d{4}$/.test(c))
  if (!controle && !(cnpj.length === 14 && controles.length)) return res.status(400).json({ error: 'Informe a compra ou a empresa.' })
  if (cnpjBloqueado(cnpj)) return res.status(404).json({ error: 'Empresa não encontrada.' })
  try {
    const usuario = await usuarioLogado(base, anon, token)
    if (!usuario) return res.status(401).json({ error: 'Entre na sua conta' })
    if (excedeuLimite('atas', usuario, 20)) return res.status(429).json({ error: 'Muitas consultas em pouco tempo. Aguarde um minuto e tente de novo.' })
    const ler = (c) => emCache('atas-v3', c, 6 * 60 * 60_000, () => lerAtas(c), 500)
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
