import { consultarPNCP, type CompraPNCP, type FiltrosPNCP } from './pncp'
import { normalizar, portalCompra, PORTAIS } from './portais'

export const MODALIDADES = [['6','Pregão eletrônico'],['8','Dispensa'],['4','Concorrência eletrônica'],['5','Concorrência presencial'],['7','Pregão presencial'],['9','Inexigibilidade']] as const
export interface FiltrosOportunidades extends FiltrosPNCP {
  modalidades: string[]; portais: string[]; busca: string; orgao: string
  minimo: string; maximo: string; itemMinimo: string; itemMaximo: string
  maxItens: string; naoDivulgado: boolean; exclusivo: boolean; excluirSrp: boolean
}
export const filtrosExtras = { modalidades: ['6','8'], portais: PORTAIS.map(p => p[0]) as string[], busca: '', orgao: '', minimo: '', maximo: '', itemMinimo: '', itemMaximo: '', maxItens: '', naoDivulgado: false, exclusivo: false, excluirSrp: false }
export interface ItemCompra { numeroItem: number; valorUnitarioEstimado: number | null; orcamentoSigiloso?: boolean; tipoBeneficio?: number }
export function validarFiltros(f: FiltrosOportunidades) {
  if (!f.modalidades.length || !f.portais.length) throw new Error('Selecione ao menos um portal e uma modalidade.')
  for (const [min,max] of [[f.minimo,f.maximo],[f.itemMinimo,f.itemMaximo]]) {
    if ([min,max].some(x => x !== '' && (!Number.isFinite(Number(x)) || Number(x)<0)) || (min !== '' && max !== '' && Number(min)>Number(max))) throw new Error('Informe intervalos de valores válidos.')
  }
  if (f.maxItens !== '' && (!Number.isInteger(Number(f.maxItens)) || Number(f.maxItens)<1)) throw new Error('A quantidade máxima de itens deve ser um inteiro positivo.')
}
function intervalo(v: number | null | undefined, min: string, max: string) {
  if (!min && !max) return true
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && (!min || v>=Number(min)) && (!max || v<=Number(max))
}
export function filtrarCompra(c: CompraPNCP, f: FiltrosOportunidades) {
  const texto = normalizar(`${c.objetoCompra} ${c.orgaoEntidade.razaoSocial} ${c.numeroCompra}`)
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
export async function buscarOportunidades(f: FiltrosOportunidades, pagina: number, signal?: AbortSignal) {
  validarFiltros(f)
  const respostas=await Promise.all(f.modalidades.map(async modalidade=>{
    const primeira=await consultarPNCP({...f,modalidade},1,signal)
    if (pagina===1) return primeira
    const atual=pagina<=primeira.totalPaginas ? await consultarPNCP({...f,modalidade},pagina,signal) : {data:[]}
    return {...primeira,data:atual.data}
  }))
  const compras=respostas.flatMap(r=>r.data)
  const candidatos=compras.filter(c=>filtrarCompra(c,f))
  let data=candidatos
  if (precisaItens(f)) {
    // Quatro consultas simultâneas, canceladas quando o usuário muda a pesquisa.
    const resultados: CompraPNCP[]=[]
    let proximo=0
    await Promise.all(Array.from({length:Math.min(4,candidatos.length)},async()=>{
      while (proximo<candidatos.length) {
        signal?.throwIfAborted()
        const c=candidatos[proximo++]
        if (filtrarItens(await consultarItens(c,signal),f)) resultados.push(c)
      }
    }))
    const ids=new Set(resultados.map(c=>c.numeroControlePNCP))
    data=candidatos.filter(c=>ids.has(c.numeroControlePNCP))
  }
  return {data, compras, totalPaginas:Math.max(0,...respostas.map(r=>r.totalPaginas)),totalRegistros:respostas.reduce((n,r)=>n+r.totalRegistros,0)}
}
