import { describe, expect, it } from 'vitest'
import { sessaoSalva } from './sessao'

const armazenamento = (dados: Record<string, string>) => ({
  length: Object.keys(dados).length,
  key: (i: number) => Object.keys(dados)[i] ?? null,
  getItem: (k: string) => dados[k] ?? null,
})

describe('sessão salva no navegador', () => {
  it('lê a sessão do Supabase sem consultar o servidor', () => {
    const s = sessaoSalva(armazenamento({ 'lf-tema': 'dark', 'sb-abc-auth-token': JSON.stringify({ access_token: 't', user: { id: 'u1' } }) }))
    expect(s?.user.id).toBe('u1')
  })
  it('ignora dados ausentes ou corrompidos', () => {
    expect(sessaoSalva(armazenamento({}))).toBeNull()
    expect(sessaoSalva(armazenamento({ 'sb-abc-auth-token': '{quebrado' }))).toBeNull()
  })
})
