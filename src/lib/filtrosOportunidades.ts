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
}
export const filtrosExtras = { modalidades: MODALIDADES.map(m=>m[0]) as string[], portais: PORTAIS.map(p => p[0]) as string[], busca: '', orgao: '', minimo: '', maximo: '', itemMinimo: '', itemMaximo: '', maxItens: '', naoDivulgado: false, exclusivo: false, excluirSrp: false, excluir: '', tipoItem: '' as '' | 'M' | 'S', modosDisputa: [] as string[], aberturaDe: '', aberturaAte: '', diasUteis: true, inverter: false }
export interface ItemCompra {
  numeroItem: number; descricao?: string; quantidade?: number; unidadeMedida?: string
  valorUnitarioEstimado: number | null; valorTotal?: number | null; orcamentoSigiloso?: boolean
  tipoBeneficio?: number; tipoBeneficioNome?: string; criterioJulgamentoNome?: string; situacaoCompraItemNome?: string
  numeroGrupo?: string | number; numeroLote?: string | number; grupo?: string | number; lote?: string | number
  materialOuServico?: string; materialOuServicoNome?: string; informacaoComplementar?: string | null; temResultado?: boolean
}
/** Períodos rápidos de abertura: quantidade de dias a partir de hoje (null = todo o período). */
export const PERIODOS_ABERTURA = [[7,'7 dias'],[15,'15 dias'],[30,'30 dias'],[null,'Todo o período']] as const
export function periodoAbertura(dias: number | null, hoje = new Date()) {
  if (dias === null) return { aberturaDe: '', aberturaAte: '' }
  const fim = new Date(hoje); fim.setDate(fim.getDate() + dias)
  const iso = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  return { aberturaDe: iso(hoje), aberturaAte: iso(fim) }
}
/** Atalhos de "Próximas disputas": dia inicial e final contados a partir de hoje (0 = hoje). */
export const PROXIMAS_DISPUTAS = [[0,0,'Hoje'],[1,1,'Amanhã'],[0,7,'7 dias'],[0,30,'30 dias']] as const
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
