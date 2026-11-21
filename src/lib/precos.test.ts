import { describe, expect, it } from 'vitest'
import { identificacaoCompra, linkPesquisaMarca, sinonimosDoCatalogo } from './precos'

describe('sinônimos do catálogo', () => {
  it('leva "papel A4", "sulfite" e "resma" ao papel para impressão formatado', () => {
    for (const t of ['papel A4', 'Papel sulfite', 'resma de papel', 'papel ofício']) expect(sinonimosDoCatalogo(t, '')[0]).toMatchObject({ codigo: 19746, sinonimo: true })
    expect(sinonimosDoCatalogo('papel A4', 'S')).toEqual([])
    expect(sinonimosDoCatalogo('papel kraft', '')).toEqual([])
    expect(sinonimosDoCatalogo('a4tech mouse', '')).toEqual([])
  })
})

describe('histórico de preços', () => {
  it('monta modalidade, número e ano a partir do código da compra', () => {
    expect(identificacaoCompra('13503606000242026', 6)).toBe('Dispensa Nº 24/2026')
    expect(identificacaoCompra('92513405000862025', null)).toBe('Pregão eletrônico Nº 86/2025')
    expect(identificacaoCompra('abc', null)).toBe('Compra')
  })
  it('pesquisa a marca no Google com o nome curto do item', () => {
    const u = new URL(linkPesquisaMarca('PILOT', 'CARTUCHO CANETA TINTEIRO, MATERIAL: PLÁSTICO'))
    expect(u.hostname).toBe('www.google.com')
    expect(u.searchParams.get('q')).toBe('PILOT CARTUCHO CANETA TINTEIRO')
  })
})
