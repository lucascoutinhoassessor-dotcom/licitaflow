import { consultarCatalogo, type CompraPNCP, type FiltrosPNCP } from './pncp'
import { normalizar, portalCompra, PORTAIS } from './portais'

export const MODALIDADES = [['6','Pregão eletrônico'],['8','Dispensa'],['4','Concorrência eletrônica'],['5','Concorrência presencial'],['7','Pregão presencial'],['9','Inexigibilidade']] as const
export interface FiltrosOportunidades extends FiltrosPNCP {
  modalidades: string[]; portais: string[]; busca: string; orgao: string
  minimo: string; maximo: string; itemMinimo: string; itemMaximo: string
  maxItens: string; naoDivulgado: boolean; exclusivo: boolean; excluirSrp: boolean
}
export const filtrosExtras = { modalidades: MODALIDADES.map(m=>m[0]) as string[], portais: PORTAIS.map(p => p[0]) as string[], busca: '', orgao: '', minimo: '', maximo: '', itemMinimo: '', itemMaximo: '', maxItens: '', naoDivulgado: false, exclusivo: false, excluirSrp: false }
export interface ItemCompra {
  numeroItem: number; descricao?: string; quantidade?: number; unidadeMedida?: string
  valorUnitarioEstimado: number | null; valorTotal?: number | null; orcamentoSigiloso?: boolean
  tipoBeneficio?: number; tipoBeneficioNome?: string; criterioJulgamentoNome?: string; situacaoCompraItemNome?: string
  numeroGrupo?: string | number; numeroLote?: string | number; grupo?: string | number; lote?: string | number
}
export function validarFiltros(f: FiltrosOportunidades) {
  if (!f.modalidades.length || !f.portais.length) throw new Error('Selecione ao menos um portal e uma modalidade.')
  for (const [min,max] of [[f.minimo,f.maximo],[f.itemMinimo,f.itemMaximo]]) {
    if ([min,max].some(x => x !== '' && (!Number.isFinite(Number(x)) || Number(x)<0)) || (min !== '' && max !== '' && Number(min)>Number(max))) throw new Error('Informe intervalos de valores válidos.')
  }
  if (precisaItens(f) && !f.busca.trim() && !f.uf && !f.orgao) throw new Error('Informe uma palavra-chave, UF ou órgão para consultar filtros por item.')
  if (f.maxItens !== '' && (!Number.isInteger(Number(f.maxItens)) || Number(f.maxItens)<1)) throw new Error('A quantidade máxima de itens deve ser um inteiro positivo.')
}
function intervalo(v: number | null | undefined, min: string, max: string) {
  if (!min && !max) return true
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && (!min || v>=Number(min)) && (!max || v<=Number(max))
}
export function filtrarCompra(c: CompraPNCP, f: FiltrosOportunidades) {
  const texto = normalizar(`${c.objetoCompra} ${c.informacaoComplementar??''} ${c.orgaoEntidade.razaoSocial} ${c.numeroCompra}`)
  return f.portais.includes(portalCompra(c)[0])
    && normalizar(f.busca).trim().split(/\s+/).every(t => texto.includes(t))
    && (!f.orgao || c.orgaoEntidade.cnpj === f.orgao)
    && (!f.excluirSrp || c.srp === false)
    && (f.naoDivulgado ? c.valorTotalEstimado == null || c.valorTotalEstimado === 0 : intervalo(c.valorTotalEstimado,f.minimo,f.maximo))
}
export function precisaItens(f: FiltrosOportunidades) { return !!(f.itemMinimo || f.itemMaximo || f.maxItens || f.exclusivo) }
export function filtrarItens(itens: ItemCompra[], f: FiltrosOportunidades) {
  if (!itens.length || (f.maxItens && itens.length > Number(f.maxItens))) return false
  // ME/EPP e faixa unitária precisam corresponder ao mesmo item, sem inferir exclusividade de todo o edital.
  return itens.some(i => (!f.exclusivo || i.tipoBeneficio === 1)
    && ((!f.itemMinimo && !f.itemMaximo) || (!i.orcamentoSigiloso && intervalo(i.valorUnitarioEstimado,f.itemMinimo,f.itemMaximo))))
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
export interface ProgressoBusca {
  data: CompraPNCP[]; compras: CompraPNCP[]; paginas: number; totalPaginas: number; verificados: number
}
type ObterPagina = typeof consultarCatalogo
async function percorrerOportunidades(f: FiltrosOportunidades, _pagina=1, signal?: AbortSignal, opcoes?: {
  obterPagina?: ObterPagina; progresso?: (p: ProgressoBusca) => void
}) {
  validarFiltros(f)
  const obter=opcoes?.obterPagina ?? consultarCatalogo
  const compras=new Map<string,CompraPNCP>(), encontrados=new Map<string,CompraPNCP>()
  const paginasVistas=new Set<string>(), assinaturas=new Map<string,Set<string>>()
  let paginas=0,totalPaginas=0
  const publicar=()=>{
    signal?.throwIfAborted()
    opcoes?.progresso?.({data:[...encontrados.values()],compras:[],paginas,totalPaginas,verificados:compras.size})
  }
  const consumir=async(modalidade:string,pagina:number)=>{
    signal?.throwIfAborted()
    const r=await obter({...f,modalidade},pagina,signal)
    signal?.throwIfAborted()
    if(r.totalPaginas>10000)throw new Error('A consulta é muito ampla. Selecione UF ou período para percorrer todos os resultados.')
    const assinatura=r.data.map(c=>c.numeroControlePNCP).join('|')
    const anteriores=assinaturas.get(modalidade)??new Set<string>()
    if(assinatura && anteriores.has(assinatura))throw new Error('A fonte repetiu uma página. Retome a consulta para confirmar os resultados.')
    if(assinatura)anteriores.add(assinatura)
    assinaturas.set(modalidade,anteriores)
    for(const c of r.data){
      if(compras.has(c.numeroControlePNCP))continue
      compras.set(c.numeroControlePNCP,c)
      if(!filtrarCompra(c,f))continue
      if(!precisaItens(f)||filtrarItens(await consultarItens(c,signal),f))encontrados.set(c.numeroControlePNCP,c)
    }
    paginasVistas.add(`${modalidade}:${pagina}`)
    paginas++
    publicar()
    return r
  }
  // O termo é aplicado em todas as páginas selecionadas, nunca somente no lote visível.
  const primeiras: Awaited<ReturnType<ObterPagina>>[]=[]
  for(let i=0;i<f.modalidades.length;i+=4)primeiras.push(...await Promise.all(f.modalidades.slice(i,i+4).map(m=>consumir(m,1))))
  const limites=new Map(f.modalidades.map((m,i)=>[m,primeiras[i].totalPaginas]))
  const tarefas:{modalidade:string;pagina:number}[]=[]
  const agendar=(modalidade:string,ate:number)=>{
    const anterior=limites.get(modalidade)??0
    for(let pagina=Math.max(2,anterior+1);pagina<=ate;pagina++)tarefas.push({modalidade,pagina})
    limites.set(modalidade,Math.max(anterior,ate))
    totalPaginas=[...limites.values()].reduce((n,v)=>n+Math.max(1,v),0)
  }
  for(let i=0;i<f.modalidades.length;i++){
    const m=f.modalidades[i];limites.set(m,1);agendar(m,primeiras[i].totalPaginas)
  }
  publicar()
  let proximo=0
  await Promise.all(Array.from({length:Math.min(4,tarefas.length)},async()=>{
    while(proximo<tarefas.length){
      signal?.throwIfAborted()
      const t=tarefas[proximo++]
      if(paginasVistas.has(`${t.modalidade}:${t.pagina}`))continue
      const r=await consumir(t.modalidade,t.pagina)
      if(r.totalPaginas>(limites.get(t.modalidade)??0))agendar(t.modalidade,r.totalPaginas)
    }
  }))
  signal?.throwIfAborted()
  const data=[...encontrados.values()].sort((a,b)=>(b.dataPublicacaoPncp??'').localeCompare(a.dataPublicacaoPncp??'')||a.numeroControlePNCP.localeCompare(b.numeroControlePNCP))
  return {data,compras:[...compras.values()],totalRegistros:data.length,totalPaginas:Math.ceil(data.length/20),verificados:compras.size,paginasConsultadas:paginas}
}

export async function buscarOportunidades(f: FiltrosOportunidades, pagina=1, signal?: AbortSignal, opcoes?: Parameters<typeof percorrerOportunidades>[3]) {
  const controle=new AbortController()
  try {return await percorrerOportunidades(f,pagina,signal?AbortSignal.any([signal,controle.signal]):controle.signal,opcoes)}
  catch(erro){controle.abort();throw erro}
}
