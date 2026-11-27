// Termômetro de Pagamento, órgãos federais: mede, por unidade gestora (UG), quantos dias passam entre a liquidação
// (o órgão atesta a nota e reconhece a dívida) e o pagamento (ordem bancária ao fornecedor).
// Fonte: arquivo diário "Despesas" do Portal da Transparência (CGU), sem chave. Um ZIP por dia, com alguns dias de atraso.
// O casamento liquidação → pagamento é pelo empenho: o pagamento quita a liquidação mais antiga ainda aberta daquele
// empenho (o banco faz isso em termometro_federal_dia). Detalhes em docs/termometro.md.
import { abrirZip } from './termometro.js'

export const URL_DIA = (dia) => `https://portaldatransparencia.gov.br/download-de-dados/despesas/${dia}`

/** Lê CSV com ";" e aspas (campos podem ter ";" e quebra de linha dentro das aspas). Devolve as linhas como listas. */
export function lerCsv(texto) {
  const linhas = []
  let campo = '', linha = [], aspas = false
  const t = String(texto)
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (aspas) {
      if (ch === '"') { if (t[i + 1] === '"') { campo += '"'; i++ } else aspas = false }
      else campo += ch
    } else if (ch === '"') aspas = true
    else if (ch === ';') { linha.push(campo); campo = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++
      linha.push(campo); campo = ''
      if (linha.length > 1 || linha[0] !== '') linhas.push(linha)
      linha = []
    } else campo += ch
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha) }
  return linhas
}

/** Linhas do CSV como objetos com as colunas pedidas (pelo nome do cabeçalho). */
function tabela(texto, colunas) {
  const [cab = [], ...resto] = lerCsv(texto)
  const idx = colunas.map((c) => cab.findIndex((h) => h.trim() === c))
  return resto.map((l) => idx.map((i) => (i < 0 ? '' : l[i] ?? '')))
}

const valor = (s) => Number(String(s ?? '').replace(/\./g, '').replace(',', '.'))
const dataIso = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s ?? '').trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : null }
const EMPENHO = /^\d{11}\d{4}NE\d{6}$/
const CNPJ = /^\d{14}$/

/**
 * Mês de referência do serviço na observação da liquidação feita pelo Contratos.gov.br
 * ("… PRESTADO(S) AO(S) MES(ES): 06/2026.") → último dia do mês ("2026-06-30"). Com vários meses, vale o último.
 */
export function competencia(obs) {
  const ms = [...String(obs ?? '').matchAll(/MES\(ES\):\s*((?:\d{2}\/\d{4}[\s,E]*)+)/gi)].flatMap((m) => [...m[1].matchAll(/(\d{2})\/(\d{4})/g)])
  const datas = ms.map((m) => [Number(m[2]), Number(m[1])]).filter(([a, mes]) => a >= 2000 && mes >= 1 && mes <= 12)
  if (!datas.length) return null
  const [a, mes] = datas.sort((x, y) => x[0] - y[0] || x[1] - y[1]).at(-1)
  return new Date(Date.UTC(a, mes, 0)).toISOString().slice(0, 10)
}

/**
 * Lê o ZIP de um dia. Fica só com a despesa direta a fornecedor pessoa jurídica (modalidade 90, favorecido com CNPJ).
 * - liquidacoes: [empenho, data, fim do mês do serviço | null], uma por empenho e dia;
 * - pagamentos: [empenho, data], ordens bancárias (OB) de valor positivo;
 * - ugs: [ug, nome, código do órgão, órgão, código do órgão superior, órgão superior].
 */
