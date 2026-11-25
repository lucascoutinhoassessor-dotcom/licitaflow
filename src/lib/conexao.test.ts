import { afterEach, describe, expect, it, vi } from 'vitest'
import { consultarComLimite } from './conexao'

afterEach(() => vi.useRealTimers())
describe('limite de conexão', () => {
  it('não fica preso nem quando o cliente está aguardando o token e ignora abort', async () => {
    vi.useFakeTimers()
    let sinal: AbortSignal
    const consulta = consultarComLimite(signal => { sinal = signal; return new Promise(() => {}) })
    const resultado = expect(consulta).rejects.toThrow('demorou demais')
    await vi.advanceTimersByTimeAsync(15000)
    await resultado
    expect(sinal!.aborted).toBe(true)
  })
  it('propaga cancelamento ao trocar de conta ou sair da página', async () => {
    const controller = new AbortController()
    const consulta = consultarComLimite(() => new Promise(() => {}), controller.signal)
    controller.abort()
    await expect(consulta).rejects.toThrow('interrompida')
  })
  it('limpa o temporizador depois de uma resposta bem sucedida', async () => {
    vi.useFakeTimers()
    await expect(consultarComLimite(() => Promise.resolve('ok'))).resolves.toBe('ok')
    expect(vi.getTimerCount()).toBe(0)
  })
})
