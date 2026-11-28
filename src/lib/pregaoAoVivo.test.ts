import { describe, expect, it } from 'vitest'
import { conectado, importante, juntarEventos, type EventoPav } from './pregaoAoVivo'

const ev = (id: string, quando: string, extra: Partial<EventoPav> = {}): EventoPav => ({
  id, sessao_id: 's', tipo: 'mensagem', item: null, autor: 'Pregoeiro', texto: 'x', prazo: null, cita_cliente: false, quando, created_at: quando, ...extra,
})

describe('Pregão ao Vivo', () => {
  it('computador conectado até 3 minutos depois do último sinal', () => {
    const agora = Date.parse('2026-11-27T12:00:00Z')
    expect(conectado('2026-11-27T11:58:30Z', agora)).toBe(true)
    expect(conectado('2026-11-27T11:56:00Z', agora)).toBe(false)
    expect(conectado(null, agora)).toBe(false)
  })

  it('destaca convocação, sessão, citação da empresa e mensagem do pregoeiro', () => {
    expect(importante({ tipo: 'convocacao', autor: 'Pregoeiro', cita_cliente: false, texto: '' })).toBe(true)
    expect(importante({ tipo: 'mensagem', autor: 'Pregoeiro', cita_cliente: false, texto: '' })).toBe(true)
    expect(importante({ tipo: 'lance', autor: 'Sistema', cita_cliente: false, texto: 'Item 1: melhor lance' })).toBe(false)
    expect(importante({ tipo: 'fase', autor: 'Sistema', cita_cliente: false, texto: 'Item 2: Encerramento aleatório' })).toBe(true)
    expect(importante({ tipo: 'posicao', autor: 'Sistema', cita_cliente: true, texto: '' })).toBe(true)
  })

  it('junta eventos do tempo real sem repetir e em ordem', () => {
    const a = [ev('1', '2026-11-27T10:00:00Z'), ev('2', '2026-11-27T09:00:00Z')]
    const r = juntarEventos(a, [ev('3', '2026-11-27T11:00:00Z'), ev('1', '2026-11-27T10:00:00Z')])
    expect(r.map((e) => e.id)).toEqual(['3', '1', '2'])
    expect(juntarEventos(a, [], 1)).toHaveLength(1)
  })
})
