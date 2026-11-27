import { afterEach, describe, expect, it, vi } from 'vitest'
import { criarHandler } from './oportunidades.js'
import { resumoHoje } from './turso.js'
vi.mock('./turso.js', async importOriginal => ({ ...await importOriginal<typeof import('./turso.js')>(), clienteTurso: () => ({}), resumoHoje: vi.fn().mockResolvedValue({ editais: 304, itens: 1206 }), perfilHoje: vi.fn().mockResolvedValue({ compativeis: 7 }) }))
afterEach(() => vi.clearAllMocks())
const env = { VITE_SUPABASE_URL: 'https://supabase.test', VITE_SUPABASE_ANON_KEY: 'publica', TURSO_DATABASE_URL: 'https://resumo.test' }
function response() { return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() } }
describe('indicadores exclusivos de usuários autenticados', () => {
  it('bloqueia visitante sem consultar a base de licitações', async () => {
    const validar = vi.fn(), res = response()
    await criarHandler({ env, validarSessao: validar })({ method: 'GET', headers: {}, query: { acao: 'turso-resumo-hoje' } }, res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(validar).not.toHaveBeenCalled()
    expect(resumoHoje).not.toHaveBeenCalled()
  })
  it('rejeita sessão inválida antes de consultar indicadores', async () => {
    const res = response()
    await criarHandler({ env, validarSessao: async () => null })({ method: 'GET', headers: { authorization: 'Bearer resumo-invalido' }, query: { acao: 'turso-resumo-hoje' } }, res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(resumoHoje).not.toHaveBeenCalled()
  })
  it('entrega os indicadores a uma sessão válida sem cache público HTTP', async () => {
    const res = response()
    await criarHandler({ env, validarSessao: async () => 'cliente' })({ method: 'GET', headers: { authorization: 'Bearer resumo-valido' }, query: { acao: 'turso-resumo-hoje' } }, res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ editais: 304, itens: 1206 })
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(res.setHeader.mock.calls.some(([_, valor]) => String(valor).includes('public,'))).toBe(false)
  })
})
describe('contagem pelo perfil da empresa', () => {
  it('só consulta as palavras-chave quando a sessão é válida e junta o resultado', async () => {
    const turso = await import('./turso.js')
    const perfil = vi.spyOn(turso, 'perfilHoje')
    const res = response()
    await criarHandler({ env: { ...env, TURSO_DATABASE_URL: 'https://perfil.test' }, validarSessao: async () => 'cliente' })({ method: 'GET', headers: { authorization: 'Bearer perfil' }, query: { acao: 'turso-resumo-hoje', termos: 'limpeza;pneus', mods: '8,6,99,6' } }, res)
    expect(res.status).toHaveBeenCalledWith(200)
    // Modalidades do plano chegam limpas (sem inválidas nem repetidas) ao resumo e ao perfil.
    expect(perfil).toHaveBeenCalledWith(expect.anything(), 'limpeza;pneus', expect.any(Date), [6, 8])
    expect(resumoHoje).toHaveBeenCalledWith(expect.anything(), expect.any(Date), [6, 8])
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ editais: 304, perfil: { compativeis: 7 } }))
  })
})
describe('modalidades do plano', async () => {
  const { modalidadesResumo } = await vi.importActual<typeof import('./turso.js')>('./turso.js')
  it('todas as modalidades ou nenhuma valem como sem filtro', () => {
    expect(modalidadesResumo('')).toEqual([])
    expect(modalidadesResumo('1,2,3,4,5,6,7,8,9,10,11,12,13')).toEqual([])
    expect(modalidadesResumo('12,6,x,0,6')).toEqual([6, 12])
  })
})
