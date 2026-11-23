import { emCache, excedeuLimite, guardarNoNavegador, usuarioLogado } from './protecao.js'
// Peças jurídicas publicadas no Portal de Compras Públicas (impugnações, esclarecimentos, intenções de recurso,
// recursos e contrarrazões). Fonte, cobertura e limites: docs/pecas-juridicas.md.
//
// GET ?acao=coletar   (header x-coleta)  → o pg_cron chama a cada 5 min quando há dia pendente; lê uma ou duas
//                                         páginas da listagem do portal e grava só os dados das peças no banco.
// GET ?acao=ler&url=…  (sessão do cliente) → abre o PDF da peça no portal e devolve o texto. Nada é guardado.
// A pesquisa em si é a RPC buscar_pecas, chamada direto pelo app.

export const PCP = 'https://compras.api.portaldecompraspublicas.com.br'
export const SITE_PCP = 'https://www.portaldecompraspublicas.com.br/processos'
const ARQUIVO = /^https:\/\/arquivos\.portaldecompraspublicas\.com\.br\/v1\/download\/[0-9a-f]{20,80}$/
const MAX_BYTES = 12 * 1024 * 1024
const MAX_PAGINAS_PDF = 40
const POR_PAGINA = 50
const ORCAMENTO_MS = 42_000
/** Caracteres do começo de cada PDF mandados ao banco para a busca por palavra (o banco corta em config.texto_chars). */
export const TEXTO_INDICE = 2500

const sem = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const limpar = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const item = (s) => { const m = /\b(item|lote|grupo)\s+0*(\d{1,4})\b/i.exec(s); return m ? `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}` : null }

