import { type CompraPNCP, type FiltrosPNCP } from './pncp'
import { PORTAIS } from './portais'

// Códigos de modalidade do PNCP (Lei 14.133). Todas são coletadas pelo catálogo.
export const MODALIDADES = [['6','Pregão eletrônico'],['8','Dispensa'],['4','Concorrência eletrônica'],['5','Concorrência presencial'],['7','Pregão presencial'],['9','Inexigibilidade'],
  ['12','Credenciamento'],['1','Leilão eletrônico'],['13','Leilão presencial'],['2','Diálogo competitivo'],['3','Concurso'],['10','Manifestação de interesse'],['11','Pré-qualificação']] as const
/** Modos de disputa do PNCP. */
export const MODOS_DISPUTA = [['1','Aberto'],['2','Fechado'],['3','Aberto-fechado'],['6','Fechado-aberto'],['4','Dispensa com disputa'],['5','Não se aplica']] as const
export const TIPOS_ITEM = [['','Materiais e serviços'],['M','Somente materiais'],['S','Somente serviços']] as const
export function nomeModoDisputa(id?: number) { return MODOS_DISPUTA.find(m=>m[0]===String(id))?.[1] }
export interface FiltrosOportunidades extends FiltrosPNCP {
  modalidades: string[]; portais: string[]; busca: string; orgao: string
  minimo: string; maximo: string; itemMinimo: string; itemMaximo: string
  maxItens: string; naoDivulgado: boolean; exclusivo: boolean; excluirSrp: boolean
  /** Termos que não podem aparecer no objeto, separados por ";". */
  excluir: string
  tipoItem: '' | 'M' | 'S'
  /** Vazio = todos os modos. */
  modosDisputa: string[]
  /** Período de abertura (sessão / fim das propostas), AAAA-MM-DD; vazio = sem limite. */
  aberturaDe: string; aberturaAte: string
  /** Só sessões em dias úteis (seg. a sex., fora de feriados nacionais). */
  diasUteis: boolean
  /** Inverte a ordem: abertas mais distantes primeiro; publicações mais antigas primeiro. */
  inverter: boolean
  /** Estados escolhidos (vários de uma vez); vazio = Brasil inteiro. `uf` fica igual quando há um só (compatibilidade). */
  ufs: string[]
}
export const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')
/** Estados da busca: a lista nova ou, em buscas guardadas antes dela, o estado único. */
export function ufsDe(f: Pick<FiltrosOportunidades, 'uf' | 'ufs'>): string[] {
  const lista = Array.isArray(f.ufs) && f.ufs.length ? f.ufs : f.uf ? [f.uf] : []
  return UFS.filter((u) => lista.includes(u))
}
/** Troca os estados mantendo `uf` em dia (um estado só: o próprio; vários ou nenhum: vazio). */
export const comUfs = (ufs: string[]) => { const l = UFS.filter((u) => ufs.includes(u)); return { ufs: l, uf: l.length === 1 ? l[0] : '' } }
export const filtrosExtras = { modalidades: MODALIDADES.map(m=>m[0]) as string[], portais: PORTAIS.map(p => p[0]) as string[], busca: '', orgao: '', minimo: '', maximo: '', itemMinimo: '', itemMaximo: '', maxItens: '', naoDivulgado: false, exclusivo: false, excluirSrp: false, excluir: '', tipoItem: '' as '' | 'M' | 'S', modosDisputa: [] as string[], aberturaDe: '', aberturaAte: '', diasUteis: true, inverter: false, ufs: [] as string[] }
export interface ItemCompra {
  numeroItem: number; descricao?: string; quantidade?: number; unidadeMedida?: string
  valorUnitarioEstimado: number | null; valorTotal?: number | null; orcamentoSigiloso?: boolean
  tipoBeneficio?: number; tipoBeneficioNome?: string; criterioJulgamentoNome?: string; situacaoCompraItemNome?: string
  numeroGrupo?: string | number; numeroLote?: string | number; grupo?: string | number; lote?: string | number
  materialOuServico?: string; materialOuServicoNome?: string; informacaoComplementar?: string | null; temResultado?: boolean
}
/** Períodos rápidos: quantidade de dias corridos contando hoje (null = todo o período). */
export const PERIODOS_ABERTURA = [[7,'7 dias'],[15,'15 dias'],[30,'30 dias'],[null,'Todo o período']] as const
/** Na busca por publicação, "todo o período" é o que o histórico guarda: 12 meses. */
export const PERIODOS_PUBLICACAO = [[7,'7 dias'],[15,'15 dias'],[30,'30 dias'],[null,'12 meses']] as const
/** Data de Brasília (AAAA-MM-DD) de hoje + n dias. */
function diaSP(n: number, hoje: Date) { const d = new Date(hoje); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) }
/** Abertura nos próximos N dias, contando hoje: 7 dias = hoje e os 6 seguintes. */
export function periodoAbertura(dias: number | null, hoje = new Date()) {
  if (dias === null) return { aberturaDe: '', aberturaAte: '' }
  return { aberturaDe: diaSP(0, hoje), aberturaAte: diaSP(dias - 1, hoje) }
}
/** Publicação nos últimos N dias, contando hoje (null = 12 meses). */
export function periodoPublicacao(dias: number | null, hoje = new Date()) {
  return { inicio: dias === null ? diaSP(-365, hoje) : diaSP(1 - dias, hoje), fim: diaSP(0, hoje) }
}
type CamposPeriodo = Pick<FiltrosOportunidades, 'situacao' | 'aberturaDe' | 'aberturaAte' | 'inicio' | 'fim'>
/** Período rápido que bate exatamente com as datas pesquisadas (undefined = datas escolhidas à mão). */
export function periodoRapidoDe(f: CamposPeriodo, hoje = new Date()): number | null | undefined {
  if (f.situacao === 'publicacoes') return PERIODOS_PUBLICACAO.find(([d]) => { const p = periodoPublicacao(d, hoje); return p.inicio === f.inicio && p.fim === f.fim })?.[0]
  return PERIODOS_ABERTURA.find(([d]) => { const p = periodoAbertura(d, hoje); return p.aberturaDe === f.aberturaDe && p.aberturaAte === f.aberturaAte })?.[0]
}
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86400_000)
/**
 * Refaz as datas de uma busca guardada. Com o período rápido escolhido (7, 15, 30 ou todo o período), as datas voltam
 * a contar a partir de hoje: uma aba ou o app instalado aberto de um dia para o outro não fica com dias que já
 * passaram nem com o botão apagado. Sem ele, só converte o formato antigo (hoje + N, um dia a mais).
 * Datas escolhidas à mão ficam como estão.
 */
