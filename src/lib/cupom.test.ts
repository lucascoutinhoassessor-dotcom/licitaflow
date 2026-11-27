import { describe, expect, it } from 'vitest'
import { descontoCupom, linkCupom, normalizarCupom, rotuloCupomCliente, type CupomInfo } from './cupom'

const c = (x: Partial<CupomInfo>): CupomInfo => ({ codigo: 'LF10', tipo: 'percentual', valor: 10, plano: null, descricao: null, ...x })

describe('cupom', () => {
  it('normaliza o código como o banco aceita', () => {
    expect(normalizarCupom(' lf-ab 12 ')).toBe('LF-AB12')
    expect(normalizarCupom('a')).toBeNull()
    expect(normalizarCupom('lf@1')).toBeNull()
  })
  it('calcula o desconto por cobrança com piso de R$ 1,00', () => {
    expect(descontoCupom(c({}), 10000)).toBe(1000)
    expect(descontoCupom(c({ tipo: 'valor', valor: 2500 }), 10000)).toBe(2500)
    expect(descontoCupom(c({ tipo: 'percentual', valor: 100 }), 10000)).toBe(9900)
    expect(descontoCupom(c({ tipo: 'dias', valor: 30 }), 10000)).toBe(0)
    expect(descontoCupom(c({ plano: 'essencial' }), 10000, 'profissional')).toBe(0)
    expect(descontoCupom(c({ plano: 'essencial' }), 10000, 'essencial')).toBe(1000)
    expect(descontoCupom(null, 10000)).toBe(0)
  })
  it('descreve o benefício e monta o link certo para cada tipo', () => {
    expect(rotuloCupomCliente(c({ tipo: 'dias', valor: 15 }))).toBe('15 dias de acesso grátis')
    expect(rotuloCupomCliente(c({}))).toBe('10% de desconto')
    expect(linkCupom('https://x.app/', c({ tipo: 'dias' }))).toBe('https://x.app/cadastro?cupom=LF10')
    expect(linkCupom('https://x.app', c({ plano: 'essencial' }))).toBe('https://x.app/checkout?cupom=LF10&plano=essencial')
  })
})
