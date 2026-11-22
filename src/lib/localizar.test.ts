import { describe, expect, it } from 'vitest'
import { editalDireto, rotaEditalDireto, validarLocalizar } from './localizar'
import { estadoRecurso, CATALOGO_RECURSOS } from './recursos'

describe('editalDireto', () => {
  it('reconhece o número de controle do PNCP', () => {
    expect(editalDireto(' 00394460000141-1-000123/2026 ')).toEqual({ cnpj: '00394460000141', seq: '123', ano: '2026' })
  })
  it('reconhece o link do edital no PNCP', () => {
    const e = editalDireto('https://pncp.gov.br/app/editais/00394460000141/2026/45?pagina=1')
    expect(e && rotaEditalDireto(e)).toBe('/app/oportunidades/00394460000141/2026/45')
  })
  it('não confunde número de compra com controle', () => {
    expect(editalDireto('90012/2026')).toBeNull()
    expect(editalDireto('00394460000141')).toBeNull()
  })
})

describe('validarLocalizar', () => {
  it('exige um número', () => {
    expect(validarLocalizar('')).toMatch(/Informe/)
    expect(validarLocalizar('pregão')).toMatch(/número/)
    expect(validarLocalizar('x'.repeat(199) + '1')).toBeNull()
    expect(validarLocalizar('1'.repeat(201))).toMatch(/200/)
    expect(validarLocalizar('UASG 160000')).toBeNull()
  })
})

describe('estadoRecurso', () => {
  it('mostra tudo enquanto nenhum recurso está cadastrado ou a consulta falhou', () => {
    expect(estadoRecurso(undefined, 'recurso-exportar-csv')).toBe('liberado')
    expect(estadoRecurso({ oportunidades: 'liberado' }, 'recurso-exportar-csv')).toBe('liberado')
  })
  it('esconde enquanto carrega e recurso novo sem cadastro', () => {
    expect(estadoRecurso(null, 'recurso-exportar-csv')).toBe('oculto')
    expect(estadoRecurso({ 'recurso-inverter-ordem': 'liberado' }, 'recurso-exportar-csv')).toBe('oculto')
  })
  it('respeita liberado, em breve e oculto', () => {
    const e = { 'recurso-a': 'liberado', 'recurso-b': 'em_breve', 'recurso-c': 'oculto', 'recurso-d': 'teste' }
    expect(estadoRecurso(e, 'recurso-a')).toBe('liberado')
    expect(estadoRecurso(e, 'recurso-b')).toBe('em_breve')
    expect(estadoRecurso(e, 'recurso-c')).toBe('oculto')
    expect(estadoRecurso(e, 'recurso-d')).toBe('oculto')
  })
  it('ids únicos e no formato aceito pelo banco', () => {
    const ids = CATALOGO_RECURSOS.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{2,40}$/)
  })
})
