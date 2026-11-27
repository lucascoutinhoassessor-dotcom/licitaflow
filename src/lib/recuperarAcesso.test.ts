import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const codigo = readFileSync('public/recuperar-acesso.js', 'utf8')
function preparar(dados: Record<string, string> = {}) {
  const eventos: Record<string, (e?: any) => void> = {}
  let timeout: () => void
  const elemento = () => ({ style: {}, setAttribute: vi.fn(), append: vi.fn(), addEventListener: vi.fn() })
  const body = { appendChild: vi.fn() }, splash = { remove: vi.fn() }, reload = vi.fn()
  const navigator = { onLine: true }
  runInNewContext(codigo, {
    window: { addEventListener: (nome: string, fn: any) => { eventos[nome] = fn } },
    document: { getElementById: () => splash, createElement: elemento, body }, navigator,
    location: { reload }, setTimeout: (fn: any) => { timeout = fn },
    sessionStorage: { getItem: (k: string) => dados[k], setItem: (k: string, v: string) => { dados[k] = v } },
  })
  return { eventos, body, splash, reload, navigator, expirar: () => timeout() }
}
describe('recuperação antes de carregar o React', () => {
  it('atualiza uma vez ao perder um arquivo e depois oferece tentativa manual', () => {
    const dados = {}, t = preparar(dados)
    const preventDefault = vi.fn()
    t.eventos['vite:preloadError']({ preventDefault })
    expect(t.reload).toHaveBeenCalledTimes(1)
    expect(preventDefault).toHaveBeenCalled()
    const segunda = preparar(dados)
    segunda.eventos['vite:preloadError']({ preventDefault })
    expect(segunda.reload).not.toHaveBeenCalled()
    expect(segunda.body.appendChild).toHaveBeenCalledTimes(1)
    expect(segunda.splash.remove).toHaveBeenCalled()
  })
  it('remove o splash e oferece recuperação quando o bundle nunca inicia', () => {
    const t = preparar()
    t.expirar()
    expect(t.splash.remove).toHaveBeenCalled()
    expect(t.body.appendChild).toHaveBeenCalledTimes(1)
  })
  it('mantém a aplicação aberta quando a inicialização teve sucesso', () => {
    const t = preparar()
    t.eventos['lf:iniciado']()
    t.expirar()
    expect(t.body.appendChild).not.toHaveBeenCalled()
  })
  it('não recarrega automaticamente sem rede nem por erro de imagem', () => {
    const t = preparar()
    t.eventos.error({ target: { tagName: 'IMG', src: '/imagem.png' } })
    expect(t.body.appendChild).not.toHaveBeenCalled()
    t.navigator.onLine = false
    t.eventos.error({ target: { tagName: 'SCRIPT', src: 'https://site/assets/index-123.js' } })
    expect(t.reload).not.toHaveBeenCalled()
    expect(t.body.appendChild).toHaveBeenCalledTimes(1)
  })
})