export function lerDia(buf) {
  const nomes = ['Liquidacao', 'Liquidacao_EmpenhosImpactados', 'Pagamento', 'Pagamento_EmpenhosImpactados']
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
  // Os nomes dentro do ZIP trazem a data ("20261119_Despesas_Pagamento.csv"): acha pelo sufixo.
  const todos = listarZip(b)
  const alvo = Object.fromEntries(nomes.map((n) => [n, todos.find((t) => t.endsWith(`_Despesas_${n}.csv`))]))
  if (nomes.some((n) => !alvo[n])) throw new Error('ZIP sem os arquivos de liquidação e pagamento')
  const arq = abrirZip(b, Object.values(alvo), 'latin1')
  const txt = (n) => arq[alvo[n]] ?? ''

  const liq = new Map() // código da liquidação → [data, competência]
  for (const [cod, data, fav, mod, obs] of tabela(txt('Liquidacao'), ['Código Liquidação', 'Data Emissão', 'Código Favorecido', 'Código Modalidade de Aplicação', 'Observação'])) {
    if (CNPJ.test(fav) && mod === '90' && dataIso(data)) liq.set(cod, [dataIso(data), competencia(obs)])
  }
  const vistos = new Map()
  for (const [cod, emp, v] of tabela(txt('Liquidacao_EmpenhosImpactados'), ['Código Liquidação', 'Código Empenho', 'Valor Liquidado (R$)'])) {
    const l = liq.get(cod)
    if (!l || !EMPENHO.test(emp) || !(valor(v) > 0)) continue
    const k = `${emp}|${l[0]}`, ant = vistos.get(k)
    // Várias notas do mesmo empenho no mesmo dia (valor principal e retenções) contam como uma liquidação.
    if (!ant) vistos.set(k, [emp, l[0], l[1]])
    else if (l[1] && (!ant[2] || l[1] > ant[2])) ant[2] = l[1]
  }

  const pg = new Map(), ugs = new Map()
  for (const [cod, data, tipo, fav, mod, v, ug, nomeUg, codOrg, org, codSup, sup] of tabela(txt('Pagamento'), ['Código Pagamento', 'Data Emissão', 'Código Tipo Documento', 'Código Favorecido', 'Código Modalidade de Aplicação', 'Valor do Pagamento Convertido pra R$', 'Código Unidade Gestora', 'Unidade Gestora', 'Código Órgão', 'Órgão', 'Código Órgão Superior', 'Órgão Superior'])) {
    if (/^\d{6}$/.test(ug) && !ugs.has(ug)) ugs.set(ug, [ug, nomeUg.trim(), codOrg.trim(), org.trim(), codSup.trim(), sup.trim()])
    if (tipo === 'OB' && CNPJ.test(fav) && mod === '90' && valor(v) > 0 && dataIso(data)) pg.set(cod, dataIso(data))
  }
  const pagamentos = []
  for (const [cod, emp] of tabela(txt('Pagamento_EmpenhosImpactados'), ['Código Pagamento', 'Código Empenho'])) {
    const d = pg.get(cod)
    if (d && EMPENHO.test(emp)) pagamentos.push([emp, d])
  }
  return { liquidacoes: [...vistos.values()], pagamentos, ugs: [...ugs.values()] }
}

/** Nomes dos arquivos dentro do ZIP (diretório central). */
function listarZip(b) {
  let fim = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) if (b.readUInt32LE(i) === 0x06054b50) { fim = i; break }
  if (fim < 0) throw new Error('Arquivo ZIP inválido')
  const total = b.readUInt16LE(fim + 10)
  let p = b.readUInt32LE(fim + 16)
  const nomes = []
  for (let k = 0; k < total; k++) {
    const nLen = b.readUInt16LE(p + 28), xLen = b.readUInt16LE(p + 30), cLen = b.readUInt16LE(p + 32)
    nomes.push(b.toString('utf8', p + 46, p + 46 + nLen))
    p += 46 + nLen + xLen + cLen
  }
  return nomes
}

/** "20261119" → "20261120". */
export function proximoDia(dia) {
  const d = new Date(Date.UTC(+dia.slice(0, 4), +dia.slice(4, 6) - 1, +dia.slice(6, 8) + 1))
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}
const hojeSp = (agora) => new Date(agora - 3 * 3600_000).toISOString().slice(0, 10).replace(/-/g, '')
const diasEntre = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(4, 6) - 1, +b.slice(6, 8)) - Date.UTC(+a.slice(0, 4), +a.slice(4, 6) - 1, +a.slice(6, 8))) / 864e5)

/**
 * Divide o dia em lotes pequenos para o banco (a máquina Nano não aguenta 1,3 MB numa chamada só: em 27/11/2026 as
 * rodadas estouraram o tempo, ficaram rodando no banco e ajudaram a derrubá-lo). Tudo de um empenho vai no mesmo lote,
 * para o casamento FIFO não depender da ordem dos lotes. As UGs vão no primeiro. Sempre há ao menos um lote.
 */
