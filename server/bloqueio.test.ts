import { describe, expect, it } from 'vitest'
import { cnpjBloqueado } from './bloqueio.js'
import { linhaDeCompra } from './precos.js'
import { montarCompra } from './compra.js'

describe('empresas bloqueadas', () => {
  it('reconhece o CNPJ com ou sem pontuação', () => {
    expect(cnpjBloqueado('34.477.874/0001-56')).toBe(true)
    expect(cnpjBloqueado('34477874000156')).toBe(true)
    expect(cnpjBloqueado('11222333000144')).toBe(false)
    expect(cnpjBloqueado(null)).toBe(false)
  })
  it('esconde o fornecedor nos preços e nos resultados da compra', () => {
    const l = linhaDeCompra({ precoUnitario: 10, niFornecedor: '34477874000156', nomeFornecedor: 'X' })
    expect(l.cnpj).toBeNull(); expect(l.fornecedor).toBeNull(); expect(l.preco).toBe(10)
    const c = montarCompra({}, [{ numeroItemPncp: 1 }], [{ numeroItemPncp: 1, niFornecedor: '34477874000156', nomeRazaoSocialFornecedor: 'X' }], {})
    expect(c.itens[0].resultados).toEqual([])
  })
})
