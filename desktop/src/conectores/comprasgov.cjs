// Conector do Compras.gov.br. Não faz nenhuma chamada própria ao portal: recebe as respostas e as
// mensagens do WebSocket que a própria página da sala (logada pelo usuário) já recebeu e as transforma
// em eventos padronizados. Ver docs/maquina-de-lances-fase0.md.
//
// O formato exato das respostas da disputa ao vivo ainda não foi visto (fase 0 sem disputa aberta),
// por isso a leitura procura os campos pelos nomes prováveis e o programa guarda amostras locais
// (modo descoberta) para ajustar este arquivo depois da primeira sessão real.
const { limpar, impressao, lerData, extrairPrazo, citaCliente } = require('./comum.cjs')

const id = 'comprasgov'
const nome = 'Compras.gov.br'
const entradas = {
  producao: 'https://www.comprasnet.gov.br/seguro/loginPortal.asp',
  treinamento: 'https://treinamento.comprasnet.gov.br/seguro/loginPortal.asp',
}

const HOSTS = /(^|\.)(estaleiro\.serpro\.gov\.br|comprasnet\.gov\.br|compras\.gov\.br)$/
const SERVICOS = /\/(comprasnet-disputa|comprasnet-mensagem|comprasnet-fase-externa|comprasnet-julgamento|comprasnet-habilitacao)\//

function host(url) { try { return new URL(url).hostname } catch { return '' } }

/** Chave de 17 dígitos da compra (UASG 6 + modalidade 2 + número 5 + ano 4) citada no endereço. */
function chaveDaUrl(url) {
  const m = String(url).match(/(?:compras|chat|compra|fornec)\/(\d{17})(?:\/|$|\?)/) || String(url).match(/[?&](?:compra|compraId|idCompra)=(\d{17})/)
  return m ? m[1] : null
}

/** Respostas que interessam (só serviços da sala, nunca páginas de login). */
const interessa = (url) => HOSTS.test(host(url)) && SERVICOS.test(url)
const interessaWs = (url) => HOSTS.test(host(url)) && /websocket/.test(url)

/** A página está logada: chamadas aos serviços com o token do usuário (o token não é lido nem guardado). */
const indicaLogin = (url, cabecalhos) => HOSTS.test(host(url)) && /comprasnet-/.test(url) &&
  Object.keys(cabecalhos ?? {}).some((k) => k.toLowerCase() === 'authorization')

/** Título amigável da compra a partir da chave. */
function tituloDaChave(chave) {
  if (!/^\d{17}$/.test(chave)) return chave
  return `UASG ${chave.slice(0, 6)} · Pregão ${Number(chave.slice(8, 13))}/${chave.slice(13)}`
}

