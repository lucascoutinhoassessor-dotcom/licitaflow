import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'

function preparar() {
  const eventos: Record<string, (e: any) => void> = {}
  const offline = new Response('Reconectando'), script = new Response('reconectar()')
  const cache = { addAll: vi.fn().mockResolvedValue(undefined), match: vi.fn(async (url: string) => url === '/offline.js' ? script : offline) }
  const fetch = vi.fn().mockResolvedValue(new Response('Aplicação'))
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self: { location: { origin: 'https://site' }, addEventListener: (nome: string, fn: any) => { eventos[nome] = fn }, skipWaiting: vi.fn() },
    caches: { open: vi.fn().mockResolvedValue(cache) }, fetch, URL, Response, AbortController, setTimeout, clearTimeout,
  })
  function requisitar(path = '/app', mode = 'navigate') {
    const respondWith = vi.fn()
    eventos.fetch({ request: { url: 'https://site' + path, mode }, respondWith })
    return respondWith
  }
  return { eventos, cache, fetch, offline, script, requisitar }
}
afterEach(() => vi.useRealTimers())
describe('acesso pelo service worker', () => {
  it('guarda também o script de reconexão permitido pela CSP', async () => {
    const t = preparar(), waitUntil = vi.fn()
    t.eventos.install({ waitUntil })
    await waitUntil.mock.calls[0][0]
    expect(t.cache.addAll).toHaveBeenCalledWith(['/offline.html', '/offline.js'])
    expect(readFileSync('public/offline.html', 'utf8')).toContain('<script src="/offline.js"></script>')
    expect(readFileSync('public/offline.html', 'utf8')).not.toContain('<script>')
  })
  it('oferece reconexão em falha de rede ou erro do servidor', async () => {
    const t = preparar()
    t.fetch.mockRejectedValueOnce(new Error('Sem rede'))
    expect(await t.requisitar().mock.calls[0][0]).toBe(t.offline)
    t.fetch.mockResolvedValueOnce(new Response('Falha', { status: 503 }))
    expect(await t.requisitar().mock.calls[0][0]).toBe(t.offline)
  })
  it('limita a espera de uma navegação que nunca responde', async () => {
    vi.useFakeTimers()
    const t = preparar()
    t.fetch.mockImplementation((_request, init) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('timeout')))
    }))
    const resposta = t.requisitar().mock.calls[0][0]
    await vi.advanceTimersByTimeAsync(12000)
    expect(await resposta).toBe(t.offline)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('entrega o script offline do cache e não intercepta APIs ou autenticação', async () => {
    const t = preparar()
    expect(await t.requisitar('/offline.js', 'cors').mock.calls[0][0]).toBe(t.script)
    expect(t.requisitar('/api/usuarios', 'cors')).not.toHaveBeenCalled()
    expect(t.requisitar('/auth/v1/token', 'cors')).not.toHaveBeenCalled()
  })
  it('preserva respostas de acesso negado e suporta cache ausente', async () => {
    const t = preparar(), negado = new Response('Sem permissão', { status: 403 })
    t.fetch.mockResolvedValueOnce(negado)
    expect(await t.requisitar().mock.calls[0][0]).toBe(negado)
    t.fetch.mockRejectedValueOnce(new Error('Sem rede'))
    t.cache.match.mockResolvedValueOnce(undefined)
    expect((await t.requisitar().mock.calls[0][0]).status).toBe(503)
  })
})
