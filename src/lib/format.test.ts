import { describe, expect, it } from 'vitest'
import { cnpjValido, diasAte, formatarCnpj } from './format'

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
