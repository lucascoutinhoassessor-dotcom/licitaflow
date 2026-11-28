import { describe, expect, it } from 'vitest'
import { dataPCP, lerPaginaPCP } from './pcp-iminencia.js'
import { PAGINA_PCP } from './pcp-iminencia.fixture'

describe('iminência de deserto do PCP', () => {
  it('lê número, situação, objeto, abertura, modalidade, comprador, UF e link de cada processo', () => {
    const r = lerPaginaPCP(PAGINA_PCP)
    expect(r.paginas).toBe(16)
    expect(r.total).toBe(192)
    expect(r.processos).toHaveLength(2)
    expect(r.processos[0]).toEqual({
      numero: 'DE43/2026', situacao: 'Recebendo propostas', objeto: 'CONTRATAÇÃO DE EMPRESA PARA MONTAGEM DE GALPÃO & ESTRUTURA',
      abertura: '2026-12-03T11:00:00.000Z', modalidade: 'Dispensa', comprador: 'Prefeitura Municipal de São Cristóvão do Sul', uf: 'SC',
      link: 'https://www.portaldecompraspublicas.com.br/processos/sc/prefeitura-municipal-de-sao-cristovao-do-sul-4291/de-de43-2026-2026-528691',
    })
    expect(r.processos[1]).toMatchObject({ numero: '12/2026', situacao: 'Cancelado', uf: 'RS' })
  })
  it('converte a data do PCP (horário de Brasília)', () => {
    expect(dataPCP('03/12/2026 às 08:00')).toBe('2026-12-03T11:00:00.000Z')
    expect(dataPCP('sem data')).toBeNull()
  })
})
