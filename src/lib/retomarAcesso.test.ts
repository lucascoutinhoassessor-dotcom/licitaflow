import { describe, expect, it, vi } from 'vitest'
import { aoRetomarAcesso } from './retomarAcesso'

function preparar() {
  const janela = new EventTarget()
  const pagina = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState })
  const tentar = vi.fn()
  const parar = aoRetomarAcesso(tentar, janela, pagina)
  return { janela, pagina, tentar, parar }
}
describe('recuperação automática do acesso', () => {
  it('tenta quando a conexão volta e evita várias tentativas simultâneas', () => {
    const t = preparar()
    t.janela.dispatchEvent(new Event('online'))
    t.pagina.dispatchEvent(new Event('visibilitychange'))
    t.janela.dispatchEvent(new Event('online'))
    expect(t.tentar).toHaveBeenCalledTimes(1)
    t.parar()
  })
  it('aguarda o PWA voltar ao primeiro plano', () => {
    const t = preparar()
    t.pagina.visibilityState = 'hidden'
    t.janela.dispatchEvent(new Event('online'))
    t.pagina.dispatchEvent(new Event('visibilitychange'))
    expect(t.tentar).not.toHaveBeenCalled()
    t.pagina.visibilityState = 'visible'
    t.pagina.dispatchEvent(new Event('visibilitychange'))
    expect(t.tentar).toHaveBeenCalledTimes(1)
    t.parar()
  })
  it('remove eventos ao recuperar o acesso ou desmontar a tela', () => {
    const t = preparar()
    t.parar()
    t.janela.dispatchEvent(new Event('online'))
    t.pagina.dispatchEvent(new Event('visibilitychange'))
    expect(t.tentar).not.toHaveBeenCalled()
  })
})
