import { describe, expect, it } from 'vitest'
import { Radar } from 'lucide-react'
import { estadoDe, filtrarGrupos, filtrarItens, idModulo, CATALOGO_MODULOS } from './modulos'

const item = (rota: string, fase?: string) => ({ rota, rotulo: rota, icone: Radar, fase })

describe('liberação de módulos', () => {
  it('identifica o módulo pela rota', () => {
    expect(idModulo('/app/processos')).toBe('processos')
    expect(idModulo('/app/processos/123')).toBe('processos')
    expect(idModulo('/suporte')).toBe('suporte')
    expect(idModulo('/app')).toBeNull()
  })
  it('módulo novo, sem cadastro, nasce oculto', () => {
    expect(estadoDe({ processos: 'liberado' }, '/app/analise-mercado')).toBe('oculto')
  })
  it('enquanto carrega esconde o controlável; se a consulta falhar mostra tudo', () => {
    expect(estadoDe(null, '/app/processos')).toBe('oculto')
    expect(estadoDe(undefined, '/app/processos')).toBe('liberado')
  })
  it('telas essenciais da conta nunca somem', () => {
    expect(estadoDe({}, '/app/plano')).toBe('liberado')
    expect(estadoDe(null, '/suporte')).toBe('liberado')
    expect(CATALOGO_MODULOS.some((m) => ['plano', 'cobrancas', 'suporte', 'configuracoes'].includes(m.id))).toBe(false)
  })
  it('oculto sai do menu, em breve ganha selo, liberado perde o selo fixo', () => {
    const r = filtrarItens([item('/app/a'), item('/app/b'), item('/app/agentes', 'F2')], { a: 'oculto', b: 'em_breve', agentes: 'liberado' })
    expect(r.map((i) => i.rota)).toEqual(['/app/b', '/app/agentes'])
    expect(r[0].fase).toBe('em breve')
    expect(r[1].fase).toBeUndefined()
  })
  it('grupo sem nenhum módulo visível some do menu', () => {
    const g = filtrarGrupos([{ id: 'x', rotulo: 'X', icone: Radar, itens: [item('/app/a')] }], { a: 'oculto' })
    expect(g).toHaveLength(0)
  })
})
