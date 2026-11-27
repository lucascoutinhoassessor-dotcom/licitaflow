import { describe, expect, it } from 'vitest'
import { bandeira, cartaoValido, documentoValido, lerValidade, mascaraCartao, mascaraDocumento, mascaraTelefone, precoCiclo } from './checkout'

describe('checkout: preços por ciclo vindos do master', () => {
  const essencial = { mensal_centavos: 39700, anual_centavos: 404940 }
  it('mensal cobra a mensalidade do catálogo', () => {
    expect(precoCiclo(essencial, 'mensal')).toMatchObject({ cobrado: 39700, porMes: 39700, economia: 0 })
  })
  it('anual cobra o valor anual e mostra a economia sobre 12 meses', () => {
    const p = precoCiclo(essencial, 'anual')
    expect(p.cobrado).toBe(404940)
    expect(p.porMes).toBe(33745)
    expect(p.economia).toBe(39700 * 12 - 404940)
    expect(p.economiaPct).toBe(15)
  })
  it('sem valor anual cadastrado, o anual vale 12 mensalidades', () => {
    expect(precoCiclo({ mensal_centavos: 10000, anual_centavos: 0 }, 'anual')).toMatchObject({ cobrado: 120000, economia: 0, temAnual: false })
  })
})

describe('checkout: validações e máscaras', () => {
  it('valida CPF e CNPJ pelos dígitos verificadores', () => {
    expect(documentoValido('529.982.247-25')).toBe(true)
    expect(documentoValido('111.111.111-11')).toBe(false)
    expect(documentoValido('11.222.333/0001-81')).toBe(true)
    expect(documentoValido('11.222.333/0001-80')).toBe(false)
  })
  it('formata documento e telefone enquanto digita', () => {
    expect(mascaraDocumento('52998224725')).toBe('529.982.247-25')
    expect(mascaraDocumento('11222333000181')).toBe('11.222.333/0001-81')
    expect(mascaraTelefone('11987654321')).toBe('(11) 98765-4321')
  })
  it('reconhece bandeira e confere o número pelo Luhn', () => {
    expect(bandeira('4111111111111111')).toBe('visa')
    expect(bandeira('5555555555554444')).toBe('mastercard')
    expect(bandeira('378282246310005')).toBe('amex')
    expect(bandeira('6362970000457013')).toBe('elo')
    expect(cartaoValido('4111 1111 1111 1111')).toBe(true)
    expect(cartaoValido('4111 1111 1111 1112')).toBe(false)
    expect(mascaraCartao('4111111111111111')).toBe('4111 1111 1111 1111')
  })
  it('validade vencida ou mês inválido é recusada', () => {
    const hoje = new Date(2026, 10, 27)
    expect(lerValidade('12/29', hoje)).toEqual({ mes: '12', ano: '2029' })
    expect(lerValidade('10/26', hoje)).toBeNull()
    expect(lerValidade('13/30', hoje)).toBeNull()
  })
})
