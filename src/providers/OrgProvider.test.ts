import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrgProvider, useOrg } from './OrgProvider'

vi.mock('./AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

const clientes: QueryClient[] = []
afterEach(() => clientes.splice(0).forEach(qc => qc.clear()))
function preparar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } })
  clientes.push(qc)
  return qc
}
function Cadastro() {
  const { carregando, org, empresas } = useOrg()
  return createElement('p', null, carregando ? 'Carregando' : !org || empresas.length === 0 ? 'Cadastro' : 'Painel')
}
function renderizar(qc: QueryClient) {
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, createElement(OrgProvider, { children: createElement(Cadastro) })))
}
async function falhar(qc: QueryClient, queryKey: string[]) {
  await qc.fetchQuery({ queryKey, queryFn: () => Promise.reject(new Error('Sem rede')) }).catch(() => {})
}
describe('falhas ao carregar a conta', () => {
  it('erro ao buscar organizações oferece nova tentativa e não abre cadastro', async () => {
    const qc = preparar()
    await falhar(qc, ['organizacoes', 'u1'])
    const html = renderizar(qc)
    expect(html).toContain('Tentar novamente')
    expect(html).not.toContain('>Cadastro<')
  })
  it('erro ao buscar empresas também não abre cadastro', async () => {
    const qc = preparar()
    qc.setQueryData(['organizacoes', 'u1'], [{ id: 'o1', papel: 'owner' }])
    await falhar(qc, ['empresas', 'o1'])
    expect(renderizar(qc)).toContain('Tentar novamente')
  })
  it('uma consulta bem sucedida e vazia continua permitindo o cadastro', () => {
    const qc = preparar()
    qc.setQueryData(['organizacoes', 'u1'], [])
    expect(renderizar(qc)).toContain('>Cadastro<')
  })
  it('mantém o painel com dados já carregados durante uma falha de atualização', async () => {
    const qc = preparar()
    qc.setQueryData(['organizacoes', 'u1'], [{ id: 'o1', papel: 'owner' }])
    qc.setQueryData(['empresas', 'o1'], [{ id: 'e1' }])
    await falhar(qc, ['empresas', 'o1'])
    expect(renderizar(qc)).toContain('>Painel<')
  })
  it('organização suspensa não espera uma consulta de empresas desabilitada', () => {
    const qc = preparar()
    qc.setQueryData(['organizacoes', 'u1'], [{ id: 'o1', papel: 'owner', suspensa: true }])
    expect(renderizar(qc)).not.toContain('>Carregando<')
  })
})
