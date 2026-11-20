import type { ItemCompra } from './filtrosOportunidades'
import { formatarMoeda } from './format'
export function identificacaoGrupo(item: ItemCompra, por: 'grupo'|'lote') {
  const valor=por==='grupo' ? item.numeroGrupo??item.grupo : item.numeroLote??item.lote
  return (typeof valor==='number' && Number.isFinite(valor)) || (typeof valor==='string' && valor.trim()) ? String(valor).trim() : null
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
