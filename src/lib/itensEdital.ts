import type { ItemCompra } from './filtrosOportunidades'
import { formatarMoeda } from './format'
// "LOTE 01 - ...", "Grupo nº 2:", "LOTE: 3" no começo da descrição ou na informação complementar.
const MARCA_GRUPO = {
  lote: /(?:^|[\s([-])LOTE\s*(?:N[º°O.]*\s*)?[:\-–]?\s*0*(\d{1,3})(?![\d,.]\d)/i,
  grupo: /(?:^|[\s([-])GRUPO\s*(?:N[º°O.]*\s*)?[:\-–]?\s*0*(\d{1,3})(?![\d,.]\d)/i,
}
/** Número do lote/grupo escrito no item (só no começo da descrição, para não pegar "lote de fabricação 123"). */
export function grupoNoTexto(item: Pick<ItemCompra, 'descricao' | 'informacaoComplementar'>, por: 'grupo'|'lote') {
  const re = MARCA_GRUPO[por]
  return re.exec((item.descricao ?? '').slice(0, 40))?.[1] ?? re.exec(item.informacaoComplementar ?? '')?.[1] ?? null
}
export function identificacaoGrupo(item: ItemCompra, por: 'grupo'|'lote') {
  const valor=por==='grupo' ? item.numeroGrupo??item.grupo : item.numeroLote??item.lote
  // O Compras.gov usa 0 para "sem grupo".
  if ((typeof valor==='number' && Number.isFinite(valor) && valor>0) || (typeof valor==='string' && valor.trim() && valor.trim()!=='0')) return String(valor).trim()
  return grupoNoTexto(item, por)
}
/** Junta o número do grupo do Compras.gov (por número do item) aos itens do PNCP. */
export function comGrupos(itens: ItemCompra[], grupos: Record<string, number> | null | undefined) {
  if (!grupos || !Object.keys(grupos).length) return itens
  return itens.map((i) => (grupos[i.numeroItem] ? { ...i, numeroGrupo: grupos[i.numeroItem] } : i))
}
export function agruparItens(itens: ItemCompra[], por: 'grupo'|'lote') {
  const grupos=new Map<string,ItemCompra[]>()
  for(const item of itens){
    const id=identificacaoGrupo(item,por)
    const chave=id ? `${por==='grupo'?'Grupo':'Lote'} ${id}` : 'Sem agrupamento informado'
    grupos.set(chave,[...(grupos.get(chave)??[]),item])
  }
  return grupos
}
export function valorItem(item: ItemCompra, total=false) {
  if(item.orcamentoSigiloso===true)return 'Sigiloso'
  const valor=total?item.valorTotal:item.valorUnitarioEstimado
  return typeof valor==='number' && Number.isFinite(valor) && valor>0 ? formatarMoeda(valor) : 'Não divulgado'
}

/** Resumo curto do item: título até o primeiro ":" ou 80 caracteres. */
export function tituloItem(descricao?: string) {
  const d = (descricao ?? '').trim()
  if (!d) return 'Item sem descrição'
  const corte = d.indexOf(':')
  const base = corte > 3 && corte < 80 ? d.slice(0, corte) : d
  return base.length > 80 ? `${base.slice(0, 77)}…` : base
}
