import { describe, expect, it } from 'vitest'
import { categoriasDoObjeto } from './categorias'

describe('categoriasDoObjeto', () => {
  it('resume o objeto em etiquetas curtas', () => {
    expect(categoriasDoObjeto('aquisição de uma mesa executiva em MDF, perfil "U", Medindo 25,11 M² em MDF 18mm')).toEqual(['Móveis de Escritório', 'MDF e Materiais de Construção'])
    expect(categoriasDoObjeto('O objeto do presente Contrato é a aquisição de veículo tipo pick-up, observados os Anexos')).toEqual(['Veículos', 'Transporte'])
    expect(categoriasDoObjeto('AQUISIÇÃO DE SUPRIMENTOS DE INFORMATICA PARA ATENDER AS NECESSIDADES DA CAMARA MUNICIPAL')).toContain('Suprimentos de informática')
    expect(categoriasDoObjeto('Aquisição de gêneros alimentícios para a merenda escolar')).toEqual(['Alimentos'])
    expect(categoriasDoObjeto('AQUISIÇÃO DE CORTINAS')).toEqual(['Cortinas e Persianas'])
    expect(categoriasDoObjeto('fornecimento de ração para cães e gatos para garantir alimentação adequada')).toEqual(['Produtos para Animais'])
    expect(categoriasDoObjeto('AQUISIÇÃO DE FRALDAS GERIÁTRICAS DESCARTÁVEIS')).toEqual(['Limpeza e Higiene'])
    expect(categoriasDoObjeto('Aquisição de Equipamentos e Material Permanente para a Unidade Básica')).toEqual(['Material Permanente'])
  })
  it('não confunde palavras parecidas', () => {
    expect(categoriasDoObjeto('Registro de preços para contratação de banda larga')).not.toContain('Instrumentos Musicais')
    expect(categoriasDoObjeto('Pregão eletrônico para aquisição de maçã e banana')).not.toContain('Componentes eletrônicos')
    expect(categoriasDoObjeto('Capacitação de servidores públicos')).not.toContain('Equipamentos de informática')
  })
  it('sem objeto ou sem termo conhecido, não mostra nada', () => {
    expect(categoriasDoObjeto(null)).toEqual([])
    expect(categoriasDoObjeto('Contratação conforme termo de referência')).toEqual([])
  })
})
