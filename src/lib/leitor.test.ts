import { describe, expect, it } from 'vitest'
import { controleDe, partesControle, prazoImpugnacao, rotaLeitor, textoChecklist, type ResultadoLeitor } from './leitor'

describe('número de controle do edital', () => {
  it('aceita o número de controle e o link do PNCP', () => {
    expect(controleDe('11222333000144-1-000045/2026')).toBe('11222333000144-1-000045/2026')
    expect(controleDe(' 11.222.333/0001-44-1-45/2026 ')).toBe('11222333000144-1-000045/2026')
    expect(controleDe('https://pncp.gov.br/app/editais/11222333000144/2026/45')).toBe('11222333000144-1-000045/2026')
    expect(controleDe('pregão 45/2026')).toBeNull()
  })

  it('monta a rota do Leitor', () => {
    expect(partesControle('11222333000144-1-000045/2026')).toEqual({ cnpj: '11222333000144', seq: '45', ano: '2026' })
    expect(rotaLeitor('11222333000144-1-000045/2026')).toBe('/app/agentes/leitor/11222333000144/2026/45')
  })
})

describe('relatório do Leitor', () => {
  it('prazo de impugnação: 3 dias úteis antes da abertura, pulando fim de semana e feriado', () => {
    // Abertura sexta 04/12/2026 → terça 01/12/2026
    expect(prazoImpugnacao('2026-12-04T09:00:00')?.toLocaleDateString('pt-BR')).toBe('01/12/2026')
    // Abertura segunda 23/11/2026 → terça 17/11/2026 (pula o fim de semana e o feriado de 20/11, Consciência Negra)
    expect(prazoImpugnacao('2026-11-23T09:00:00')?.toLocaleDateString('pt-BR')).toBe('17/11/2026')
    expect(prazoImpugnacao(null)).toBeNull()
  })

  it('monta o checklist em texto, marcando o que já foi conferido', () => {
    const t = { texto: '', documento: 'D1', pagina: 1, conferido: true }
    const r: ResultadoLeitor = {
      resumo: 'x',
      ficha: { modalidade: 'Pregão - Eletrônico', numero: '45/2026', processo: null, orgao: 'Prefeitura de X', unidade: null, municipio: null, uf: 'MG', objeto: 'Papel A4', valor_estimado: null, srp: null, modo_disputa: null, amparo_legal: null, situacao: null, abertura: null, encerramento: null, link_origem: null },
      avaliacao: { nivel: 'atencao', resumo: 'Exige atestado.', pontos_decisivos: [] },
      datas: [{ tipo: 'sessao', evento: 'Sessão pública', data: '05/12/2026 09:00', trecho: t }],
      habilitacao: [{ categoria: 'tecnica', exigencia: 'Atestado', detalhe: '50% do quantitativo', trecho: t }],
      proposta: [], participacao: [],
      riscos: [{ nivel: 'alto', titulo: 'Atestado alto', detalhe: '', orientacao: 'Avalie impugnar', fundamento: 'art. 67', trecho: t }],
    }
    const txt = textoChecklist(r, new Set(['habilitacao-0']))
    expect(txt).toContain('CHECKLIST DO EDITAL · Pregão - Eletrônico nº 45/2026')
    expect(txt).toContain('Avaliação: Exige atenção. Exige atestado.')
    expect(txt).toContain('[ ] Sessão pública: 05/12/2026 09:00')
    expect(txt).toContain('[x] Atestado — 50% do quantitativo')
    expect(txt).toContain('(alto) Atestado alto → Avalie impugnar')
  })
})
