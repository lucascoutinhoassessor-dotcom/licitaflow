import { describe, expect, it } from 'vitest'
import { diaBrasilia, filtrosResumoHoje, termosPerfil } from './resumoEditais'
describe('atalhos do panorama no painel', () => {
  const filtros = (extra = '') => filtrosResumoHoje(new URLSearchParams(`publicadas=hoje&${extra}`), '2026-11-26')!
  it('usa a data de Brasília na virada do dia', () => {
    expect(diaBrasilia(new Date('2026-11-27T01:30:00Z'))).toBe('2026-11-26')
  })
  it('pesquisa as publicações do dia sem limitar a data da sessão', () => {
    expect(filtros()).toMatchObject({ inicio: '2026-11-26', fim: '2026-11-26', situacao: 'publicacoes', aberturaDe: '', aberturaAte: '', diasUteis: false })
    expect(filtrosResumoHoje(new URLSearchParams('tipo=servicos'), '2026-11-26')).toBeNull()
  })
  it('abre materiais e serviços com o tipo correto', () => {
    expect(filtros('tipo=materiais').tipoItem).toBe('M')
    expect(filtros('tipo=servicos').tipoItem).toBe('S')
    expect(filtros('tipo=invalido').tipoItem).toBe('')
  })
  it('mantém os limites das faixas de valor sem sobreposição', () => {
    expect(filtros('faixa=ate50mil')).toMatchObject({ minimo: '', maximo: '50000' })
    expect(filtros('faixa=ate250mil')).toMatchObject({ minimo: '50000.01', maximo: '250000' })
    expect(filtros('faixa=acima250mil')).toMatchObject({ minimo: '250000.01', maximo: '' })
    expect(filtros('faixa=invalida')).toMatchObject({ minimo: '', maximo: '' })
  })
})
describe('atalhos por estado e por perfil', () => {
  const filtros = (extra = '') => filtrosResumoHoje(new URLSearchParams(`publicadas=hoje&${extra}`), '2026-11-26')!
  it('filtra por um estado válido e ignora o resto', () => {
    expect(filtros('uf=SP')).toMatchObject({ uf: 'SP', ufs: ['SP'] })
    expect(filtros('uf=sp')).toMatchObject({ uf: '', ufs: [] })
  })
  it('leva as palavras-chave da empresa para a busca', () => {
    expect(filtros('busca=limpeza%3Bpneus').busca).toBe('limpeza;pneus')
    expect(filtros()).not.toHaveProperty('busca')
  })
  it('monta os termos do perfil sem estourar o limite da busca', () => {
    expect(termosPerfil(['limpeza', ' pneus ', '', 'a;b'])).toBe('limpeza;pneus;a b')
    expect(termosPerfil(undefined)).toBe('')
    expect(termosPerfil(Array.from({ length: 20 }, (_, i) => `termo${i}`)).split(';')).toHaveLength(10)
    expect(termosPerfil(['x'.repeat(200), 'y'.repeat(200)])).toBe('x'.repeat(200))
  })
})
