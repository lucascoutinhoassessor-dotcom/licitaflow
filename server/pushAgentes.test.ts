import { describe, expect, it, vi } from 'vitest'
import { enviarResumoAgentes, filtrarPushAgente } from './pushAgentes.js'
import { criarHandler } from './push.js'

describe('push das IAs', () => {
  it('respeita preferências em todos os aparelhos e mantém o padrão para conta sem registro', async () => {
    const chamar = vi.fn(async () => [{ user_id: 'a', radar: false }, { user_id: 'b', radar: true }])
    const inscricoes = [{ user_id: 'a', id: 1 }, { user_id: 'a', id: 2 }, { user_id: 'b', id: 3 }, { user_id: 'c', id: 4 }]
    expect((await filtrarPushAgente(inscricoes, 'radar', chamar)).map(s => s.id)).toEqual([3, 4])
  })

  it('valida o token antes de buscar as inscrições', async () => {
    const chamar = vi.fn(async () => { throw new Error('Token inválido') })
    const webpush = { setVapidDetails: vi.fn(), sendNotification: vi.fn() }
    await expect(enviarResumoAgentes({ token: 'x', chamar, webpush })).rejects.toThrow('Token inválido')
    expect(chamar).toHaveBeenCalledOnce()
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('confirma cada aparelho separadamente e mantém falhas transitórias para retentativa', async () => {
    const lote = [201, 410, 503].map((status, i) => ({ id: `id${i}`, reserva: `r${i}`, endpoint: `https://push/${status}`, p256dh: 'p', auth: 'a', payload: { titulo: 'Suas IAs', url: '/app/agentes' } }))
    const chamar = vi.fn(async (path: string) => {
      if (path.includes('push_vapid')) return [{ publica: 'pub', privada: 'priv' }]
      if (path.includes('push_agentes_lote')) return lote
      return null
    })
    const webpush = { setVapidDetails: vi.fn(), sendNotification: vi.fn(async (s: { endpoint: string }) => {
      const statusCode = Number(s.endpoint.split('/').pop())
      if (statusCode !== 201) throw Object.assign(new Error('falha'), { statusCode })
    }) }
    expect(await enviarResumoAgentes({ token: 't', chamar, webpush })).toEqual({ enviados: 1, falhas: 2 })
    const conclusoes = chamar.mock.calls.filter(([p]) => p.includes('concluir')) as unknown as [string, { body: string }][]
    expect(conclusoes.map(([, op]) => JSON.parse(op.body).p_status).sort()).toEqual([201, 410, 503])
    expect(JSON.parse(conclusoes[0][1].body)).toMatchObject({ p_id: 'id0', p_reserva: 'r0' })
  })

  it('não reserva mensagens se não há chaves VAPID', async () => {
    const chamar = vi.fn(async (path: string) => path.includes('push_vapid') ? [] : null)
    expect(await enviarResumoAgentes({ token: 't', chamar })).toEqual({ enviados: 0, falhas: 0 })
    expect(chamar.mock.calls.some(([p]) => p.includes('push_agentes_lote'))).toBe(false)
  })

  it('recusa acionamento público do resumo sem token de cron', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://db'); vi.stubEnv('SUPABASE_ANON_KEY', 'anon'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service')
    try {
      const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() }
      const fetcher = vi.fn()
      await criarHandler({ fetcher })({ method: 'POST', headers: {}, body: { acao: 'resumo-agentes' } }, res)
      expect(res.status).toHaveBeenCalledWith(401)
      expect(fetcher).not.toHaveBeenCalled()
    } finally { vi.unstubAllEnvs() }
  })
})
