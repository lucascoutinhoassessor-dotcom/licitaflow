import { describe, expect, it } from 'vitest'
import { potenciaisDoHistorico, termoDoItem } from './potenciaisItem'
import type { CompraPreco } from './precos'

const compra = (dados: Partial<CompraPreco> = {}): CompraPreco => ({
  data: '2026-10-01', preco: 20, quantidade: 10, unidade: 'UN', descricao: 'Produto', fornecedor: 'Empresa A',
  cnpj: '12.345.678/0001-90', marca: 'Marca A', orgao: 'Órgão', uasg: null, uf: 'SP', municipio: null,
  modalidade: 5, idCompra: '12345605000012026', numeroItem: 1, objeto: null, detalhe: null, dataCompra: null, unidadeCompradora: null,
  ...dados,
})

describe('potenciais concorrentes e marcas por item', () => {
  it('deduplica CNPJ, marca e evidência sem misturar itens distintos da mesma compra', () => {
    const dados = potenciaisDoHistorico([
      compra(), compra({ cnpj: '12345678000190', marca: ' marca a ' }), compra({ numeroItem: 2, marca: 'Marca B' }),
    ])
    expect(dados.empresas).toHaveLength(1)
    expect(dados.empresas[0].fontes).toHaveLength(2)
    expect([...dados.empresas[0].marcas]).toEqual(['MARCA A', 'MARCA B'])
    expect(dados.marcas).toHaveLength(2)
    expect(dados.marcas[0].fontes).toHaveLength(1)
  })

  it('considera propostas classificadas e exclui recusas, desclassificações e inabilitações', () => {
    const proposta = { colocacao: 2, fornecedor: 'Empresa B', cnpj: '98765432000110', marca: 'Marca B', modelo: null, preco: 30, precoInicial: null, motivo: null }
    const dados = potenciaisDoHistorico([compra({ propostas: [
      { ...proposta, situacao: 'classificada' },
      ...(['recusa', 'desclassificacao', 'inabilitacao', 'participou'] as const).map((situacao) => ({ ...proposta, cnpj: '11111111000111', marca: 'Não elegível', situacao })),
    ] })])
    expect(dados.empresas.map((e) => e.cnpj)).toEqual(['12345678000190', '98765432000110'])
    expect(dados.marcas.map((m) => m.nome)).toEqual(['Marca A', 'Marca B'])
  })

  it('omite marcas genéricas e empresas sem CNPJ e mantém a marca identificável', () => {
    const dados = potenciaisDoHistorico([
      ...['Não informada', 'PRÓPRIA', 'MARCA PRÓPRIA', 'Genérica', 'null', '-', 'N/A', ''].map((marca) => compra({ cnpj: null, marca })),
      compra({ cnpj: '123', marca: 'Fabricante conhecido' }),
    ])
    expect(dados.empresas).toEqual([])
    expect(dados.marcas.map((m) => m.nome)).toEqual(['Fabricante conhecido'])
  })

  it('ordena empresas e marcas pela quantidade de referências e suporta histórico vazio', () => {
    const dados = potenciaisDoHistorico([compra(), compra({ cnpj: '98765432000110', marca: 'Marca B' }), compra({ idCompra: 'outra', cnpj: '98765432000110', marca: 'Marca B' })])
    expect(dados.empresas[0].cnpj).toBe('98765432000110')
    expect(dados.marcas[0].nome).toBe('Marca B')
    expect(potenciaisDoHistorico([])).toEqual({ empresas: [], marcas: [] })
  })

  it('extrai o produto da descrição sem o prefixo do lote ou detalhes técnicos', () => {
    expect(termoDoItem('LOTE 01 - Papel A4: gramatura 75g')).toBe('Papel A4')
    expect(termoDoItem('Grupo nº 2: Monitor; 24 polegadas')).toBe('Monitor')
    expect(termoDoItem()).toBe('')
  })
})
