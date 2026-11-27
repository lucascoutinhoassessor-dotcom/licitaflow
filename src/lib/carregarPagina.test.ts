import { describe, expect, it, vi } from 'vitest'
import { comTentativas } from './carregarPagina'
import { emOperacaoCritica, iniciarOperacaoCritica } from './operacaoCritica'

describe('comTentativas', () => {
  it('repete o download até dar certo', async () => {
    let n = 0
    const carregar = vi.fn(async () => { if (++n < 3) throw new Error('Failed to fetch dynamically imported module'); return 'ok' })
    await expect(comTentativas(carregar, [1, 1, 1])).resolves.toBe('ok')
    expect(carregar).toHaveBeenCalledTimes(3)
  })

  it('desiste depois das tentativas e devolve o erro', async () => {
    const carregar = vi.fn(async () => { throw new Error('falhou') })
    await expect(comTentativas(carregar, [1, 1])).rejects.toThrow('falhou')
    expect(carregar).toHaveBeenCalledTimes(3)
  })
})

describe('operação crítica', () => {
  it('fica ativa até a última operação terminar', () => {
    expect(emOperacaoCritica()).toBe(false)
    const a = iniciarOperacaoCritica('disputa')
    const b = iniciarOperacaoCritica('pagamento')
    a()
    expect(emOperacaoCritica()).toBe(true)
    b()
    expect(emOperacaoCritica()).toBe(false)
  })
})