export function atualizarPeriodoRapido<T extends CamposPeriodo>(f: T, rapido?: number | null, hoje = new Date()): T {
  if (rapido !== undefined) return f.situacao === 'publicacoes' ? { ...f, ...periodoPublicacao(rapido, hoje) } : { ...f, ...periodoAbertura(rapido, hoje) }
  const hojeIso = diaSP(0, hoje)
  const antigo = (de: string, ate: string) => DATA.test(de ?? '') && DATA.test(ate ?? '') ? [7, 15, 30].find((d) => diasEntre(de, ate) === d) : undefined
  if (f.situacao === 'publicacoes') { const d = f.fim === hojeIso ? antigo(f.inicio, f.fim) : undefined; return d ? { ...f, ...periodoPublicacao(d, hoje) } : f }
  const d = f.aberturaDe === hojeIso ? antigo(f.aberturaDe, f.aberturaAte) : undefined
  return d ? { ...f, ...periodoAbertura(d, hoje) } : f
}
const DATA = /^\d{4}-\d{2}-\d{2}$/
/** Atalhos de "Próximas disputas": dia inicial e final contados a partir de hoje (0 = hoje). */
export const PROXIMAS_DISPUTAS = [[0,0,'Hoje'],[1,1,'Amanhã'],[0,6,'7 dias'],[0,29,'30 dias']] as const
/** Período de abertura entre hoje+de e hoje+ate (datas de Brasília). */
export function periodoEntre(de: number, ate: number, hoje = new Date()) {
  const iso = (n: number) => { const d = new Date(hoje); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) }
  return { aberturaDe: iso(de), aberturaAte: iso(ate) }
}
export function validarFiltros(f: FiltrosOportunidades) {
  if (!f.modalidades.length || !f.portais.length) throw new Error('Selecione ao menos um portal e uma modalidade.')
  for (const [min,max] of [[f.minimo,f.maximo],[f.itemMinimo,f.itemMaximo]]) {
    if ([min,max].some(x => x !== '' && (!Number.isFinite(Number(x)) || Number(x)<0)) || (min !== '' && max !== '' && Number(min)>Number(max))) throw new Error('Informe intervalos de valores válidos.')
  }
  if (f.aberturaDe && f.aberturaAte && f.aberturaDe > f.aberturaAte) throw new Error('A data inicial de abertura deve ser anterior à final.')
  if (f.busca.length > 300 || f.excluir.length > 300) throw new Error('Use no máximo 300 caracteres nos termos da pesquisa.')
  if (f.maxItens !== '' && (!Number.isInteger(Number(f.maxItens)) || Number(f.maxItens)<1)) throw new Error('A quantidade máxima de itens deve ser um inteiro positivo.')
}
export async function consultarItens(c: CompraPNCP, signal?: AbortSignal): Promise<ItemCompra[]> {
  const itens: ItemCompra[] = []
  for (let pagina=1; pagina<=20; pagina++) {
    const u=`https://pncp.gov.br/api/pncp/v1/orgaos/${encodeURIComponent(c.orgaoEntidade.cnpj)}/compras/${c.anoCompra}/${c.sequencialCompra}/itens?pagina=${pagina}&tamanhoPagina=500`
    const r=await fetch(u,{signal})
    if (r.status===204) return itens
    if (!r.ok) throw new Error('Não foi possível verificar os itens de todos os editais. Tente novamente ou remova os filtros por item.')
    const dados=await r.json()
    if (!Array.isArray(dados) || dados.some(i => !Number.isInteger(i.numeroItem))) throw new Error('A fonte retornou itens em formato inesperado.')
    if (dados.some(i => itens.some(a => a.numeroItem===i.numeroItem))) throw new Error('A fonte não confirmou a paginação dos itens. Refine a consulta.')
    itens.push(...dados)
    if (dados.length<500) return itens
  }
  throw new Error('O edital excede o limite de verificação de itens. Consulte seu detalhamento original.')
}

