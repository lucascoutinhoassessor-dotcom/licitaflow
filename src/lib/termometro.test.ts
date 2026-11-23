import { describe, expect, it } from 'vitest'
import { alvoPeloNome, alvoPeloPncp, classificar } from './termometro'

describe('Termômetro de Pagamento', () => {
  it('classifica a nota CAPAG em selo', () => {
    expect(classificar('A+').nivel).toBe('bom')
    expect(classificar('B').nivel).toBe('regular')
    expect(classificar('D').rotulo).toBe('Risco de atraso')
    expect(classificar('n.d.').nivel).toBe('sem_nota')
    expect(classificar(null).nivel).toBe('sem_nota')
  })

  it('liga o órgão à nota pelos dados do PNCP', () => {
    expect(alvoPeloPncp('M', '4304705', 'RS')).toEqual({ tipo: 'chave', chave: 'M:4304705' })
    expect(alvoPeloPncp('E', '3550308', 'SP')).toEqual({ tipo: 'chave', chave: 'E:SP' })
    expect(alvoPeloPncp('F', null, 'DF')).toEqual({ tipo: 'federal' })
    expect(alvoPeloPncp('N', null, 'SP')).toBeNull()
  })

  it('sem esfera, liga pelo nome do órgão', () => {
    expect(alvoPeloNome('MUNICIPIO DE CARAZINHO', 'RS', 'Carazinho')).toEqual({ tipo: 'municipio', uf: 'RS', nome: 'carazinho' })
    expect(alvoPeloNome('Prefeitura Municipal de São João', 'MG', 'São João del-Rei')).toEqual({ tipo: 'municipio', uf: 'MG', nome: 'sao joao del-rei' })
    expect(alvoPeloNome('SECRETARIA DE ESTADO DA SAUDE', 'SP', 'São Paulo')).toEqual({ tipo: 'chave', chave: 'E:SP' })
    expect(alvoPeloNome('UNIVERSIDADE FEDERAL DE MINAS GERAIS', 'MG', 'Belo Horizonte')).toEqual({ tipo: 'federal' })
    expect(alvoPeloNome('Companhia de Saneamento', 'SP', 'São Paulo')).toBeNull()
    expect(alvoPeloNome('SECRETARIA DE ESTADO DE SAUDE DO DISTRITO FEDERAL', 'DF', 'Brasília')).toEqual({ tipo: 'chave', chave: 'E:DF' })
  })
})
