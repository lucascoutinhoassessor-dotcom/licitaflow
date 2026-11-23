import { describe, expect, it } from 'vitest'
import { escolherEstatistica, itemDoEdital, planilhaProposta, sugerirPreco, termoDeBusca, unidadeCurta } from './cotador'

describe('Cotador', () => {
  it('normaliza as unidades para comparar', () => {
    expect(unidadeCurta('UNIDADE (UN)')).toBe('UN')
    expect(unidadeCurta('METRO (METRO)')).toBe('M')
    expect(unidadeCurta('Caixa')).toBe('CX')
    expect(unidadeCurta('Resma')).toBe('RESMA')
    expect(unidadeCurta(null)).toBe('')
  })

  it('tira da descrição o termo para procurar no catálogo', () => {
    expect(termoDeBusca('CONECTOR UNIVERSAL DE ALUMÍNIO 10-1/10 AWG, COM 1 PARAFUSO')).toBe('conector universal aluminio')
    expect(termoDeBusca('Aquisição de papel A4, 75g, branco')).toBe('papel')
    expect(termoDeBusca('FIO COBRE SÓLIDO ISOLADO 1,5MM2')).toBe('fio cobre solido')
  })

  it('converte o item do edital em item do processo', () => {
    expect(itemDoEdital({ numeroItem: 3, descricao: 'Fio  cobre\n1,5mm', quantidade: 1000, unidadeMedida: 'METRO (METRO)', valorUnitarioEstimado: 2.5, materialOuServico: 'M', numeroGrupo: 0 }))
      .toMatchObject({ numero_item: 3, lote: null, descricao: 'Fio cobre 1,5mm', unidade: 'M', quantidade: 1000, valor_ref_unit: 2.5, origem: 'edital', catalogo_tipo: 'M' })
    expect(itemDoEdital({ numeroItem: 1, valorUnitarioEstimado: 10, orcamentoSigiloso: true }).valor_ref_unit).toBeNull()
  })

  it('usa o preço de mercado na mesma unidade do item, ou avisa que a unidade é outra', () => {
    const u = [{ unidade: 'CX', n: 50, minimo: 1, maximo: 9, media: 5, mediana: 5 }, { unidade: 'UNIDADE', n: 10, minimo: 1, maximo: 3, media: 2, mediana: 2 }]
    expect(escolherEstatistica(u, 'UN')).toMatchObject({ unidade: 'UNIDADE', mediana: 2, outra_unidade: false })
    expect(escolherEstatistica(u, 'KG')).toMatchObject({ unidade: 'CX', outra_unidade: true })
    expect(escolherEstatistica([], 'UN')).toBeNull()
  })

  it('sugere o preço e diz se o item é competitivo', () => {
    expect(sugerirPreco({ referencia: 100, mediana: 90, limite: 70 })).toMatchObject({ preco: 100, situacao: 'competitivo' })
    expect(sugerirPreco({ referencia: 100, mediana: 90, limite: 95 })).toMatchObject({ preco: 100, situacao: 'apertado' })
    expect(sugerirPreco({ referencia: 100, mediana: 90, limite: 110 })).toMatchObject({ preco: 110, situacao: 'prejuizo' })
    expect(sugerirPreco({ referencia: 100, mediana: null, limite: null })).toMatchObject({ preco: 100, situacao: 'sem_custo' })
    expect(sugerirPreco({ referencia: null, mediana: 50, limite: null })).toMatchObject({ preco: 50, situacao: 'sem_custo' })
    expect(sugerirPreco({ referencia: null, mediana: null, limite: 10 })).toMatchObject({ preco: 10, situacao: 'sem_dados' })
    expect(sugerirPreco({ referencia: 100, mediana: 90, limite: 110 }).texto).toContain('10%')
  })

  it('monta a planilha da proposta para o Excel', () => {
    const csv = planilhaProposta({ empresa: 'Ana LTDA', cnpj: '12345678000190', processo: 'Pregão nº 45/2026', orgao: 'Prefeitura' },
      [{ numero_item: 1, lote: null, descricao: 'Papel; A4 "branco"', unidade: 'RESMA', quantidade: 10, marca_modelo: '=CMD()', preco: 24.5 },
        { numero_item: 2, lote: null, descricao: 'Caneta', unidade: 'UN', quantidade: 3, marca_modelo: null, preco: null }])
    expect(csv.startsWith('﻿PROPOSTA DE PREÇOS;Pregão nº 45/2026')).toBe(true)
    expect(csv).toContain('CNPJ;12.345.678/0001-90')
    expect(csv).toContain('1;;"Papel; A4 ""branco""";RESMA;10;\'=CMD();24,50;245,00')
    expect(csv).toContain(';;;;;;TOTAL GERAL;245,00')
  })
})
