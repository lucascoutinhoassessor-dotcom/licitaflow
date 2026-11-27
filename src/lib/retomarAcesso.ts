/** Uma tentativa por ciclo de erro, somente quando a página está visível. */
export function aoRetomarAcesso(tentar: () => void, janela: EventTarget = window, pagina: EventTarget & Pick<Document, 'visibilityState'> = document) {
  let iniciado = false
  const retomar = () => {
    if (iniciado || pagina.visibilityState !== 'visible') return
    iniciado = true
    tentar()
  }
  janela.addEventListener('online', retomar)
  pagina.addEventListener('visibilitychange', retomar)
  return () => {
    janela.removeEventListener('online', retomar)
    pagina.removeEventListener('visibilitychange', retomar)
  }
}
