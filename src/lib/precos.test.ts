import { describe, expect, it } from 'vitest'
import { identificacaoCompra, linkPesquisaMarca } from './precos'

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
