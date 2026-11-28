import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { linkExiste, rotasDoApp } from './rotasApp'

const ler = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const rotas = rotasDoApp(ler('src/App.tsx'))
const links = (texto: string) => [...new Set([...texto.matchAll(/['`](\/app(?:\/[a-z0-9_-]+)*)(?:\/\$\{[^}]+\})?['`]/g)].map((m) => m[1]))]

describe('links das notificações levam a telas que existem', () => {
  it('lê as rotas do app', () => {
    expect(rotas).toContain('agentes/radar')
    expect(linkExiste('/app/agentes/radar', rotas)).toBe(true)
    expect(linkExiste('/app/processos/abc', rotas)).toBe(true)
    expect(linkExiste('/app/radar', rotas)).toBe(false)
    expect(linkExiste('/app/precos', rotas)).toBe(false)
  })

  it.each(['server/mensagensIA.js', 'server/radar.js', 'server/sentinela.js', 'src/components/SinoAvisos.tsx'])('%s', (arquivo) => {
    const errados = links(ler(arquivo)).filter((l) => !linkExiste(l, rotas))
    expect(errados).toEqual([])
  })
})
