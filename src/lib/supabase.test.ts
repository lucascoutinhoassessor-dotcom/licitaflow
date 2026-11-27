import { describe, expect, it } from 'vitest'
import { mensagemErro } from './supabase'

describe('mensagens de erro do Supabase', () => {
  it('traduz os erros conhecidos', () => {
    expect(mensagemErro({ message: 'Invalid login credentials' })).toBe('E-mail ou senha incorretos.')
    expect(mensagemErro({ message: 'Failed to fetch' })).toBe('Falha de conexão. Verifique sua internet.')
  })

  it('servidor lento ou fora do ar não aparece como "{}"', () => {
    const lento = 'O servidor está demorando para responder. Tente de novo em instantes.'
    expect(mensagemErro({ name: 'AuthRetryableFetchError', message: '{}', status: 504 })).toBe(lento)
    expect(mensagemErro({ message: '{}' })).toBe(lento)
    expect(mensagemErro({ message: '' })).toBe(lento)
    expect(mensagemErro({ message: 'Erro qualquer', status: 503 })).toBe(lento)
  })

  it('mantém as demais mensagens como vieram', () => {
    expect(mensagemErro({ message: 'CNPJ inválido' })).toBe('CNPJ inválido')
  })
})
