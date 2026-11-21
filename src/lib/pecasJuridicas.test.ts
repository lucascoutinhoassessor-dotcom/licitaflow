import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn(), auth: { getSession: vi.fn() } } }))
const { filtrosParaBanco, rotuloPapel, textoDoModelo } = await import('./pecasJuridicas')
type Peca = Parameters<typeof textoDoModelo>[0]

const peca: Peca = {
  id: 1, tipo: 'recurso', papel: 'pedido', titulo: 'Recurso', empresa: 'AIR LIQUIDE BRASIL LTDA', item: 'Lote 1',
  arquivoUrl: null, trecho: null, data: '2026-08-17T22:16:30Z',
  processo: { codigo: 495520, orgao: 'Fundação Hospitalar de Varginha', municipio: 'Varginha', uf: 'MG', modalidade: 'Concorrência', numero: '4/2026', objeto: 'Gases', lei14133: true, sessao: '2026-07-29', url: null },
}

describe('peças publicadas no cliente', () => {
  it('limpa os filtros e recusa pesquisa sem tipo ou longa demais', () => {
    expect(filtrosParaBanco({ busca: '  atestado ', tipos: ['recurso'], uf: 'mg', orgao: ' varginha ', novaLei: true }))
      .toEqual({ busca: 'atestado', tipos: ['recurso'], uf: 'MG', orgao: 'varginha', novaLei: true })
    expect(() => filtrosParaBanco({ busca: '', tipos: [], uf: '', orgao: '', novaLei: false })).toThrow('tipo de peça')
    expect(() => filtrosParaBanco({ busca: 'x'.repeat(301), tipos: ['recurso'], uf: '', orgao: '', novaLei: false })).toThrow('300')
  })

  it('distingue a peça da empresa da resposta do órgão', () => {
    expect(rotuloPapel({ tipo: 'recurso', papel: 'pedido' })).toBe('Peça da empresa')
    expect(rotuloPapel({ tipo: 'esclarecimento', papel: 'pedido' })).toBe('Pergunta da empresa')
    expect(rotuloPapel({ tipo: 'esclarecimento', papel: 'resposta' })).toBe('Resposta do órgão')
    expect(rotuloPapel({ tipo: 'impugnacao', papel: 'resposta' })).toBe('Decisão do órgão')
  })

  it('o modelo leva a referência de origem e o aviso de trocar os dados', () => {
    const t = textoDoModelo(peca, '  AO ILMO. SENHOR AGENTE DE CONTRATAÇÃO\n\nRazões...  ')
    expect(t.startsWith('[MODELO DE REFERÊNCIA: Recurso de AIR LIQUIDE BRASIL LTDA (Concorrência · nº 4/2026 · Fundação Hospitalar de Varginha · MG).')).toBe(true)
    expect(t.endsWith('AO ILMO. SENHOR AGENTE DE CONTRATAÇÃO\n\nRazões...')).toBe(true)
  })
})
