import { describe, expect, it } from 'vitest'
import { blocos, trechos } from './markdownSimples'

describe('markdown simples das respostas da IA', () => {
  it('formata negrito, itálico, código e links seguros', () => {
    expect(trechos('Prazo **amanhã** às *10h*, veja `Prazos` e [o edital](https://pncp.gov.br/x).')).toEqual([
      { t: 'texto', v: 'Prazo ' }, { t: 'negrito', v: 'amanhã' }, { t: 'texto', v: ' às ' }, { t: 'italico', v: '10h' },
      { t: 'texto', v: ', veja ' }, { t: 'codigo', v: 'Prazos' }, { t: 'texto', v: ' e ' }, { t: 'link', v: 'o edital', url: 'https://pncp.gov.br/x' }, { t: 'texto', v: '.' },
    ])
    expect(trechos('[x](javascript:alert(1))')).toEqual([{ t: 'texto', v: '[x](javascript:alert(1))' }])
  })

  it('separa títulos, listas, parágrafos e código', () => {
    const b = blocos('## Riscos\n- Amostra em 2 dias\n- **Atestado** de 100%\n\n1. Impugnar\n2. Esclarecer\nTexto final\n```\ncodigo\n```')
    expect(b.map((x) => x.tipo)).toEqual(['titulo', 'lista', 'lista', 'paragrafo', 'codigo'])
    expect(b[1]).toMatchObject({ ordenada: false })
    expect(b[2]).toMatchObject({ ordenada: true })
    expect(b[4]).toEqual({ tipo: 'codigo', texto: 'codigo' })
  })
})
