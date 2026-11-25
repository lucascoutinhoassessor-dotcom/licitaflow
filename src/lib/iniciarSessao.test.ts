import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { iniciarSessao } from './iniciarSessao'

function preparar() {
  let evento: (nome: string, sessao: Session | null) => void
  let resolver: (valor: any) => void
  let rejeitar: (erro: Error) => void
  const unsubscribe = vi.fn()
  const auth = {
    onAuthStateChange: vi.fn((callback) => { evento = callback; return { data: { subscription: { unsubscribe } } } }),
    getSession: vi.fn(() => new Promise((resolve, reject) => { resolver = resolve; rejeitar = reject })),
  } as unknown as SupabaseClient['auth']
  const aplicar = vi.fn(), falhar = vi.fn()
  const parar = iniciarSessao(auth, aplicar, falhar)
  return { aplicar, falhar, parar, unsubscribe, emitir: (nome: string, s: Session | null) => evento(nome, s), resolver: (valor: any) => resolver(valor), rejeitar: () => rejeitar(new Error('Sem rede')) }
}
afterEach(() => vi.useRealTimers())

describe('restauração de acesso', () => {
  it('não interpreta INITIAL_SESSION nula por falha de renovação como logout', async () => {
    vi.useFakeTimers()
    const t = preparar()
    t.emitir('INITIAL_SESSION', null)
    t.resolver({ data: { session: null }, error: new Error('Sem rede') })
    await vi.advanceTimersByTimeAsync(1)
    expect(t.aplicar).not.toHaveBeenCalled()
    expect(t.falhar).toHaveBeenCalledTimes(1)
    t.parar()
  })
  it('não reaplica uma sessão salva depois de confirmar ausência de sessão', async () => {
    vi.useFakeTimers()
    const t = preparar()
    t.resolver({ data: { session: null }, error: null })
    await vi.advanceTimersByTimeAsync(20000)
    expect(t.aplicar).toHaveBeenCalledTimes(1)
    expect(t.aplicar).toHaveBeenCalledWith(null)
    expect(t.falhar).not.toHaveBeenCalled()
    t.parar()
  })
  it('rede indisponível oferece recuperação sem simular logout', async () => {
    vi.useFakeTimers()
    const t = preparar()
    t.rejeitar()
    await vi.advanceTimersByTimeAsync(20000)
    expect(t.aplicar).not.toHaveBeenCalled()
    expect(t.falhar).toHaveBeenCalledTimes(1)
    t.parar()
  })
  it('encerra a espera e aceita a sessão quando a renovação finalmente chega', async () => {
    vi.useFakeTimers()
    const t = preparar()
    await vi.advanceTimersByTimeAsync(15000)
    expect(t.falhar).toHaveBeenCalledTimes(1)
    const sessao = { user: { id: 'u1' }, access_token: 'novo' } as Session
    t.emitir('TOKEN_REFRESHED', sessao)
    expect(t.aplicar).toHaveBeenLastCalledWith(sessao, 'TOKEN_REFRESHED')
    t.resolver({ data: { session: null }, error: null })
    await vi.advanceTimersByTimeAsync(1)
    expect(t.aplicar).toHaveBeenCalledTimes(1)
    t.parar()
  })
  it('preserva a recuperação de senha e ignora resultados após desmontar', async () => {
    vi.useFakeTimers()
    const t = preparar()
    t.emitir('PASSWORD_RECOVERY', null)
    expect(t.aplicar).toHaveBeenCalledWith(null, 'PASSWORD_RECOVERY')
    t.parar()
    t.emitir('SIGNED_OUT', null)
    t.resolver({ data: { session: null }, error: null })
    await vi.advanceTimersByTimeAsync(20000)
    expect(t.aplicar).toHaveBeenCalledTimes(1)
    expect(t.unsubscribe).toHaveBeenCalledTimes(1)
    expect(t.falhar).not.toHaveBeenCalled()
  })
  it('erros retornados pelo SDK também não equivalem a logout', async () => {
    vi.useFakeTimers()
    const t = preparar()
    t.resolver({ data: { session: null }, error: new Error('Sem rede') })
    await vi.advanceTimersByTimeAsync(1)
    expect(t.aplicar).not.toHaveBeenCalled()
    expect(t.falhar).toHaveBeenCalledTimes(1)
    t.parar()
  })
})
