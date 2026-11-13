import { describe, expect, it } from 'vitest'
import { descontoSobreReferencia, margemSobrePreco, precoLimite, situacaoPrazo, situacaoValidade, totalItens } from './dominio'

const hoje = new Date(2026, 10, 13, 12, 0)

describe('situacaoValidade', () => {
  it('classifica documentos pela validade', () => {
    expect(situacaoValidade(null, 15, hoje)).toBe('sem_validade')
    expect(situacaoValidade('2026-11-12', 15, hoje)).toBe('vencido')
    expect(situacaoValidade('2026-11-13', 15, hoje)).toBe('vence_em_breve')
    expect(situacaoValidade('2026-11-28', 15, hoje)).toBe('vence_em_breve')
    expect(situacaoValidade('2026-11-29', 15, hoje)).toBe('valido')
  })
})

describe('situacaoPrazo', () => {
  it('classifica prazos', () => {
    expect(situacaoPrazo('2026-11-10T10:00:00', false, hoje)).toBe('atrasado')
    expect(situacaoPrazo('2026-11-13T09:00:00', false, hoje)).toBe('atrasado')
    expect(situacaoPrazo('2026-11-13T15:00:00', false, hoje)).toBe('hoje')
    expect(situacaoPrazo('2026-11-18T10:00:00', false, hoje)).toBe('semana')
    expect(situacaoPrazo('2026-12-30T10:00:00', false, hoje)).toBe('futuro')
    expect(situacaoPrazo('2026-11-10T10:00:00', true, hoje)).toBe('concluido')
  })
})

describe('cálculos de preço', () => {
  it('preço-limite garante a margem mínima', () => {
    expect(precoLimite(80, 20)).toBe(100)
    expect(precoLimite(100, 0)).toBe(100)
    expect(precoLimite(100, 100)).toBeNull()
    expect(precoLimite(null, 10)).toBeNull()
  })
  it('margem e desconto', () => {
    expect(margemSobrePreco(100, 80)).toBe(20)
    expect(descontoSobreReferencia(90, 100)).toBe(10)
    expect(descontoSobreReferencia(null, 100)).toBeNull()
  })
  it('total de itens', () => {
    expect(totalItens([{ quantidade: 2, v: 10 }, { quantidade: 3, v: null }], (i) => i.v)).toBe(20)
  })
})
