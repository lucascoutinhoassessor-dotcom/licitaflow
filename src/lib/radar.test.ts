import { describe, expect, it } from 'vitest'
import { aderencia, faltam, lerPalavras, lerValor } from './radar'

describe('Radar', () => {
  it('classifica a aderência pela pontuação', () => {
    expect(aderencia(80).rotulo).toBe('Aderência alta')
    expect(aderencia(60).rotulo).toBe('Aderência média')
    expect(aderencia(25).rotulo).toBe('Aderência baixa')
  })

  it('lê a lista de palavras-chave sem repetidas', () => {
    expect(lerPalavras('papel, toner; Papel\ncartucho de tinta,  a ')).toEqual(['papel', 'toner', 'cartucho de tinta'])
  })

  it('lê valores em reais', () => {
    expect(lerValor('50.000,00')).toBe(50000)
    expect(lerValor('1500')).toBe(1500)
    expect(lerValor('')).toBeNull()
    expect(lerValor('abc')).toBeUndefined()
  })

  it('mostra quanto tempo falta para o prazo', () => {
    const agora = Date.parse('2026-11-23T12:00:00Z')
    expect(faltam('2026-11-26T13:00:00Z', agora)).toBe('Faltam 3 dias')
    expect(faltam('2026-11-24T13:00:00Z', agora)).toBe('Falta 1 dia')
    expect(faltam('2026-11-23T20:00:00Z', agora)).toBe('Encerra hoje')
  })
})
