import { describe, expect, it } from 'vitest'
import { contaNoTotal, resumoProcessos, semArquivados } from './contagemProcessos'

const p = (valor_estimado: number | null, arquivado_em: string | null = null) => ({ valor_estimado, arquivado_em })

describe('contagem de processos', () => {
  it('arquivado fica fora da quantidade e do valor total', () => {
    const lista = [p(1000), p(500), p(9_000_000, '2026-11-27T10:00:00Z')]
    expect(resumoProcessos(lista)).toEqual({ quantidade: 2, total: 1500 })
  })

  it('desarquivar volta a contar', () => {
    expect(resumoProcessos([p(1000), p(200, null)])).toEqual({ quantidade: 2, total: 1200 })
  })

  it('valor vazio conta na quantidade e soma zero', () => {
    expect(resumoProcessos([p(null), p(300)])).toEqual({ quantidade: 2, total: 300 })
  })

  it('lista vazia ou só de arquivados dá zero', () => {
    expect(resumoProcessos([])).toEqual({ quantidade: 0, total: 0 })
    expect(resumoProcessos([p(10, '2026-01-01T00:00:00Z')])).toEqual({ quantidade: 0, total: 0 })
  })

  it('semArquivados e contaNoTotal', () => {
    expect(contaNoTotal(p(1))).toBe(true)
    expect(contaNoTotal(p(1, '2026-11-27T00:00:00Z'))).toBe(false)
    expect(semArquivados([p(1), p(2, 'x')])).toHaveLength(1)
  })
})
