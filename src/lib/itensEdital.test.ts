import {describe,expect,it} from 'vitest'
import {agruparItens,identificacaoGrupo,valorItem, tituloItem } from './itensEdital'
describe('itens, grupos, lotes e sigilo',()=>{
 it('mantém o item consultável mas nunca exibe seus valores sigilosos',()=>{
  const item={numeroItem:1,descricao:'Microcomputador',valorUnitarioEstimado:9999,valorTotal:99999,orcamentoSigiloso:true}
  expect(valorItem(item)).toBe('Sigiloso');expect(valorItem(item,true)).toBe('Sigiloso');expect(item.descricao).toBe('Microcomputador')
 })
 it('usa somente agrupamentos explicitamente informados',()=>{
  const itens=[{numeroItem:1,numeroGrupo:2,valorUnitarioEstimado:10},{numeroItem:2,grupo:'2',valorUnitarioEstimado:10},{numeroItem:3,numeroLote:7,valorUnitarioEstimado:null}]
  expect(agruparItens(itens,'grupo').get('Grupo 2')).toHaveLength(2)
  expect(agruparItens(itens,'lote').get('Lote 7')).toHaveLength(1)
  expect(identificacaoGrupo(itens[2],'grupo')).toBeNull()
  expect(agruparItens(itens,'grupo').get('Sem agrupamento informado')).toHaveLength(1)
 })
})

describe('título curto do item', () => {
  it('usa o trecho antes de ":" e limita o tamanho', () => {
    expect(tituloItem('Cartão Controle Acesso material: pvc, comprimento 8,55')).toBe('Cartão Controle Acesso material')
    expect(tituloItem('')).toBe('Item sem descrição')
    expect(tituloItem('x'.repeat(120)).length).toBe(78)
  })
})