export function lotes({ liquidacoes, pagamentos, ugs }, maximo = 2500) {
  const porEmpenho = new Map()
  const de = (e) => { let g = porEmpenho.get(e); if (!g) porEmpenho.set(e, (g = { liq: [], pag: [] })); return g }
  for (const l of liquidacoes) de(l[0]).liq.push(l)
  for (const p of pagamentos) de(p[0]).pag.push(p)
  const saida = [{ liq: [], pag: [], ugs }]
  for (const g of porEmpenho.values()) {
    let atual = saida.at(-1)
    if (atual.liq.length + atual.pag.length > 0 && atual.liq.length + atual.pag.length + g.liq.length + g.pag.length > maximo) saida.push((atual = { liq: [], pag: [], ugs: [] }))
    atual.liq.push(...g.liq); atual.pag.push(...g.pag)
  }
  return saida
}

/**
 * Rodada: processa, em ordem, os dias publicados depois do último já lido (recursos.federal), até alcançar o
 * Portal, ler `maxDias` dias ou estourar o tempo. Sem cursor, começa em `inicio` (padrão: 120 dias atrás).
 * Cada dia vai em lotes; um dia interrompido no meio continua do lote seguinte (recursos.federal_parte = "AAAAMMDD:k").
 * Um dia que ainda não saiu (o Portal responde 403/404) encerra a rodada; com mais de 10 dias e o dia seguinte publicado, é pulado.
 */
export async function atualizarFederal({ token, rpc, fetcher = fetch, agora = Date.now(), limiteMs = 200_000, maxDias = 3, inicio }) {
  const t0 = Date.now()
  const estado = await rpc('termometro_estado', { p_token: token })
  if (!estado?.ativo) return { ativo: false }
  const hoje = hojeSp(agora)
  let dia = estado.recursos?.federal ? proximoDia(estado.recursos.federal) : (inicio ?? hojeSp(agora - 120 * 864e5))
  const [diaParte, parteFeita] = String(estado.recursos?.federal_parte ?? '').split(':')
  const feitos = []
  while (dia < hoje && feitos.length < maxDias && Date.now() - t0 < limiteMs) {
    const r = await fetcher(URL_DIA(dia), { headers: { 'User-Agent': 'Mozilla/5.0 (LicitaForce)' }, redirect: 'follow', signal: AbortSignal.timeout(90_000) })
    if (!r.ok) {
      // Pula só se o dia seguinte já saiu (senão o Portal está fora do ar e é melhor esperar).
      const seguinte = diasEntre(dia, hoje) > 10 && (await fetcher(URL_DIA(proximoDia(dia)), { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(30_000) }).catch(() => null))?.ok
      if (!seguinte) { feitos.push({ dia, situacao: `ainda não publicado (${r.status})` }); break }
      await rpc('termometro_federal_dia', { p_token: token, p_dia: dia, p_liq: [], p_pag: [], p_ugs: [], p_parte: 0, p_partes: 1 })
      feitos.push({ dia, situacao: `pulado (${r.status})` }); dia = proximoDia(dia); continue
    }
    let d
    try { d = lerDia(Buffer.from(await r.arrayBuffer())) } catch (e) { feitos.push({ dia, situacao: `arquivo ilegível: ${e?.message ?? 'erro'}` }); break }
    const partes = lotes(d)
    let casados = 0, parte = diaParte === dia ? Number(parteFeita) || 0 : 0
    for (; parte < partes.length && Date.now() - t0 < limiteMs; parte++) {
      const p = partes[parte]
      const res = await rpc('termometro_federal_dia', { p_token: token, p_dia: dia, p_liq: p.liq, p_pag: p.pag, p_ugs: p.ugs, p_parte: parte, p_partes: partes.length })
      casados += res?.casados ?? 0
    }
    feitos.push({ dia, liquidacoes: d.liquidacoes.length, pagamentos: d.pagamentos.length, lotes: `${parte}/${partes.length}`, casados })
    if (parte < partes.length) break // tempo acabou no meio do dia: a próxima rodada continua deste lote
    dia = proximoDia(dia)
  }
  return { feitos }
}
