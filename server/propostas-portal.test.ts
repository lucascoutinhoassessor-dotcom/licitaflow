import { describe, expect, it } from 'vitest'
import { itensDoPortal } from './atas.js'
import { comPropostas } from './propostas-portal.js'

// Formato curto mandado pelo coletor (public/coletor-propostas.js), com CNPJs válidos de verdade.
const coletado = [
  {
    t: 'i', n: 1, p: [
      { c: '48943133000128', nm: 'LIBRASIL INFORMATICA LTDA', uf: 'SP', me: true, v: 148, vt: 29600, vi: 300, cl: 1, st: '6', mo: null, ma: 'Teca', mod: 'Reglete', q: 200 },
      { c: '27176482000191', nm: 'DOUGLAS CORDEIRO LTDA', uf: 'SC', me: true, v: 149, vt: 29800, vi: 261, cl: 2, st: '', mo: null, ma: 'SL METALUMI', mod: null },
      { c: '61720863000128', nm: 'APEX TRADING LTDA', v: 64.29, cl: null, st: '2', mo: 'acima do valor estimado.', ma: 'APEX' },
      { c: '12345678901', nm: 'PESSOA FISICA', v: 10, cl: 4, st: '' },
      { c: '48943133000128', nm: 'REPETIDA', v: 1, cl: 9 },
    ],
  },
  { t: 'g', n: 3, p: [{ c: '40938465000102', nm: 'TAVSAN', v: 155, cl: 3, st: '5', mo: 'Documentação vencida' }] },
  { t: 'i', n: 0, p: [{ c: '40938465000102' }] },
  { t: 'i', n: 4, p: 'nada' },
]

describe('propostas do Compras.gov.br', () => {
  const itens = itensDoPortal(coletado)

  it('guarda todas as colocações com marca, valor e situação', () => {
    expect(itens.map((i) => `${i.tipo}${i.numero}`)).toEqual(['item1', 'grupo3'])
    const [venc, segunda, desc] = itens[0].empresas
    expect(venc).toMatchObject({ cnpj: '48943133000128', situacao: 'classificada', adjudicada: true, colocacao: 1, valor: 148, valorInicial: 300, marca: 'Teca', meEpp: true, uf: 'SP', quantidade: 200 })
    expect(segunda).toMatchObject({ situacao: 'classificada', colocacao: 2, marca: 'SL METALUMI' })
    expect(desc).toMatchObject({ situacao: 'desclassificacao', colocacao: null, motivo: 'acima do valor estimado.' })
    expect(itens[1].empresas[0]).toMatchObject({ situacao: 'inabilitacao', motivo: 'Documentação vencida' })
  })

  it('deixa de fora CPF e CNPJ repetido', () => {
    expect(itens[0].empresas).toHaveLength(3)
  })

  it('não aceita lixo', () => {
    expect(itensDoPortal(null)).toEqual([])
    expect(itensDoPortal([{ t: 'i', n: 2, p: [{ c: '11111111111111', nm: 'X' }] }])).toEqual([])
  })

  it('junta as propostas à compra do histórico de preços pelo número do item', () => {
    const compras = [{ idCompra: '15200405001792026', numeroItem: 1, preco: 148 }, { idCompra: '15200405001792026', numeroItem: 2, preco: 10 }]
    const [com, sem] = comPropostas(compras, { '15200405001792026': itens })
    expect(com.propostas.map((p: { colocacao: number | null }) => p.colocacao)).toEqual([1, 2, null])
    expect(com.propostas[0]).toMatchObject({ situacao: 'vencedora', marca: 'Teca', preco: 148, precoInicial: 300, quantidade: 200 })
    expect(sem.propostas).toBeUndefined()
  })
})