/** "19/11/2026-16:21:57" ou "19/11/2026-16:15" (horário de Brasília) → ISO. */
export function dataDoPortal(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})-(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(s ?? '').trim())
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] ?? '00'}-03:00`
}

/**
 * Classifica um arquivo do processo. Devolve a peça ({tipo, papel, titulo, empresa, item}) ou null.
 * O portal dá nomes padronizados aos anexos de cada fase ("Recurso item 0001 - EMPRESA", "Pedidos de Impugnação - x.pdf"…);
 * nos "Outros documentos" o órgão escolhe o nome, então só valem nomes que dizem claramente o que são.
 */
export function classificarDocumento({ nome, tipo } = {}) {
  const n = limpar(nome)
  const t = sem(tipo)
  const s = sem(n)
  if (!n || t === 'relatorio' || t === 'documento') return null // relatórios e atas que o portal gera na hora
  let m
  if ((m = /^recurso\s+(?:do\s+)?(item|lote|grupo)\s+0*(\d+)\s*-\s*(.+)$/i.exec(n)))
    return { tipo: 'recurso', papel: 'pedido', titulo: 'Recurso', empresa: limpar(m[3]), item: item(`${m[1]} ${m[2]}`) }
  if ((m = /^contrarraz(?:ão|ao|ões|oes)\s+(?:do\s+)?(item|lote|grupo)\s+0*(\d+)\s*-\s*(.+)$/i.exec(n)))
    return { tipo: 'contrarrazoes', papel: 'pedido', titulo: 'Contrarrazões', empresa: limpar(m[3]), item: item(`${m[1]} ${m[2]}`) }
  if (/^julgamento\s+(?:do\s+)?(item|lote|grupo)\s+\d+/i.test(n))
    return { tipo: 'recurso', papel: 'resposta', titulo: 'Julgamento do recurso', empresa: null, item: item(n) }
  if (t.includes('revisao da fase recursal'))
    return { tipo: 'recurso', papel: 'resposta', titulo: 'Decisão sobre o recurso', empresa: null, item: item(n) }
  if (/^pedidos? de impugna/.test(s)) return { tipo: 'impugnacao', papel: 'pedido', titulo: 'Impugnação', empresa: null, item: null } // o resto do nome é o nome do arquivo
  if (/^(julgamento|decisao|resposta)( da| de| a)? impugna/.test(s)) return { tipo: 'impugnacao', papel: 'resposta', titulo: 'Decisão da impugnação', empresa: null, item: null }
  if (/^resposta(s)? (de|do|ao|aos|a) (pedido(s)? de )?esclarec/.test(s)) return { tipo: 'esclarecimento', papel: 'resposta', titulo: 'Resposta de esclarecimento', empresa: null, item: null }
  if (/^(pedidos? de )?esclarecimentos?\b/.test(s)) return { tipo: 'esclarecimento', papel: 'pedido', titulo: 'Pedido de esclarecimento', empresa: null, item: null }
  if (t.includes('outros') || t.includes('anexo') || t.includes('aviso')) {
    if (/contrarraz/.test(s)) return { tipo: 'contrarrazoes', papel: 'pedido', titulo: 'Contrarrazões', empresa: null, item: item(n) }
    if (/(decisao|julgamento|resposta|parecer)\W.*recurs|recurs\w*\W.*(decisao|julgamento|resposta)/.test(s)) return { tipo: 'recurso', papel: 'resposta', titulo: 'Decisão sobre o recurso', empresa: null, item: item(n) }
    if (/\brecurso\b/.test(s)) return { tipo: 'recurso', papel: 'pedido', titulo: 'Recurso', empresa: null, item: item(n) }
    if (/(decisao|julgamento|resposta)\W.*impugna|impugna\w*\W.*(decisao|julgamento|resposta)/.test(s)) return { tipo: 'impugnacao', papel: 'resposta', titulo: 'Decisão da impugnação', empresa: null, item: null }
    if (/impugna/.test(s)) return { tipo: 'impugnacao', papel: 'pedido', titulo: 'Impugnação', empresa: null, item: null }
    if (/resposta.*esclarec/.test(s)) return { tipo: 'esclarecimento', papel: 'resposta', titulo: 'Resposta de esclarecimento', empresa: null, item: null }
    if (/esclarec/.test(s)) return { tipo: 'esclarecimento', papel: 'pedido', titulo: 'Pedido de esclarecimento', empresa: null, item: null }
  }
  return null
}

/**
 * Lê o andamento (chat) filtrado por "recurso": intenções de recurso (com o motivo, quando a empresa escreve no chat),
 * decisões sobre elas e as datas de envio de recursos e contrarrazões.
 */
export function lerChat(frases = []) {
  const intencoes = []
  const enviados = [] // {tipo, empresa, item, data}
  const lista = [...frases].sort((a, b) => String(a.dataHoraFrase).localeCompare(String(b.dataHoraFrase)))
  for (const f of lista) {
    const texto = limpar(f.frase)
    const apelido = limpar(f.apelido)
    let m
    if ((m = /^O fornecedor (.+?) declarou inten[çc][ãa]o de recurso para o (item|lote|grupo) 0*(\d+)/i.exec(texto))) {
      intencoes.push({ tipo: 'intencao-recurso', papel: 'pedido', titulo: 'Intenção de recurso', empresa: limpar(m[1]), item: item(`${m[2]} ${m[3]}`), arquivo_url: null, trecho: texto, data: f.dataHoraFrase ?? null })
    } else if (/^F\.\s/.test(apelido) && /inten[çc][ãa]o (de )?(recurso|recorrer)|inten[çc][ãa]o recursal/i.test(texto)) {
      // A própria empresa escreve no chat (o portal mostra o nome como "F. EMPRESA").
      intencoes.push({ tipo: 'intencao-recurso', papel: 'pedido', titulo: 'Intenção de recurso', empresa: apelido.replace(/^F\.\s*/, ''), item: item(texto), arquivo_url: null, trecho: texto.slice(0, 1200), data: f.dataHoraFrase ?? null })
    } else if ((m = /^Inten[çc][ãa]o de recurso foi (deferida|indeferida) para o (item|lote|grupo) 0*(\d+)/i.exec(texto))) {
      const it = item(`${m[2]} ${m[3]}`)
      const alvo = [...intencoes].reverse().find((i) => i.item === it && !/foi (in)?deferida/i.test(i.trecho))
      if (alvo) alvo.trecho = `${alvo.trecho} Decisão: intenção ${m[1].toLowerCase()}.`
    } else if ((m = /^O fornecedor (.+?) enviou (recurso|contrarraz\S*) para o (item|lote|grupo) 0*(\d+)/i.exec(texto))) {
      enviados.push({ tipo: /^recurso/i.test(m[2]) ? 'recurso' : 'contrarrazoes', empresa: limpar(m[1]), item: item(`${m[3]} ${m[4]}`), data: f.dataHoraFrase ?? null })
    }
  }
  return { intencoes, enviados }
}

const chaveEmpresa = (s) => sem(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((p) => p.length >= 3 && !['ltda', 'eireli', 'epp'].includes(p)).slice(0, 2).join(' ')

/** Nome do arquivo sem o prefixo padrão do portal e sem extensão (distingue peças iguais e às vezes traz a empresa). */
export function nomeDoArquivo(nome) {
  return limpar(String(nome ?? '')
    .replace(/^(pedidos? de impugna\S*|julgamento da impugna\S*|resposta de esclarecimento|esclarecimentos?)\s*-\s*/i, '')
    .replace(/\.(pdf|docx?|odt|zip|rar|jpe?g|png)$/i, '')
    .replace(/[_]+/g, ' ')).slice(0, 90)
}

/** Junta arquivos e andamento nas peças de um processo. Sem data conhecida, a peça fica sem data (a tela mostra a da sessão). */
export function pecasDoProcesso(documentos = [], frases = []) {
  const { intencoes, enviados } = lerChat(frases)
  const pecas = []
  for (const d of documentos) {
    if (!d?.url || !ARQUIVO.test(d.url)) continue
    const c = classificarDocumento(d)
    if (!c) continue
    const envio = enviados.find((e) => e.tipo === c.tipo && e.item === c.item && c.empresa && chaveEmpresa(e.empresa) === chaveEmpresa(c.empresa))
    const arquivo = c.empresa || /^julgamento do/i.test(c.titulo) ? '' : nomeDoArquivo(d.nome)
    const titulo = arquivo && sem(arquivo) !== sem(c.titulo) ? `${c.titulo} · ${arquivo}` : c.titulo
    pecas.push({ ...c, titulo, arquivo_url: d.url, trecho: null, data: dataDoPortal(d.dataHora) ?? envio?.data ?? null })
  }
  // "Julgamento do item N" só conta como decisão de recurso quando houve recurso no processo.
  const temRecurso = pecas.some((p) => p.tipo === 'recurso' && p.papel === 'pedido') || enviados.some((e) => e.tipo === 'recurso')
  return pecas.filter((p) => temRecurso || p.titulo !== 'Julgamento do recurso').concat(intencoes)
}

async function pedir(fetcher, url, tentativas = 2) {
  for (let i = 0; i <= tentativas; i++) {
    try {
      const r = await fetcher(url, { headers: { Accept: 'application/json', 'User-Agent': 'LicitaForce/1.0' }, signal: AbortSignal.timeout(15000) })
      if (r.status === 404) return null
      if (r.ok) return await r.json()
    } catch { /* tenta de novo */ }
    await new Promise((ok) => setTimeout(ok, 400 * (i + 1)))
  }
  throw new Error(`Portal indisponível: ${url}`)
}

async function emLotes(lista, n, fn) {
  const saida = []
  for (let i = 0; i < lista.length; i += n) saida.push(...(await Promise.all(lista.slice(i, i + n).map(fn))))
  return saida
}

const ehDisputa = (r) => !/dispensa|inexigib|credenciamento|chamamento|leil[ãa]o|chamada p[úu]blica/i.test(`${r?.tipoLicitacao?.tipoLicitacao ?? ''} ${r?.tipoLicitacao?.modalidadeLicitacao ?? ''}`)

/** Lê uma página de processos com sessão no dia e devolve os que têm peças, prontos para gravar. */
export async function coletarPagina({ dia, pagina, prazo = Infinity }, fetcher = fetch) {
  const qs = new URLSearchParams({ pagina: String(pagina), limitePagina: String(POR_PAGINA), dataInicial: dia, dataFinal: dia, tipoData: '1', filtroOrdenacao: '4' })
  const lista = await pedir(fetcher, `${PCP}/v2/licitacao/processos?${qs}`)
  const resultado = Array.isArray(lista?.result) ? lista.result : []
  const paginas = Number(lista?.pageCount ?? 0) || 0
  const processos = (await emLotes(resultado, 6, async (r) => {
    const codigo = Number(r?.codigoLicitacao)
    if (!Number.isInteger(codigo) || codigo <= 0) return null
    const [docs, chat] = await Promise.all([
      pedir(fetcher, `${PCP}/v2/licitacao/${codigo}/documentos/processo`).catch(() => null),
      ehDisputa(r) ? pedir(fetcher, `${PCP}/v1/licitacao/${codigo}/chat?pagina=1&texto=recurso`).catch(() => null) : null,
    ])
    if (docs === null && chat === null) return { codigo, pecas: [] }
    const pecas = pecasDoProcesso(Array.isArray(docs) ? docs : [], chat?.frasesChat ?? [])
    let lei14133 = null
    if (pecas.length && r.urlReferencia) {
      const det = await pedir(fetcher, `${PCP}/v2/licitacao${r.urlReferencia}`).catch(() => null)
      lei14133 = typeof det?.lei14133 === 'boolean' ? det.lei14133 : null
    }
    return {
      codigo,
      orgao: limpar(r.razaoSocial || r.nomeUnidade || r.unidadeCompradora?.nomeUnidadeCompradora),
      municipio: limpar(r.unidadeCompradora?.cidade) || null,
      uf: limpar(r.unidadeCompradora?.uf).toUpperCase().slice(0, 2) || null,
      modalidade: limpar(r.tipoLicitacao?.tipoLicitacao) || null,
      numero: limpar(r.numero) || null,
      objeto: limpar(r.resumo).slice(0, 400),
      lei14133,
      sessao: dia, // a listagem é por dia da sessão (início dos lances)
      url: r.urlReferencia ? `${SITE_PCP}${r.urlReferencia}` : null,
      pecas,
    }
  })).filter(Boolean)
  // Começo do texto de cada PDF, para a palavra-chave achar o assunto da peça. Só o índice de busca fica no banco.
  const comArquivo = processos.flatMap((p) => p.pecas).filter((x) => x.arquivo_url)
  await emLotes(comArquivo, 6, async (x) => {
    if (Date.now() > prazo) return // sem tempo: a passada 2 lê depois
    const lido = await lerTexto(x.arquivo_url, fetcher, { maxPaginas: 3 }).catch(() => null)
    if (lido?.texto) x.texto = lido.texto.slice(0, TEXTO_INDICE)
  })
  return { paginas, lidos: resultado.length, processos }
}

/** Texto do PDF da peça (para ler e usar como modelo). */
export async function lerTexto(url, fetcher = fetch, { maxPaginas = MAX_PAGINAS_PDF } = {}) {
  if (!ARQUIVO.test(url)) { const e = new Error('Arquivo inválido.'); e.status = 400; throw e }
  const r = await fetcher(url, { headers: { 'User-Agent': 'LicitaForce/1.0' }, signal: AbortSignal.timeout(20000) })
  if (!r.ok) { const e = new Error('O portal não entregou o arquivo agora.'); e.status = 502; throw e }
  const tamanho = Number(r.headers.get('content-length') ?? 0)
  if (tamanho > MAX_BYTES) return { texto: null, motivo: 'Arquivo grande demais para abrir aqui. Abra no portal.' }
  const buf = new Uint8Array(await r.arrayBuffer())
  if (buf.length > MAX_BYTES) return { texto: null, motivo: 'Arquivo grande demais para abrir aqui. Abra no portal.' }
  const ehPdf = buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 // %PDF
  if (!ehPdf) return { texto: null, motivo: 'Este arquivo não é PDF (Word, ZIP ou imagem). Abra no portal.' }
  const { getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(buf)
  const paginas = Math.min(pdf.numPages, maxPaginas)
  const partes = []
  for (let i = 1; i <= paginas; i++) {
    const pg = await pdf.getPage(i)
    const c = await pg.getTextContent()
    let linha = ''
    const linhas = []
    for (const it of c.items) { linha += it.str; if (it.hasEOL) { linhas.push(linha); linha = '' } }
    if (linha) linhas.push(linha)
    partes.push(linhas.join('\n'))
  }
  const texto = arrumarTexto(partes.join('\n\n'))
  if (texto.replace(/\s/g, '').length < 80) return { texto: null, motivo: 'PDF digitalizado (imagem), sem texto para copiar. Abra no portal.' }
  return { texto, paginas: pdf.numPages, cortado: pdf.numPages > paginas }
}

/** Junta as quebras de linha do meio da frase e tira espaços repetidos, mantendo os parágrafos. */
const PALAVRA = /^[(“"'«]*(?:[A-Za-zÀ-ÿ]{1,24}(?:[-'][A-Za-zÀ-ÿ]+)*|[\dºª°]+(?:[.,/:\-–][\dºª°]+)*%?|[A-Za-z]{2,}:\/\/\S+|\S+@\S+\.\S+|[§&–—-]|R\$)[)”"'».,;:!?]*$/

/**
 * Linha que uma pessoa consegue ler. PDFs com fonte sem mapa de caracteres viram sequências de símbolos
 * ("(K7./*,V(6T)L,1K./*"), letras em ordem ("ghhijklmnlioipk") ou quadradinhos; essas linhas são descartadas.
 */
export function linhaLegivel(linha) {
  const l = linha.trim()
  if (!l) return true
  const estranhos = (l.match(/[\u0000-\u0008\u000e-\u001f\u007f-\u009f-�□]/g) ?? []).length
  if (estranhos > 1 && estranhos / l.length > 0.05) return false
  const simbolos = (l.match(/[*^{}[\]|~<>=@#$%\\`]/g) ?? []).length
  if (l.length >= 8 && simbolos / l.length > 0.08) return false
  const tokens = l.split(/\s+/)
  const bons = tokens.filter((t) => PALAVRA.test(t)).reduce((n, t) => n + t.length, 0)
  const total = tokens.reduce((n, t) => n + t.length, 0)
  return l.length < 12 ? bons > 0 || /^[\d\s.,/:-]+$/.test(l) : bons / total >= 0.6
}

