import { describe, expect, it } from 'vitest'
import { lerLimite, limiteDoPlano, textoLimite } from './agentesIA'

describe('limites dos agentes de IA', () => {
  it('interpreta o limite do plano', () => {
    expect(limiteDoPlano({ 'leitor-editais': 10 }, 'leitor-editais')).toBe(10)
    expect(limiteDoPlano({ 'leitor-editais': null }, 'leitor-editais')).toBeNull()
    expect(limiteDoPlano({}, 'leitor-editais')).toBe(0)
    expect(limiteDoPlano(null, 'radar')).toBe(0)
  })

  it('mostra e lê o limite nos formulários', () => {
    expect(textoLimite(10)).toBe('10 por mês')
    expect(textoLimite(null)).toBe('Sem limite')
    expect(textoLimite(0)).toBe('Não incluído')
    expect(textoLimite(20, 'simultaneo')).toBe('20 ao mesmo tempo')
    expect(lerLimite('')).toBeNull()
    expect(lerLimite(' 15 ')).toBe(15)
    expect(lerLimite('0')).toBe(0)
    expect(lerLimite('-1')).toBeUndefined()
    expect(lerLimite('2,5')).toBeUndefined()
  })
})
