import { describe, expect, it } from 'vitest'
import { filtrarIminencia, grupoModalidade, type ProcessoIminencia } from './iminencia'

const p = (o: Partial<ProcessoIminencia>): ProcessoIminencia => ({ numero: '1/2026', situacao: 'Recebendo propostas', objeto: '', abertura: null, modalidade: 'Pregão', comprador: '', uf: 'SP', link: `https://x/${Math.random()}`, ...o })

describe('processos sem propostas do PCP', () => {
  const lista = [
    p({ objeto: 'Aquisição de hidrômetros', uf: 'SP', modalidade: 'Dispensa' }),
    p({ objeto: 'Aquisição de pneus para a frota', uf: 'MG', modalidade: 'Pregão para Registro de Preço' }),
    p({ objeto: 'Reforma da escola', uf: 'MG', modalidade: 'Concorrência', comprador: 'Prefeitura de Uberaba' }),
  ]
  it('filtra por palavras (sem acento, ";" como alternativa), UF e grupo de modalidade', () => {
    expect(filtrarIminencia(lista, { busca: 'hidrometro', uf: '', modalidade: '' })).toHaveLength(1)
    expect(filtrarIminencia(lista, { busca: 'pneus; hidrometros', uf: '', modalidade: '' })).toHaveLength(2)
    expect(filtrarIminencia(lista, { busca: 'uberaba', uf: 'MG', modalidade: '' })).toHaveLength(1)
    expect(filtrarIminencia(lista, { busca: '', uf: 'MG', modalidade: 'Pregão' })).toHaveLength(1)
  })
  it('junta pregão com e sem registro de preço', () => {
    expect(grupoModalidade('Pregão para Registro de Preço')).toBe('Pregão')
    expect(grupoModalidade('RCE-Regime de Contratação Estatal')).toBe('Outras')
  })
})
