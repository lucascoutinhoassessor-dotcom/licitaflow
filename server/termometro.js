// Agente Termômetro de Pagamento: baixa a nota CAPAG do Tesouro Nacional (estados em CSV, municípios em XLSX)
// do Tesouro Transparente e grava em public.capag. Chamado pelo pg_cron toda segunda
// (GET /api/agentes?agente=termometro&acao=atualizar, header x-coleta). Só baixa quando há arquivo novo.
// Não usa IA nem biblioteca de planilha: o XLSX é um ZIP lido com o zlib do Node. Detalhes em docs/termometro.md.
import { inflateRawSync } from 'node:zlib'

const CKAN = 'https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id='
export const DATASETS = {
  municipios: '9ff93162-409e-48b5-91d9-cf645a47fdfc', // Capacidade de Pagamento de Municípios (XLSX)
  estados: 'f04a675e-4e5a-4e88-98de-acc3e22bf778',    // Capacidade de Pagamento dos Estados e do DF (CSV)
}
const NOMES_UF = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco',
  PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina',
  SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
}
const NOTA = /^(A\+|A|B\+|B|C|D|n\.d\.|n\.e\.)$/i

/** Número da planilha: "27,98%" → 0.2798; "4.43E-2" → 0.0443; "n.d." → null. */
export function numero(v) {
  const t = String(v ?? '').trim()
  if (!t || /^n\.?[de]\.?$/i.test(t) || t === '#N/A' || t === '-') return null
  const pct = t.endsWith('%')
  // Com vírgula, o ponto é separador de milhar ("1.234,56"); sem vírgula, o ponto é decimal ("0.125", "4.4E-2").
  const limpo = t.replace('%', '')
  const n = Number(limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo)
  if (!Number.isFinite(n)) return null
  return pct ? Math.round(n * 100) / 10000 : n
}
const nota = (v) => { const t = String(v ?? '').trim(); return NOTA.test(t) ? (t.length <= 2 ? t.toUpperCase() : t.toLowerCase()) : null }

/** "Capag Municípios 2026 - 01/09/2026" → "01/09/2026"; "Capag Estados 2026" → "2026". */
export function posicaoDoNome(nome) {
  const s = String(nome ?? '')
  return /(\d{2}\/\d{2}\/\d{4})/.exec(s)?.[1] ?? /(20\d{2})/.exec(s)?.[1] ?? null
}

/** Data de posição do nome para ordenar: "… 01/09/2026" → "20260901"; "… 2026" → "20260000". */
function ordemDoNome(nome) {
  const d = /(\d{2})\/(\d{2})\/(\d{4})/.exec(String(nome ?? ''))
  if (d) return `${d[3]}${d[2]}${d[1]}`
  const a = /(20\d{2})/.exec(String(nome ?? ''))
  return a ? `${a[1]}0000` : '00000000'
}

/**
 * Arquivo mais recente do conjunto no formato pedido: pela data de posição no nome; empate, pelo último envio.
 * (O Tesouro às vezes reenvia um arquivo antigo depois do novo: em 23/11/2026 o de 01/06 subiu depois do de 01/09.)
 */
export function recursoMaisNovo(pacote, formato) {
  const lista = (pacote?.resources ?? []).filter((r) => String(r.format ?? '').toUpperCase() === formato && r.url)
  const envio = (r) => String(r.last_modified ?? r.created ?? '')
  return lista.sort((a, b) => ordemDoNome(b.name).localeCompare(ordemDoNome(a.name)) || envio(b).localeCompare(envio(a)))[0] ?? null
}

/** CSV dos estados (";" e vírgula decimal): UF;Indicador 1;Nota 1;Indicador 2;Nota 2;Indicador 3;Nota 3;Classificação…;Qualidade…;Observação */
export function lerCsvEstados(texto, { posicao, fonte } = {}) {
  const linhas = String(texto).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  const cab = linhas.shift()?.split(';').map((c) => c.trim().toLowerCase()) ?? []
  const col = (re) => cab.findIndex((c) => re.test(c))
  const iUf = col(/^uf$/), iNota = col(/classifica/), iIcf = col(/qualidade/), iObs = col(/observa/)
  const ind = [1, 2, 3].map((k) => ({ i: col(new RegExp(`^indicador ${k}$`)), n: col(new RegExp(`^nota ${k}$`)) }))
  const saida = []
  for (const l of linhas) {
    const c = l.split(';')
    const uf = String(c[iUf] ?? '').trim().toUpperCase()
    if (!NOMES_UF[uf]) continue
    saida.push({
      chave: `E:${uf}`, esfera: 'E', ibge: null, uf, nome: NOMES_UF[uf], nota: nota(c[iNota]),
      indicador1: numero(c[ind[0].i]), nota1: nota(c[ind[0].n]), indicador2: numero(c[ind[1].i]), nota2: nota(c[ind[1].n]),
      indicador3: numero(c[ind[2].i]), nota3: nota(c[ind[2].n]), icf: String(c[iIcf] ?? '').trim() || null,
      observacao: String(c[iObs] ?? '').trim() || null, posicao, fonte,
    })
  }
  return saida
}

