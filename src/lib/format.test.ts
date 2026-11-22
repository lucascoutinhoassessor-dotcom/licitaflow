import { describe, expect, it } from 'vitest'
import { cnpjValido, diasAte, formatarCnpj, prazoRelativo, tempoRestante } from './format'

describe('CNPJ', () => {
  it('valida dígitos verificadores', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true)
    expect(cnpjValido('11222333000181')).toBe(true)
    expect(cnpjValido('11222333000180')).toBe(false)
    expect(cnpjValido('00000000000000')).toBe(false)
    expect(cnpjValido('123')).toBe(false)
  })

  it('formata com máscara', () => {
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81')
    expect(formatarCnpj('1122')).toBe('11.22')
  })
})

describe('diasAte', () => {
  const hoje = new Date(2026, 10, 13, 15, 0)
  it('conta dias de calendário', () => {
    expect(diasAte('2026-11-13', hoje)).toBe(0)
    expect(diasAte('2026-11-16', hoje)).toBe(3)
    expect(diasAte('2026-11-10', hoje)).toBe(-3)
  })
})

describe('prazo relativo', () => {
  it('conta dias pelo calendário, não por 24 horas', () => {
    const agora = new Date(2026, 10, 20, 9, 0)
    expect(prazoRelativo(new Date(2026, 10, 20, 23, 59).toISOString(), agora)).toBe('hoje')
    expect(prazoRelativo(new Date(2026, 10, 21, 8, 0).toISOString(), agora)).toBe('amanhã')
    expect(prazoRelativo(new Date(2026, 11, 2, 10, 0).toISOString(), agora)).toBe('em 12 dias')
    expect(prazoRelativo(new Date(2026, 10, 19).toISOString(), agora)).toBe('encerrado')
    expect(prazoRelativo(null, agora)).toBe('')
  })
})

describe('tempoRestante', () => {
  const agora = new Date(2026, 10, 21, 10, 0, 30)
  it('separa dias, horas e minutos', () => {
    expect(tempoRestante(new Date(2026, 10, 24, 14, 15).toISOString(), agora)).toEqual({ dias: 3, horas: 4, minutos: 15 })
    expect(tempoRestante(new Date(2026, 10, 21, 10, 0, 45).toISOString(), agora)).toEqual({ dias: 0, horas: 0, minutos: 1 })
    expect(tempoRestante(new Date(2026, 10, 22, 10, 0, 30).toISOString(), agora)).toEqual({ dias: 1, horas: 0, minutos: 0 })
  })
  it('é nulo depois do início ou sem data', () => {
    expect(tempoRestante(new Date(2026, 10, 21, 10, 0).toISOString(), agora)).toBeNull()
    expect(tempoRestante(null, agora)).toBeNull()
    expect(tempoRestante('x', agora)).toBeNull()
  })
})
