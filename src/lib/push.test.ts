import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { devePedirNotificacoes, estadoPush, observarPermissao, precisaInstalar, sincronizarPush } from './push'

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'token-teste' } } }) } } }))

const permissao = (valor: NotificationPermission) => Object.defineProperty(Notification, 'permission', { value: valor, configurable: true })

describe('avisos conforme a permissão atual', () => {
  beforeEach(() => {
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() })
    vi.stubGlobal('window', { PushManager: {}, Notification, matchMedia: () => ({ matches: false }) })
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => undefined }, userAgent: 'Android' })
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('pede para quem nunca permitiu ou revogou a permissão', async () => {
    expect(await estadoPush()).toBe('inativo')
    expect(devePedirNotificacoes('inativo', false)).toBe(true)
    permissao('denied')
    expect(await estadoPush()).toBe('negado')
    expect(devePedirNotificacoes('negado', true)).toBe(true)
  })

  it('não pede novamente quando a permissão já foi concedida, mesmo sem inscrição', async () => {
    permissao('granted')
    expect(await estadoPush()).toBe('inativo')
    expect(devePedirNotificacoes('inativo', true)).toBe(false)
    permissao('default')
    expect(devePedirNotificacoes('inativo', true)).toBe(true)
  })

  it('no Safari não manda instalar de novo quando a instalação já é conhecida', () => {
    vi.stubGlobal('navigator', { userAgent: 'iPhone' })
    expect(precisaInstalar()).toBe(true)
    expect(devePedirNotificacoes('sem-suporte', false)).toBe(true)
    expect(devePedirNotificacoes('sem-suporte', true)).toBe(false)
    vi.stubGlobal('navigator', { userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 })
    expect(precisaInstalar()).toBe(true)
    vi.stubGlobal('navigator', { userAgent: 'iPhone', standalone: true })
    expect(precisaInstalar()).toBe(false)
  })

  it('recupera a inscrição permitida sem pedir permissão nem mostrar confirmação', async () => {
    permissao('granted')
    const sub = { toJSON: () => ({ endpoint: 'https://push.test/1' }) }
    const reg = {
      pushManager: { getSubscription: vi.fn().mockResolvedValue(null), subscribe: vi.fn().mockResolvedValue(sub) },
      showNotification: vi.fn(),
    }
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => reg, ready: Promise.resolve(reg) } })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ chave: 'AQID' }) })
    vi.stubGlobal('fetch', fetchMock)
    expect(await sincronizarPush()).toBe('ativo')
    expect(Notification.requestPermission).not.toHaveBeenCalled()
    expect(reg.showNotification).not.toHaveBeenCalled()
    expect(reg.pushManager.subscribe).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenLastCalledWith('/api/push', expect.objectContaining({ method: 'POST' }))
  })

  it('falha de rede não transforma permissão concedida em novo pedido', async () => {
    permissao('granted')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const estado = await sincronizarPush()
    expect(devePedirNotificacoes(estado, false)).toBe(false)
    expect(Notification.requestPermission).not.toHaveBeenCalled()
  })

  it('revogar permissão impede a sincronização de uma inscrição antiga', async () => {
    permissao('denied')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await sincronizarPush()).toBe('negado')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('remove os observadores mesmo quando a consulta de permissão termina depois', async () => {
    let resolver!: (s: PermissionStatus) => void
    const janela = new EventTarget()
    vi.stubGlobal('window', janela)
    vi.stubGlobal('document', new EventTarget())
    vi.stubGlobal('navigator', { permissions: { query: () => new Promise<PermissionStatus>(r => { resolver = r }) } })
    const mudou = vi.fn()
    const parar = observarPermissao(mudou)
    janela.dispatchEvent(new Event('focus'))
    expect(mudou).toHaveBeenCalledOnce()
    parar()
    const status = new EventTarget() as PermissionStatus
    resolver(status)
    await Promise.resolve()
    status.dispatchEvent(new Event('change'))
    janela.dispatchEvent(new Event('focus'))
    expect(mudou).toHaveBeenCalledOnce()
  })
})