/** Abre um ZIP (XLSX) e devolve os arquivos pedidos como texto. Suporta "stored" e "deflate". */
export function abrirZip(buf, nomes, codificacao = 'utf8') {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
  let fim = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) if (b.readUInt32LE(i) === 0x06054b50) { fim = i; break }
  if (fim < 0) throw new Error('Arquivo ZIP inválido')
  const total = b.readUInt16LE(fim + 10)
  let p = b.readUInt32LE(fim + 16)
  const saida = {}
  for (let k = 0; k < total; k++) {
    if (b.readUInt32LE(p) !== 0x02014b50) throw new Error('Diretório do ZIP inválido')
    const metodo = b.readUInt16LE(p + 10), tam = b.readUInt32LE(p + 20)
    const nLen = b.readUInt16LE(p + 28), xLen = b.readUInt16LE(p + 30), cLen = b.readUInt16LE(p + 32), local = b.readUInt32LE(p + 42)
    const nome = b.toString('utf8', p + 46, p + 46 + nLen)
    p += 46 + nLen + xLen + cLen
    if (!nomes.includes(nome)) continue
    const ini = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28)
    const dados = b.subarray(ini, ini + tam)
    saida[nome] = (metodo === 0 ? dados : inflateRawSync(dados)).toString(codificacao)
  }
  return saida
}

const xmlTexto = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&')

/** XLSX dos municípios: lê a aba "Prévia da CAPAG" (ou a primeira) pela linha de cabeçalho "Código Município Completo". */
export function lerXlsxMunicipios(buf, { posicao, fonte } = {}) {
  const base = abrirZip(buf, ['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml'])
  const abas = [...(base['xl/workbook.xml'] ?? '').matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map((m) => ({ nome: xmlTexto(m[1]), id: m[2] }))
  const rels = Object.fromEntries([...(base['xl/_rels/workbook.xml.rels'] ?? '').matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]))
  const aba = abas.find((a) => /pr[ée]via/i.test(a.nome)) ?? abas[0]
  const alvo = aba && rels[aba.id] ? `xl/${rels[aba.id].replace(/^\/?xl\//, '')}` : 'xl/worksheets/sheet1.xml'
  const strs = [...(base['xl/sharedStrings.xml'] ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => xmlTexto([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')))
  const xml = abrirZip(buf, [alvo])[alvo]
  if (!xml) throw new Error('Aba da CAPAG não encontrada na planilha')
  let mapa = null
  const saida = []
  for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cel = {}
    for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[2], corpo = c[3] ?? ''
      if (/t="inlineStr"/.test(attrs)) { cel[c[1]] = xmlTexto([...corpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')); continue }
      const v = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1]
      if (v == null) continue
      cel[c[1]] = /t="s"/.test(attrs) ? strs[Number(v)] : xmlTexto(v)
    }
    if (!mapa) {
      if (!Object.values(cel).some((v) => /c[óo]digo munic[íi]pio completo/i.test(String(v)))) continue
      mapa = {}
      for (const [col, v] of Object.entries(cel)) {
        const k = String(v).trim().toLowerCase()
        if (!(k in mapa)) mapa[k] = col // o cabeçalho repete colunas mais à direita: vale a primeira
      }
      continue
    }
    const g = (nome) => cel[mapa[nome]]
    const ibge = String(g('código município completo') ?? '').replace(/\D/g, '')
    const uf = String(g('uf') ?? '').trim().toUpperCase()
    if (!/^\d{7}$/.test(ibge) || !NOMES_UF[uf]) continue
    saida.push({
      chave: `M:${ibge}`, esfera: 'M', ibge, uf, nome: String(g('nome_município') ?? g('nome_municipio') ?? '').trim(), nota: nota(g('capag')),
      indicador1: numero(g('indicador 1')), nota1: nota(g('nota 1')), indicador2: numero(g('indicador 2')), nota2: nota(g('nota 2')),
      indicador3: numero(g('indicador 3')), nota3: nota(g('nota 3')), icf: String(g('icf') ?? '').trim() || null,
      observacao: String(g('observação') ?? g('observacao') ?? '').trim() || null, posicao, fonte,
    })
  }
  return saida
}

/** Rodada semanal: confere os dois conjuntos no Tesouro e grava o que mudou. */
export async function atualizarCapag({ token, rpc, fetcher = fetch, forcar = false }) {
  const estado = await rpc('termometro_estado', { p_token: token })
  if (!estado?.ativo) return { ativo: false }
  const feitos = {}
  for (const [qual, formato] of [['estados', 'CSV'], ['municipios', 'XLSX']]) {
    const r = await fetcher(CKAN + DATASETS[qual], { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000) })
    if (!r.ok) { feitos[qual] = `Tesouro respondeu ${r.status}`; continue }
    const recurso = recursoMaisNovo((await r.json())?.result, formato)
    if (!recurso) { feitos[qual] = 'sem arquivo'; continue }
    if (!forcar && estado.recursos?.[qual] === recurso.id) { feitos[qual] = 'já atualizado'; continue }
    const arq = await fetcher(recurso.url, { signal: AbortSignal.timeout(120000) })
    if (!arq.ok) { feitos[qual] = `download ${arq.status}`; continue }
    const meta = { posicao: posicaoDoNome(recurso.name), fonte: recurso.url }
    let linhas
    try {
      linhas = qual === 'estados' ? lerCsvEstados(await arq.text(), meta) : lerXlsxMunicipios(Buffer.from(await arq.arrayBuffer()), meta)
    } catch (e) {
      feitos[qual] = `arquivo ilegível: ${e?.message ?? 'erro'}`; continue // um arquivo ruim não derruba o outro
    }
    if (linhas.length < (qual === 'estados' ? 20 : 4000)) { feitos[qual] = `arquivo com poucas linhas (${linhas.length}); nada gravado`; continue }
    let gravadas = 0
    for (let i = 0; i < linhas.length; i += 800) {
      const ultimo = i + 800 >= linhas.length
      gravadas += (await rpc('termometro_gravar', { p_token: token, p_linhas: linhas.slice(i, i + 800), p_recurso: ultimo ? { [qual]: recurso.id } : null })) ?? 0
    }
    feitos[qual] = { arquivo: recurso.name, posicao: meta.posicao, gravadas }
  }
  return feitos
}
