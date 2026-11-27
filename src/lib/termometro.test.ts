import { describe, expect, it } from 'vitest'
import { alvoPeloNome, alvoPeloPncp, classificar, classificarFederal, medirFederal, posicaoFederal } from './termometro'

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
    expect(alvoPeloPncp('F', null, 'BA', '158129')).toEqual({ tipo: 'federal', ug: '158129' })
    expect(alvoPeloPncp('F', null, 'BA', '12')).toEqual({ tipo: 'federal' })
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

  describe('federal', () => {
    const d = (o: Partial<Record<string, number>>) => ({ n: 0, soma_dias: 0, ate5: 0, ate15: 0, ate30: 0, acima30: 0, nc: 0, soma_c: 0, c60: 0, ...o })
    it('usa a UG; com poucos pagamentos, o órgão; sem nenhum, sem selo', () => {
      expect(medirFederal({ dados: d({ n: 20, soma_dias: 80 }), dados_orgao: null })).toMatchObject({ base: 'ug', media: 4 })
      expect(medirFederal({ dados: d({ n: 3, soma_dias: 3 }), dados_orgao: d({ n: 50, soma_dias: 500 }) })).toMatchObject({ base: 'orgao', media: 10 })
      expect(medirFederal({ dados: null, dados_orgao: d({ n: 2 }) })).toBeNull()
      expect(classificarFederal(null).rotulo).toBe('Poucos pagamentos medidos')
    })
    it('classifica pelos prazos', () => {
      const m = (o: Partial<Record<string, number>>) => classificarFederal(medirFederal({ dados: d({ n: 100, ...o }), dados_orgao: null }))
      expect(m({ soma_dias: 400, ate5: 90, ate15: 10 }).nivel).toBe('bom')
      expect(m({ soma_dias: 1000, ate15: 100 }).nivel).toBe('regular')
      expect(m({ soma_dias: 1600 }).nivel).toBe('risco')
      expect(m({ soma_dias: 400, acima30: 10 }).nivel).toBe('risco')
      // Rápido depois da liquidação, mas o serviço demora a ser atestado: pesa no selo.
      expect(m({ soma_dias: 400, nc: 20, soma_c: 20 * 50 }).nivel).toBe('risco')
      expect(m({ soma_dias: 400, nc: 20, soma_c: 20 * 35 }).nivel).toBe('regular')
      expect(m({ soma_dias: 400, nc: 5, soma_c: 5 * 90 }).nivel).toBe('bom') // poucos com mês do serviço: não conta
      expect(m({ soma_dias: 400 }).texto).toContain('Em média 4 dias')
    })
    it('mostra a posição', () => {
      expect(posicaoFederal('20261119')).toBe('19/11/2026')
      expect(posicaoFederal(null)).toBeNull()
    })
  })
})