export function arrumarTexto(t) {
  return String(t ?? '')
    .replace(/\r/g, '')
    .split('\n').filter(linhaLegivel).join('\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/([^\n.:;!?])\n(?=[a-zà-ü(])/g, '$1 ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function criarHandler({ fetcher = fetch } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' })
    const env = process.env
    const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL
    const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
    if (!base || !anon) return res.status(503).json({ error: 'Configuração Supabase ausente no servidor' })
    const q = req.query ?? {}
    try {
      if (q.acao === 'coletar') {
        const servico = env.SUPABASE_SERVICE_ROLE_KEY
        const token = String(req.headers['x-coleta'] ?? '')
        if (!servico) return res.status(503).json({ error: 'Chave de serviço ausente' })
        if (!/^[0-9a-f]{32,128}$/.test(token)) return res.status(401).json({ error: 'Não autorizado' })
        const rpc = async (nome, corpo) => {
          const r = await fetcher(`${base}/rest/v1/rpc/${nome}`, { method: 'POST', headers: { apikey: servico, Authorization: `Bearer ${servico}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(20000) })
          const j = await r.json().catch(() => null)
          if (!r.ok) { const e = new Error(j?.message || 'Falha no banco'); e.status = /token/i.test(j?.message ?? '') ? 401 : 502; throw e }
          return j
        }
        const inicio = Date.now()
        const feitos = []
        while (Date.now() - inicio < 15_000) {
          const prox = await rpc('pecas_coleta_proximo', { p_token: token })
          if (!prox) break
          const pg = await coletarPagina({ dia: prox.dia, pagina: prox.pagina, prazo: inicio + 32_000 }, fetcher)
          const comPecas = pg.processos.filter((p) => p.pecas.length)
          // Vai a página inteira: quem ficou sem peças (o órgão apagou o arquivo) sai do índice.
          const r = await rpc('pecas_coleta_gravar', { p_token: token, p_dia: prox.dia, p_passada: prox.passada, p_pagina: prox.pagina, p_paginas: pg.paginas, p_lidos: pg.lidos, p_processos: pg.processos })
          feitos.push({ ...prox, paginas: pg.paginas, lidos: pg.lidos, comPecas: comPecas.length, pecas: r?.pecas ?? 0 })
        }
        return res.status(200).json({ feitos })
      }

      if (q.acao === 'ler') {
        const token = req.headers.authorization
        if (!/^Bearer \S+$/.test(token ?? '')) return res.status(401).json({ error: 'Entre na sua conta' })
        const url = String(q.url ?? '')
        if (!ARQUIVO.test(url)) return res.status(400).json({ error: 'Arquivo inválido.' })
        const usuario = await usuarioLogado(base, anon, token)
        if (!usuario) return res.status(401).json({ error: 'Entre na sua conta' })
        if (excedeuLimite('juridico-ler', usuario, 20)) return res.status(429).json({ error: 'Muitas leituras em pouco tempo. Aguarde um minuto e tente de novo.' })
        const lido = await emCache('juridico-ler', url, 6 * 60 * 60_000, () => lerTexto(url, fetcher), 200)
        guardarNoNavegador(res, 6 * 3600)
        return res.status(200).json(lido)
      }

      return res.status(400).json({ error: 'Ação inválida' })
    } catch (e) {
      return res.status(e.status ?? 500).json({ error: e.status ? e.message : 'Não foi possível concluir agora.' })
    }
  }
}

export default criarHandler()
