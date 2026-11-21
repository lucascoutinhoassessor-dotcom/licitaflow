import { describe, expect, it } from 'vitest'
import { aplicarLiberacao, estadoFiltro, CATALOGO_FILTROS } from './filtrosLiberacao'
import { filtrosExtras, type FiltrosOportunidades } from './filtrosOportunidades'

const base = { ...filtrosExtras, inicio: '', fim: '', situacao: 'abertas', modalidade: '6', uf: '' } as FiltrosOportunidades

describe('liberação de filtros', () => {
  it('sem nenhum filtro cadastrado (migração não aplicada) mostra todos', () => {
    expect(estadoFiltro({ processos: 'liberado' }, 'filtro-uf')).toBe('liberado')
    expect(estadoFiltro(undefined, 'filtro-uf')).toBe('liberado')
  })
  it('filtro novo, sem cadastro, nasce oculto; em teste já chega resolvido', () => {
    const e = { 'filtro-uf': 'liberado', 'filtro-portais': 'em_breve' }
    expect(estadoFiltro(e, 'filtro-uf')).toBe('liberado')
    expect(estadoFiltro(e, 'filtro-portais')).toBe('em_breve')
    expect(estadoFiltro(e, 'filtro-orgao')).toBe('oculto')
    expect(estadoFiltro(null, 'filtro-uf')).toBe('oculto')
  })
  it('filtro não liberado volta ao padrão e não é aplicado na busca', () => {
    const f = { ...base, uf: 'SP', excluirSrp: true, minimo: '100', portais: ['comprasgov'], diasUteis: false }
    const r = aplicarLiberacao(f, { 'filtro-uf': 'oculto', 'filtro-excluir-srp': 'em_breve', 'filtro-valor-total': 'liberado', 'filtro-dias-uteis': 'oculto' })
    expect(r.uf).toBe('')
    expect(r.excluirSrp).toBe(false)
    expect(r.diasUteis).toBe(true)
    expect(r.minimo).toBe('100')
    expect(r.portais).toEqual(filtrosExtras.portais)
  })
  it('ids únicos e no formato aceito pelo banco', () => {
    const ids = CATALOGO_FILTROS.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{2,40}$/)
  })
})
