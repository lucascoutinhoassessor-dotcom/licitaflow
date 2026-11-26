import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appJaInstalado, instalacaoLembrada, lembrarInstalacao } from './instalacao'

describe('instalação lembrada neste aparelho', () => {
  let dados: Map<string, string>
  beforeEach(() => {
    dados = new Map()
    vi.stubGlobal('location', { pathname: '/app', href: 'https://app.test/app' })
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => dados.get(k) ?? null,
      setItem: (k: string, v: string) => dados.set(k, v),
      removeItem: (k: string) => dados.delete(k),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('lembra a instalação em uma nova visita pelo navegador sem API de detecção', async () => {
    lembrarInstalacao(true)
    expect(await appJaInstalado()).toBe(true)
    expect(instalacaoLembrada()).toBe(true)
  })

  it('abrir pelo ícone registra a instalação para próximas visitas', async () => {
    vi.stubGlobal('navigator', { standalone: true })
    expect(await appJaInstalado()).toBe(true)
    vi.stubGlobal('navigator', {})
    expect(await appJaInstalado()).toBe(true)
  })

  it('detecta o app relacionado e mantém a evidência se a API falhar depois', async () => {
    const getInstalledRelatedApps = vi.fn().mockResolvedValue([{ platform: 'webapp', url: '/manifest.webmanifest' }])
    vi.stubGlobal('navigator', { getInstalledRelatedApps })
    expect(await appJaInstalado()).toBe(true)
    getInstalledRelatedApps.mockRejectedValue(new Error('indisponível'))
    expect(await appJaInstalado()).toBe(true)
  })

  it('não confunde o app master com o app do usuário', async () => {
    vi.stubGlobal('navigator', { getInstalledRelatedApps: async () => [{ platform: 'webapp', url: '/master.webmanifest' }] })
    expect(await appJaInstalado()).toBe(false)
    lembrarInstalacao(true)
    location.pathname = '/master'
    expect(instalacaoLembrada()).toBe(false)
  })

  it('permite oferecer novamente quando o navegador informa que pode instalar', () => {
    lembrarInstalacao(true)
    lembrarInstalacao(false)
    expect(instalacaoLembrada()).toBe(false)
  })

  it('continua funcionando com armazenamento bloqueado', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('bloqueado') } })
    expect(() => lembrarInstalacao(true)).not.toThrow()
    expect(await appJaInstalado()).toBe(false)
  })
})
