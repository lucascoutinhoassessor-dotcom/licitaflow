import { describe, expect, it } from 'vitest'
import { corDoEstado, detalheDoEstado, haQuanto, visivelNoCartao } from './agentesProcesso'

describe('estado dos agentes no cartão do processo', () => {
  const agora = Date.parse('2026-11-22T12:00:00Z')

  it('mostra no cartão só o que está trabalhando ou com problema', () => {
    expect(visivelNoCartao({ estado: 'ativo', motivo: '' })).toBe(true)
    expect(visivelNoCartao({ estado: 'parado', motivo: '' })).toBe(true)
    expect(visivelNoCartao({ estado: 'desligado', motivo: '' })).toBe(false)
    expect(visivelNoCartao({ estado: 'indisponivel', motivo: '' })).toBe(false)
    expect(visivelNoCartao(undefined)).toBe(false)
  })

  it('cores: verde trabalhando, azul na fila, âmbar com problema', () => {
    expect(corDoEstado('ativo')).toBe('verde')
    expect(corDoEstado('na_fila')).toBe('azul')
    expect(corDoEstado('parado')).toBe('ambar')
    expect(corDoEstado('falha')).toBe('ambar')
  })

  it('explica há quanto tempo foi a última verificação', () => {
    expect(haQuanto('2026-11-22T11:55:00Z', agora)).toBe('há 5 min')
    expect(haQuanto('2026-11-22T09:00:00Z', agora)).toBe('há 3 h')
    expect(haQuanto('2026-11-20T12:00:00Z', agora)).toBe('há 2 dias')
    expect(detalheDoEstado({ estado: 'ativo', motivo: 'Monitorando no PNCP', verificado_em: '2026-11-22T11:50:00Z' }, agora)).toBe('Monitorando no PNCP · verificado há 10 min')
    expect(detalheDoEstado({ estado: 'parado', motivo: 'O seu plano não inclui a Sentinela' }, agora)).toBe('O seu plano não inclui a Sentinela')
  })
})
