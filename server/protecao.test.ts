import { afterEach, describe, expect, it, vi } from 'vitest'
import { emCache, excedeuLimite, guardarNoNavegador, limparProtecoes } from './protecao.js'

afterEach(() => limparProtecoes())
describe('proteções das funções do servidor', () => {
  it('deixa só o navegador do usuário guardar a resposta, separada por sessão', () => {
    const cab: Record<string, string> = {}
    guardarNoNavegador({ setHeader: (k: string, v: string) => { cab[k] = v } }, 600)
    expect(cab['Cache-Control']).toBe('private, max-age=600')
    expect(cab.Vary).toBe('Authorization')
  })
  it('reaproveita a mesma resposta dentro do prazo do cache', async () => {
    const gerar = vi.fn(async () => ({ ok: 1 }))
    await emCache('t', 'a', 60_000, gerar)
    await emCache('t', 'a', 60_000, gerar)
    await emCache('t', 'b', 60_000, gerar)
    expect(gerar).toHaveBeenCalledTimes(2)
  })
  it('bloqueia quem passa do limite de pedidos por minuto', () => {
    for (let i = 0; i < 3; i++) expect(excedeuLimite('t', 'u1', 3)).toBe(false)
    expect(excedeuLimite('t', 'u1', 3)).toBe(true)
    expect(excedeuLimite('t', 'u2', 3)).toBe(false)
  })
})