/** Um filtro aplicado: o rótulo curto e, quando pode ser tirado, os campos que voltam ao padrão. */
export interface FiltroAplicado { rotulo: string; remover?: Partial<FiltrosOportunidades> }

/**
 * Filtros aplicados numa busca, em rótulos curtos para mostrar acima da contagem de resultados.
 * `modalidadesPossiveis` é quantas modalidades o cliente pode usar (todas marcadas = não mostra).
 * Rótulos sem `remover` já são o padrão (Brasil inteiro, todo o período) ou são obrigatórios (publicação).
 */
export function resumoFiltros(f: FiltrosOportunidades, modalidadesPossiveis: number, portaisPossiveis: number, hoje = new Date()): FiltroAplicado[] {
  const r: FiltroAplicado[] = []
  const add = (rotulo: string, remover?: Partial<FiltrosOportunidades>) => { r.push({ rotulo, remover }) }
  const data = (iso: string) => iso.split('-').reverse().join('/')
  const moeda = (v: string) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
  const faixa = (min: string, max: string) => min && max ? `${moeda(min)} a ${moeda(max)}` : min ? `a partir de ${moeda(min)}` : `até ${moeda(max)}`
  if (f.busca.trim()) add(`Busca: ${f.busca.trim()}`, { busca: '' })
  const ufs = ufsDe(f)
  if (ufs.length) add(ufs.length <= 4 ? `UF: ${ufs.join(', ')}` : `${ufs.length} estados`, { uf: '', ufs: [] }); else add('Brasil inteiro')
  // Período rápido aparece pelo nome e com as datas, para casar com os botões de 7, 15 e 30 dias.
  const rapido = periodoRapidoDe(f, hoje)
  if (f.situacao === 'publicacoes') {
    const datas = `${f.inicio ? data(f.inicio) : '…'} a ${f.fim ? data(f.fim) : '…'}`
    if (f.inicio || f.fim) add(typeof rapido === 'number' ? `Publicação: últimos ${rapido} dias (${datas})` : rapido === null ? `Publicação: últimos 12 meses` : `Publicação: ${datas}`)
  } else if (f.aberturaDe || f.aberturaAte) {
    const datas = `${f.aberturaDe ? data(f.aberturaDe) : '…'} a ${f.aberturaAte ? data(f.aberturaAte) : '…'}`
    add(f.aberturaDe === f.aberturaAte ? `Abertura em ${data(f.aberturaDe)}` : typeof rapido === 'number' ? `Abertura: próximos ${rapido} dias (${datas})` : `Abertura: ${datas}`, { aberturaDe: '', aberturaAte: '' })
  } else add('Abertura: todo o período')
  if (f.diasUteis) add('Só dias úteis', { diasUteis: false })
  if (f.modalidades.length && f.modalidades.length < modalidadesPossiveis) {
    const nomes = f.modalidades.map((m) => MODALIDADES.find((x) => x[0] === m)?.[1] ?? m)
    add(nomes.length <= 2 ? nomes.join(' e ') : `${nomes.length} modalidades`, { modalidades: filtrosExtras.modalidades })
  }
  if (f.portais.length && f.portais.length < portaisPossiveis) add(f.portais.length === 1 ? '1 portal' : `${f.portais.length} portais`, { portais: filtrosExtras.portais })
  if (f.orgao) add(`Órgão: ${f.orgao}`, { orgao: '' })
  if (f.minimo || f.maximo) add(`Valor do edital ${faixa(f.minimo, f.maximo)}`, { minimo: '', maximo: '' })
  if (f.itemMinimo || f.itemMaximo) add(`Valor do item ${faixa(f.itemMinimo, f.itemMaximo)}`, { itemMinimo: '', itemMaximo: '' })
  if (f.maxItens) add(`Até ${f.maxItens} ${f.maxItens === '1' ? 'item' : 'itens'}`, { maxItens: '' })
  if (f.tipoItem) add(TIPOS_ITEM.find((t) => t[0] === f.tipoItem)?.[1] ?? f.tipoItem, { tipoItem: '' })
  if (f.modosDisputa.length) add(`Disputa: ${f.modosDisputa.map((m) => MODOS_DISPUTA.find((x) => x[0] === m)?.[1] ?? m).join(', ')}`, { modosDisputa: [] })
  if (f.naoDivulgado) add('Valor não divulgado', { naoDivulgado: false })
  if (f.exclusivo) add('Item exclusivo ME/EPP', { exclusivo: false })
  if (f.excluirSrp) add('Sem registro de preços', { excluirSrp: false })
  if (f.excluir.trim()) add(`Sem: ${f.excluir.trim()}`, { excluir: '' })
  return r
}
