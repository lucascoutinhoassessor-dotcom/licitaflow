import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { diaBrasilia, type ResumoEditais } from '@/lib/resumoEditais'
import ResumoEditaisHoje from './ResumoEditaisHoje'
const auth = vi.hoisted(() => ({ user: { id: 'cliente' } as { id: string } | null }))
vi.mock('@/providers/AuthProvider', () => ({ useAuth: () => auth }))
afterEach(() => { auth.user = { id: 'cliente' } })
const resumo: ResumoEditais = { data: diaBrasilia(), editais: 304, itens: 1206, editaisComItens: 93, servicos: 143, materiais: 125, ate50mil: 96, ate250mil: 50, acima250mil: 126, atualizadoEm: new Date().toISOString(), cargaCompleta: true, pausadoAte: null }
function render(dados?: ResumoEditais, termos = '') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (dados) qc.setQueryData(['resumo-editais-hoje', auth.user?.id, diaBrasilia(), termos], dados)
  const html = renderToStaticMarkup(<StaticRouter location="/app"><QueryClientProvider client={qc}><ResumoEditaisHoje termos={termos} /></QueryClientProvider></StaticRouter>)
  qc.clear(); return html
}
describe('panorama exclusivo do painel', () => {
  it('não renderiza indicadores sem login, mesmo com dados em cache', () => {
    auth.user = null
    expect(render(resumo)).toBe('')
  })
  it('mostra contagem parcial com cobertura acessível e atalhos filtrados', () => {
    const html = render(resumo)
    expect(html).toContain('Hoje nas licitações')
    expect(html).toContain('Detalhes de 93 de 304 licitações')
    expect(html).toContain('aria-valuenow="31"')
    expect(html).toContain('publicadas=hoje&amp;tipo=servicos')
    expect(html).toContain('publicadas=hoje&amp;faixa=ate250mil')
    expect(html).toContain('em coleta')
    expect(html).toContain('Cadastre as palavras-chave')
  })
  it('mostra estados, sessões do dia e as compatíveis com a empresa', () => {
    const html = render({ ...resumo, abremHoje: 37, ufs: [{ uf: 'MG', n: 40 }, { uf: 'SP', n: 22 }], perfil: { data: diaBrasilia(), compativeis: 12, limitado: false } }, 'limpeza;pneus')
    expect(html).toContain('37 sessões ainda hoje')
    expect(html).toContain('publicadas=hoje&amp;uf=SP')
    expect(html).toContain('>12<')
    expect(html).toContain('busca=limpeza%3Bpneus')
  })
  it('mostra vazio sem uma falsa cobertura de 100%', () => {
    const html = render({ ...resumo, editais: 0, editaisComItens: 0, itens: 0 })
    expect(html).toContain('Nenhuma licitação publicada hoje')
    expect(html).not.toContain('role="progressbar"')
  })
  it('não apresenta números de outro dia como se fossem de hoje', () => {
    const html = render({ ...resumo, data: '2000-01-01', editais: 987654 })
    expect(html).not.toContain('987.654')
    expect(html).not.toContain('Ao vivo</span>')
  })
})