// ---------- leitura tolerante de JSON ----------
const pegar = (o, nomes) => { for (const n of nomes) if (o[n] != null && o[n] !== '') return o[n]; return undefined }
const textoDe = (v) => v == null ? undefined : typeof v === 'object' ? (v.descricao ?? v.nome ?? v.texto ?? v.valor ?? undefined) : String(v)
const numeroDe = (v) => {
  if (v == null || v === '') return undefined
  if (typeof v === 'object') return numeroDe(v.valor ?? v.valorCalculado ?? v.valorInformado)
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

const K_TEXTO = ['mensagem', 'texto', 'textoMensagem', 'conteudo', 'descricaoMensagem']
const K_DATA = ['dataHora', 'dataHoraEnvio', 'dataEnvio', 'dataHoraMensagem', 'dataCriacao', 'dataHoraInclusao', 'data']
const K_AUTOR = ['remetente', 'nomeRemetente', 'tipoRemetente', 'autor', 'perfil', 'origem', 'tipoUsuario', 'usuario']
const K_ITEM = ['numeroItem', 'numero', 'item', 'numeroItemCompra', 'nrItem']
const K_FASE = ['faseItem', 'fase', 'situacaoItem', 'situacao', 'statusItem', 'status', 'descricaoSituacao', 'etapa']
const K_MELHOR = ['melhorValor', 'valorMelhorLance', 'melhorLance', 'menorValor', 'valorMelhor', 'melhorValorGeral']
const K_POSICAO = ['posicao', 'posicaoFornecedor', 'classificacao', 'colocacao', 'posicaoParticipante']
const K_MEU = ['valorMeuLance', 'meuLance', 'valorUltimoLanceFornecedor', 'meuMelhorLance', 'valorLanceFornecedor']

function* objetos(v, prof = 0) {
  if (prof > 6 || v == null || typeof v !== 'object') return
  if (Array.isArray(v)) { for (const x of v.slice(0, 500)) yield* objetos(x, prof + 1); return }
  yield v
  for (const x of Object.values(v)) if (x && typeof x === 'object') yield* objetos(x, prof + 1)
}

const PREGOEIRO = /pregoeir|agente de contrata|comiss[aã]o|governo|[oó]rg[aã]o|administra|presidente/i
const SISTEMA = /sistema|autom[aá]tic/i
const CONVOCACAO = /convoc|anex(ar|o)|envi(e|ar|o)\s+(a\s+|o\s+|os\s+|as\s+)?(nova\s+)?(proposta|documenta|planilha|amostra|catalogo|cat[aá]logo|declara)|proposta\s+(ajustada|atualizada|readequada|adequada)|prazo\s+(de|para)\s+envio/i
const SUSPENSAO = /suspens|reabert|retomad|reinici/i

function autorDe(o) {
  const a = textoDe(pegar(o, K_AUTOR))
  if (a && PREGOEIRO.test(a)) return 'Pregoeiro'
  if (a && SISTEMA.test(a)) return 'Sistema'
  if (a && /fornecedor|licitante|participante/i.test(a)) return 'Fornecedor'
  return a ? limpar(a, 80) : 'Portal'
}

function lerMensagem(o, ctx, url) {
  const bruto = pegar(o, K_TEXTO)
  if (typeof bruto !== 'string' || bruto.trim().length < 2) return null
  const texto = limpar(bruto)
  const quando = lerData(pegar(o, K_DATA)) ?? ctx.agora ?? new Date()
  const itemUrl = String(url).match(/itens\/(\d{1,5})(?:\/|$|\?)/)
  const item = textoDe(pegar(o, ['numeroItem', 'item', 'nrItem'])) ?? (itemUrl ? itemUrl[1] : undefined)
  const autor = autorDe(o)
  if (autor === 'Fornecedor' && !citaCliente(texto, ctx.empresas)) return null // conversa entre licitantes não interessa
  const convocacao = autor !== 'Fornecedor' && CONVOCACAO.test(texto)
  const tipo = convocacao ? 'convocacao' : SUSPENSAO.test(texto) && autor !== 'Fornecedor' ? 'situacao' : 'mensagem'
  const prazo = convocacao ? extrairPrazo(texto, quando) : null
  return {
    tipo, item: item ? String(item).slice(0, 20) : null, autor, texto,
    prazo: prazo ? prazo.toISOString() : null, quando: quando.toISOString(),
    cita_cliente: citaCliente(texto, ctx.empresas),
    impressao: impressao('msg', item, texto, quando.toISOString()),
  }
}

/** Itens da disputa: compara com o último estado visto e gera fase, melhor lance e posição. */
function lerItem(o, ctx) {
  const item = textoDe(pegar(o, K_ITEM))
  const fase = textoDe(pegar(o, K_FASE))
  const melhor = numeroDe(pegar(o, K_MELHOR))
  const posicao = numeroDe(pegar(o, K_POSICAO))
  const meu = numeroDe(pegar(o, K_MEU))
  if (!item || !/^\d{1,5}$/.test(String(item)) || (fase == null && melhor == null && posicao == null)) return []
  const ant = ctx.estado.get(item) ?? {}
  const agora = (ctx.agora ?? new Date()).toISOString()
  const saida = []
  const moeda = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 })
  if (fase != null && fase !== ant.fase) {
    saida.push({ tipo: 'fase', item, autor: 'Sistema', texto: `Item ${item}: ${limpar(fase, 200)}`, quando: agora, prazo: null, cita_cliente: false, impressao: impressao('fase', item, fase) })
  }
  if (melhor != null && melhor !== ant.melhor) {
    saida.push({ tipo: 'lance', item, autor: 'Sistema', texto: `Item ${item}: melhor lance ${moeda(melhor)}${meu != null ? ` · seu lance ${moeda(meu)}` : ''}`, quando: agora, prazo: null, cita_cliente: false, impressao: impressao('lance', item, melhor, meu) })
  }
  if (posicao != null && posicao !== ant.posicao) {
    saida.push({ tipo: 'posicao', item, autor: 'Sistema', texto: `Item ${item}: você está em ${posicao}º lugar`, quando: agora, prazo: null, cita_cliente: posicao === 1, impressao: impressao('posicao', item, posicao, melhor) })
  }
  ctx.estado.set(item, { fase: fase ?? ant.fase, melhor: melhor ?? ant.melhor, posicao: posicao ?? ant.posicao })
  return saida
}

/**
 * Lê uma resposta JSON de um serviço da sala. ctx = { estado: Map, empresas, agora }.
 * Devolve { chave, eventos }.
 */
function lerResposta(url, corpo, ctx) {
  let json
  try { json = typeof corpo === 'string' ? JSON.parse(corpo) : corpo } catch { return { chave: chaveDaUrl(url), eventos: [] } }
  const chat = /comprasnet-mensagem|\/chat|mensage/i.test(url)
  const eventos = []
  const vistos = new Set()
  for (const o of objetos(json)) {
    const ev = chat || pegar(o, K_TEXTO) ? lerMensagem(o, ctx, url) : null
    const lista = ev ? [ev] : chat ? [] : lerItem(o, ctx)
    for (const e of lista) if (!vistos.has(e.impressao)) { vistos.add(e.impressao); eventos.push(e) }
  }
  return { chave: chaveDaUrl(url), eventos }
}

/** Quadro STOMP ("MESSAGE\ndestination:/topic/...\n\n{json}\0") recebido pelo WebSocket da página. */
function lerQuadroWs(dados, ctx) {
  const s = String(dados ?? '')
  if (!s.startsWith('MESSAGE')) return { chave: null, eventos: [] }
  const fimCab = s.indexOf('\n\n')
  if (fimCab < 0) return { chave: null, eventos: [] }
  const cab = s.slice(0, fimCab)
  const destino = (cab.match(/^destination:(.*)$/m) ?? [])[1] ?? ''
  const corpo = s.slice(fimCab + 2).replace(/\u0000+$/, '')
  const r = lerResposta(destino.includes('chat') || destino.includes('mensage') ? `${destino}/chat` : destino, corpo, ctx)
  return { chave: chaveDaUrl(destino + '/'), eventos: r.eventos }
}

module.exports = { id, nome, entradas, chaveDaUrl, interessa, interessaWs, indicaLogin, tituloDaChave, lerResposta, lerQuadroWs }
