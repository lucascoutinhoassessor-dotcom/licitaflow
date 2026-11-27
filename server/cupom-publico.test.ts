import { afterEach, describe, expect, it, vi } from 'vitest'
import { previaCupom } from './cupom-publico.js'

const env = { SUPABASE_URL: 'https://teste.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'privada' }
function res() { return { status: vi.fn().mockReturnThis(), json: vi.fn() } }
afterEach(() => vi.unstubAllGlobals())

async function rodar(codigo: string, cupom: Record<string, unknown> | null, liberado = true) {
  const fetch = vi.fn(async (url: string) => String(url).includes('registrar_pedido_email') ? Response.json(liberado) : Response.json(cupom ? [cupom] : []))
  vi.stubGlobal('fetch', fetch)
  const r = res()
  await previaCupom({ codigo }, { headers: { 'x-forwarded-for': '1.2.3.4' } }, r, env)
  return { r, fetch }
}
const base = { codigo: 'LF10', tipo: 'percentual', valor: 10, plano_id: null, valido_ate: null, max_usos: null, usos: 0, ativo: true }

describe('prévia pública de cupom', () => {
  it('devolve tipo, valor e plano sem a descrição interna', async () => {
    const { r, fetch } = await rodar(' lf10 ', { ...base, descricao: 'parceria secreta' })
    expect(r.json).toHaveBeenCalledWith({ codigo: 'LF10', tipo: 'percentual', valor: 10, plano: null, descricao: null })
    expect(String(fetch.mock.calls[1][0])).not.toContain('descricao')
  })
  it('recusa cupom inexistente, desativado, vencido ou esgotado', async () => {
    for (const c of [null, { ...base, ativo: false }, { ...base, valido_ate: '2020-01-01' }, { ...base, max_usos: 5, usos: 5 }]) {
      const { r } = await rodar('LF10', c)
      expect(r.status).toHaveBeenCalledWith(400)
    }
  })
  it('limita as consultas por IP e nem consulta código mal formado', async () => {
    expect((await rodar('LF10', base, false)).r.status).toHaveBeenCalledWith(429)
    const { r, fetch } = await rodar('a@', base)
    expect(r.status).toHaveBeenCalledWith(400)
    expect(fetch).not.toHaveBeenCalled()
  })
})
