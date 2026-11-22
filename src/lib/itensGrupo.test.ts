import { describe, expect, it } from 'vitest'
import { agruparItens, comGrupos, grupoNoTexto, identificacaoGrupo } from './itensEdital'
import type { ItemCompra } from './filtrosOportunidades'

const item = (n: number, extra: Partial<ItemCompra> = {}): ItemCompra => ({ numeroItem: n, valorUnitarioEstimado: 1, ...extra })

describe('lote e grupo dos itens', () => {
  it('lê o lote/grupo escrito no começo da descrição ou na informação complementar', () => {
    expect(grupoNoTexto({ descricao: 'LOTE 01 - Arroz tipo 1' }, 'lote')).toBe('1')
    expect(grupoNoTexto({ descricao: 'Grupo nº 3: cadeiras' }, 'grupo')).toBe('3')
    expect(grupoNoTexto({ descricao: 'Feijão', informacaoComplementar: 'Lote: 2' }, 'lote')).toBe('2')
  })
  it('não confunde lote de fabricação nem valores', () => {
    expect(grupoNoTexto({ descricao: 'Vacina com lote de fabricação 12345 e validade' }, 'lote')).toBeNull()
    expect(grupoNoTexto({ descricao: 'Cimento LOTE 1,5 kg' }, 'lote')).toBeNull()
  })
  it('grupo 0 do Compras.gov conta como sem grupo e o grupo oficial vence o texto', () => {
    expect(identificacaoGrupo(item(1, { numeroGrupo: 0 }), 'grupo')).toBeNull()
    const itens = comGrupos([item(1, { descricao: 'GRUPO 9 - x' }), item(2)], { 1: 4, 2: 4 })
    expect(itens.map((i) => identificacaoGrupo(i, 'grupo'))).toEqual(['4', '4'])
    expect([...agruparItens(itens, 'grupo').keys()]).toEqual(['Grupo 4'])
  })
})
