import { describe, expect, it } from 'vitest'
import { controleDe, partesControle, rotaLeitor } from './leitor'

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
