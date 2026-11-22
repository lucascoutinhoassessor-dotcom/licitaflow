import { describe, expect, it } from 'vitest'
import { concorrentesDoItem, numerosCitados } from './concorrentesItem'
import type { ItemCompraFederal, ResultadoItemFederal } from './compraFederal'
import type { AtasCompra } from './atas'

const res = (fornecedor: string, cnpj: string, ordem: number | null, valor: number, extra: Partial<ResultadoItemFederal> = {}): ResultadoItemFederal =>
  ({ fornecedor, cnpj, porte: null, quantidade: 1, valorUnitario: valor, valorTotal: valor, ordem, meEpp: false, desconto: null, situacao: 'Informado', ...extra })
const item = (numero: number, grupo: number | null, resultados: ResultadoItemFederal[] = [], cancelados: ResultadoItemFederal[] = []): ItemCompraFederal =>
  ({ numero, grupo, descricao: '', resumo: null, tipo: null, quantidade: 1, unidade: null, valorEstimado: null, sigiloso: false, situacao: null, criterio: null, beneficio: null, marca: null, resultados, cancelados })
const ata = (p: Partial<AtasCompra>): AtasCompra => ({ controle: 'x', documentos: [], ocorrencias: [], participantes: [], ...p })

describe('números citados na ata', () => {
  it('entende listas, faixas, lote e grupo', () => {
    expect([...numerosCitados('Itens 1, 3 a 5 e 9')!.numeros]).toEqual([1, 3, 4, 5, 9])
    expect(numerosCitados('Lote 2')).toMatchObject({ tipo: 'grupo' })
    expect(numerosCitados('Item 12')!.numeros.has(12)).toBe(true)
    expect(numerosCitados(null)).toBeNull()
  })
})

describe('concorrentes do item', () => {
  it('põe vencedora, reserva, desclassificada, inabilitada e cancelada na ordem', () => {
    const i12 = item(12, null, [res('B', '22222222000122', 2, 5000), res('A', '11111111000111', 1, 4730)], [res('Z', '99999999000199', null, 4000, { motivoCancelamento: 'Conforme solicitação.' })])
    const outro = item(13, null)
    const atas = ata({
      participantes: [
        { cnpj: '33333333000133', nome: 'C LTDA', mencoes: 1, documento: 'Ata', url: '', situacoes: [{ tipo: 'desclassificacao', itens: 'Itens 10 a 12', motivo: 'Marca fora do edital' }] },
        { cnpj: '44444444000144', nome: 'D LTDA', mencoes: 1, documento: 'Ata', url: '', situacoes: [{ tipo: 'inabilitacao', itens: 'Item 12', motivo: 'Sem atestado' }] },
        { cnpj: '55555555000155', nome: 'E LTDA', mencoes: 1, documento: 'Ata', url: '', situacoes: [{ tipo: 'desclassificacao', itens: 'Item 13', motivo: 'Outro item' }] },
        { cnpj: '66666666000166', nome: 'F LTDA', mencoes: 1, documento: 'Ata', url: '' },
      ],
    })
    const { lista, semItem } = concorrentesDoItem(i12, [i12, outro], atas)
    expect(lista.map((c) => [c.nome, c.situacao])).toEqual([['A', 'vencedora'], ['B', 'classificada'], ['C LTDA', 'desclassificacao'], ['D LTDA', 'inabilitacao'], ['Z', 'cancelado']])
    expect(lista.find((c) => c.nome === 'Z')!.motivo).toBe('Conforme solicitação.')
    // E é de outro item; F não tem item indicado e a compra tem dois itens.
    expect(semItem.map((c) => c.nome)).toEqual(['F LTDA'])
  })

  it('liga pelo grupo/lote e, com um grupo só, traz todas as citadas na ata', () => {
    const a = item(1, 1, [res('A', '11111111000111', 1, 10)]), b = item(2, 1)
    const atas = ata({
      participantes: [{ cnpj: '66666666000166', nome: 'F LTDA', mencoes: 1, documento: 'Ata', url: '', colocacao: 3 }],
      ocorrencias: [{ tipo: 'desclassificacao', empresa: 'G COMERCIO LTDA', cnpj: null, itens: 'Lote 1', data: null, motivo: 'Proposta acima do estimado', documento: 'Ata', url: '' }],
    })
    const { lista, semItem } = concorrentesDoItem(b, [a, b], atas)
    expect(lista.map((c) => [c.nome, c.situacao, c.colocacao])).toEqual([['F LTDA', 'classificada', 3], ['G COMERCIO LTDA', 'desclassificacao', null]])
    expect(semItem).toEqual([])
  })

  it('não muda a situação oficial com o que a ata diz', () => {
    const i = item(1, null, [res('A LTDA', '11111111000111', 1, 10)])
    const atas = ata({ ocorrencias: [{ tipo: 'desclassificacao', empresa: 'A LTDA', cnpj: '11111111000111', itens: 'Item 1', data: null, motivo: 'Antes do recurso', documento: 'Ata', url: '' }] })
    expect(concorrentesDoItem(i, [i], atas).lista).toMatchObject([{ situacao: 'vencedora', motivo: null }])
  })
})
