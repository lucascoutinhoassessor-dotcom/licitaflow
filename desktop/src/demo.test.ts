import { describe, expect, it } from 'vitest'
import d from './demo.cjs'

describe('demonstração da máquina', () => {
  it('concorrente cobre quem está em 1º, a máquina retoma e a disputa encerra', () => {
    let relogio = 0
    const eventos: string[] = []
    const demo = d.criarDemo({ aoEvento: (e: { texto: string }) => eventos.push(e.texto), aleatorio: () => 0.1, agora: () => relogio })
    demo.iniciar()
    const item1 = () => demo.ctx.estado.get('DEMO|1')
    expect(item1()).toMatchObject({ fase: 'Em disputa aberta', posicao: 3 })
    demo.aplicarLance('1', 185)
    expect(item1()).toMatchObject({ melhor: 185, meu: 185, posicao: 1 })
    demo.tique()
    expect(item1().posicao).toBe(2)
    expect(item1().melhor).toBeLessThan(185)
    relogio = 120_000; demo.tique()
    expect(item1().fase).toBe('Encerramento aleatório')
    relogio = 200_000; demo.tique()
    expect(item1().fase).toBe('Encerrado')
    demo.aplicarLance('1', 100)
    expect(item1().meu).not.toBe(100)
    expect(eventos.some((t) => t.includes('concorrente cobriu'))).toBe(true)
  })
})
