// Sincronia entre o sino e as notificações do aparelho (a barra do celular, que é o que o Android conta no ícone).
// - Tocar num push abre a tela dele com ?de=push: os itens do sino daquela tela viram lidos.
// - Marcar como lido no sino fecha, na barra, as notificações que levam à mesma tela.
// Avisos do master não têm link próprio: o push deles abre /app/avisos.

export interface ItemComLink { tipo: 'aviso' | 'mensagem'; link: string | null }

/** Tela de destino de um item no sino. */
export const telaDoItem = (x: ItemComLink) => (x.tipo === 'aviso' ? '/app/avisos' : x.link ?? '/app')

/** Itens que o push aberto nesta tela representa. A tela inicial (/app) não marca nada, por ser genérica. */
export function itensDaTela<T extends ItemComLink>(itens: T[], pathname: string): T[] {
  const tela = pathname.replace(/\/+$/, '') || '/'
  if (tela === '/app' || tela === '/') return []
  return itens.filter((x) => telaDoItem(x) === tela)
}

/** Caminho (sem domínio nem ?de=push) para onde uma notificação do aparelho leva. */
export function caminhoDaNotificacao(url: unknown, origem: string): string | null {
  if (typeof url !== 'string' || !url) return null
  try {
    const u = new URL(url, origem)
    return u.origin === new URL(origem).origin ? u.pathname.replace(/\/+$/, '') || '/' : null
  } catch {
    return null
  }
}

/** Notificações do aparelho que levam às telas dos itens lidos. */
export function notificacoesDosItens<N extends { data?: { url?: unknown } | null }>(notificacoes: N[], itens: ItemComLink[], origem: string): N[] {
  const telas = new Set(itens.map(telaDoItem).filter((t) => t !== '/app'))
  return notificacoes.filter((n) => {
    const c = caminhoDaNotificacao(n.data?.url, origem)
    return !!c && telas.has(c)
  })
}
