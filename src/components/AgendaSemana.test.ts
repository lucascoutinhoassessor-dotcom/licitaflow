import { describe, expect, it } from 'vitest'
import { eventosAgenda } from './AgendaSemana'
import type { Prazo, Processo } from '@/types/db'

const prazo = (p: Partial<Prazo>) => ({ id: 'p', org_id: 'o', empresa_id: null, processo_id: null, contrato_id: null, tipo: 'proposta', titulo: 'Enviar proposta', data_hora: '2026-11-27T13:00:00Z', concluido: false, concluido_em: null, responsavel_id: null, created_at: '', ...p }) as Prazo
const processo = (p: Partial<Processo>) => ({ id: 'pr', numero: '90001/2026', objeto: 'Pneus', data_abertura: '2026-11-28T12:00:00Z', arquivado_em: null, ...p }) as Processo

describe('agenda do painel', () => {
  it('junta prazos e sessões em ordem e leva ao processo', () => {
    const ev = eventosAgenda([prazo({ id: 'a', processo_id: 'x' })], [processo({ id: 'pr1', data_abertura: '2026-11-26T12:00:00Z' })])
    expect(ev.map(e => e.id)).toEqual(['s-pr1', 'p-a'])
    expect(ev[0]).toMatchObject({ sessao: true, rotulo: 'Sessão pública', link: '/app/processos/pr1', titulo: '90001/2026 · Pneus' })
    expect(ev[1].link).toBe('/app/processos/x')
  })
  it('não repete a sessão quando já existe um prazo de sessão do processo', () => {
    const ev = eventosAgenda([prazo({ id: 'a', tipo: 'sessao', processo_id: 'pr1' })], [processo({ id: 'pr1' })])
    expect(ev).toHaveLength(1)
  })
  it('ignora processos sem data, arquivados e datas inválidas', () => {
    expect(eventosAgenda([prazo({ data_hora: 'x' })], [processo({ data_abertura: null }), processo({ id: 'b', arquivado_em: '2026-01-01' })])).toEqual([])
  })
})
