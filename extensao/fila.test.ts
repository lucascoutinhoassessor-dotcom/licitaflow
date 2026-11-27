import { describe, expect, it } from 'vitest'
import { criarFila, enderecoItem, ESPERA_AJUDA_MS, ESPERA_MS, INTERVALO_MS } from './fila.js'

/** Efeitos falsos: guarda o que a fila pediu e deixa os relógios rodarem na mão. */
function montar() {
  const log: string[] = []
  const avisos: Record<string, unknown>[] = []
  let relogios: { id: number; ms: number; fn: () => void }[] = []
  let seq = 0
  const fila = criarFila({
    abrirAba: async (url: string) => { log.push(`abrir ${url}`); return 99 },
    irPara: (_aba: number, url: string) => log.push(`ir ${url}`),
    mostrarAba: () => log.push('mostrar'),
    fecharAba: () => log.push('fechar'),
    avisar: (_origem: number, dados: Record<string, unknown>) => avisos.push(dados),
    agendar: (ms: number, fn: () => void) => { const id = ++seq; relogios.push({ id, ms, fn }); return id },
    cancelar: (id: number) => { relogios = relogios.filter((r) => r.id !== id) },
  })
  const rodar = (ms: number) => { const r = relogios.find((x) => x.ms === ms); if (!r) throw new Error(`sem relógio de ${ms}`); relogios = relogios.filter((x) => x !== r); r.fn() }
  return { fila, log, avisos, rodar, relogios: () => relogios }
}
const item = (n: number) => ({ t: 'i', n, p: [{ c: '48943133000128', cl: 1 }] })
const ID = '15200405001792026'
const espera = () => new Promise((r) => setTimeout(r, 0))

describe('fila da extensão', () => {
  it('percorre os itens um por vez, com intervalo, e entrega tudo no fim', async () => {
    const { fila, log, avisos, rodar } = montar()
    fila.buscar(ID, [2, 1, 2], 7)
    await espera()
    expect(log).toEqual([`abrir ${enderecoItem(ID, 1)}`])
    fila.propostas(99, ID, item(1))
    rodar(INTERVALO_MS)
    expect(log.at(-1)).toBe(`ir ${enderecoItem(ID, 2)}`)
    fila.propostas(99, ID, item(2))
    expect(log.at(-1)).toBe('fechar')
    const fim = avisos.at(-1) as { tipo: string; itens: unknown[]; faltaram: number }
    expect(fim.tipo).toBe('concluido')
    expect(fim.itens).toHaveLength(2)
    expect(fim.faltaram).toBe(0)
  })

  it('ignora propostas de outra aba ou de outra compra', async () => {
    const { fila, avisos } = montar()
    fila.buscar(ID, [1], 7)
    await espera()
    fila.propostas(55, ID, item(1))
    fila.propostas(99, '99999999999999999', item(1))
    expect(avisos.some((a) => a.tipo === 'concluido')).toBe(false)
  })

  it('sem resposta, mostra a aba para a pessoa e depois pula o item', async () => {
    const { fila, log, avisos, rodar } = montar()
    fila.buscar(ID, [1, 2], 7)
    await espera()
    rodar(ESPERA_MS)
    expect(log).toContain('mostrar')
    expect(avisos.at(-1)?.tipo).toBe('ajuda')
    rodar(ESPERA_AJUDA_MS)
    rodar(INTERVALO_MS)
    expect(log.at(-1)).toBe(`ir ${enderecoItem(ID, 2)}`)
    fila.propostas(99, ID, item(2))
    expect((avisos.at(-1) as { faltaram: number }).faltaram).toBe(1)
  })

  it('uma compra por vez: a segunda espera na fila e pedido repetido não duplica', async () => {
    const { fila, avisos, log } = montar()
    fila.buscar(ID, [1], 7)
    fila.buscar('15200405001802026', [1], 8)
    fila.buscar(ID, [1], 9)
    await espera()
    expect(avisos.some((a) => a.tipo === 'fila')).toBe(true)
    expect(log.filter((l) => l.startsWith('abrir'))).toHaveLength(1)
    fila.propostas(99, ID, item(1))
    await espera()
    expect(log.filter((l) => l.startsWith('abrir'))).toHaveLength(2)
  })

  it('aba do portal fechada encerra com o que já veio', async () => {
    const { fila, avisos } = montar()
    fila.buscar(ID, [1, 2], 7)
    await espera()
    fila.propostas(99, ID, item(1))
    fila.abaFechada(99)
    const fim = avisos.at(-1) as { tipo: string; itens: unknown[] }
    expect(fim.tipo).toBe('erro')
    expect(fim.itens).toHaveLength(1)
  })
})
