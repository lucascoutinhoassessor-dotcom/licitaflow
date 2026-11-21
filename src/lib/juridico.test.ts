import { describe, expect, it } from 'vitest'
import { DADOS_VAZIOS, PECAS, ehDiaUtil, feriadosNacionais, htmlParaWord, montarPeca, prazoDaPeca, somarDiasUteis } from './juridico'

const ymd = (d: Date | null) => d && `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const dados = {
  ...DADOS_VAZIOS,
  empresa: { razao_social: 'Alfa Comércio Ltda', cnpj: '12345678000190', endereco: { logradouro: 'Rua A', numero: '10', cep: '01000-000' }, municipio: 'São Paulo', uf: 'SP' },
  representante: 'Maria Souza', orgao: 'Prefeitura de Campinas', numero: '90012/2026', modalidade: 'Pregão eletrônico', objeto: 'Papel A4',
  cidade: 'São Paulo/SP', data: '21 de novembro de 2026',
}

describe('dias úteis', () => {
  it('conhece os feriados móveis', () => {
    const f = feriadosNacionais(2026) // Páscoa em 05/04/2026
    expect(f.has('2026-04-03')).toBe(true) // Sexta-feira Santa
    expect(f.has('2026-02-16')).toBe(true) // Carnaval
    expect(f.has('2026-06-04')).toBe(true) // Corpus Christi
    expect(f.has('2026-11-20')).toBe(true) // Consciência Negra
  })
  it('pula fim de semana e feriado', () => {
    expect(ehDiaUtil(new Date(2026, 10, 21))).toBe(false) // sábado
    expect(ymd(somarDiasUteis(new Date(2026, 10, 19), 3))).toBe('2026-11-25') // qui → (20 feriado, sáb, dom) seg, ter, qua
    expect(ymd(somarDiasUteis(new Date(2026, 10, 24), -3))).toBe('2026-11-18') // ter → seg 23, (20 feriado) qui 19, qua 18
  })
  it('calcula o prazo de cada peça', () => {
    expect(ymd(prazoDaPeca('impugnacao', '2026-12-10'))).toBe('2026-12-07')
    expect(ymd(prazoDaPeca('esclarecimento', '2026-12-10T09:00:00'))).toBe('2026-12-07')
    expect(ymd(prazoDaPeca('recurso', '2026-12-10'))).toBe('2026-12-15')
    expect(ymd(prazoDaPeca('contrarrazoes', '2026-12-23'))).toBe('2026-12-29')
    expect(prazoDaPeca('recurso', '')).toBeNull()
  })
})

describe('montagem das peças', () => {
  it('todas as peças saem com a empresa e sem quebrar', () => {
    for (const p of PECAS) {
      const t = montarPeca(p.id, dados)
      expect(t.toUpperCase()).toContain('ALFA COMÉRCIO LTDA')
      expect(t.length).toBeGreaterThan(80)
    }
  })
  it('impugnação traz qualificação, teses e pedidos padrão', () => {
    const t = montarPeca('impugnacao', { ...dados, teses: ['marca'], itens: 'Item 9.1' })
    expect(t).toContain('IMPUGNAÇÃO AO EDITAL')
    expect(t).toContain('CNPJ sob o nº 12.345.678/0001-90')
    expect(t).toContain('art. 41')
    expect(t).toContain('art. 164')
    expect(t).toContain('Item 9.1')
    expect(t).toContain('Maria Souza')
  })
  it('esclarecimento numera as perguntas', () => {
    const t = montarPeca('esclarecimento', { ...dados, perguntas: 'Aceita outra marca?\n\n2) Qual o prazo?' })
    expect(t).toContain('1. Aceita outra marca?')
    expect(t).toContain('2. Qual o prazo?')
  })
  it('marca com colchetes o que falta', () => {
    const t = montarPeca('recurso', { ...DADOS_VAZIOS })
    expect(t).toContain('[RAZÃO SOCIAL DA EMPRESA]')
    expect(t).toContain('[NOME DO REPRESENTANTE]')
  })
  it('intenção de recurso é curta e cita o art. 165', () => {
    const t = montarPeca('intencao-recurso', { ...dados, atoRecorrido: 'a nossa inabilitação', itens: 'Item 3', argumentos: 'O atestado apresentado atende ao item 8.4 do edital.' })
    expect(t).toMatch(/^Alfa Comércio Ltda manifesta intenção de recorrer \(Item 3\) contra a nossa inabilitação/)
    expect(t).toContain('art. 165')
    expect(t.length).toBeLessThan(400)
  })
  it('contrarrazões citam a recorrente', () => {
    expect(montarPeca('contrarrazoes', { ...dados, concorrente: 'Beta S/A' })).toContain('interposto por Beta S/A')
  })
  it('gera HTML para o Word com os títulos em negrito e escapado', () => {
    const h = htmlParaWord('I. DOS FATOS\n\nA < B', 'Teste')
    expect(h).toContain('<b>I. DOS FATOS</b>')
    expect(h).toContain('A &lt; B')
  })
})
