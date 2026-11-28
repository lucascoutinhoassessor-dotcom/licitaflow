// Confere se um link interno (/app/...) leva a uma tela que existe nas rotas do app (src/App.tsx).
// Usado nos testes das notificações: um link errado vira 404 quando o cliente toca em "Abrir".

/** Rotas filhas de /app declaradas em App.tsx (ex.: "agentes/radar", "processos/:id"). */
export function rotasDoApp(appTsx: string): string[] {
  const inicio = appTsx.indexOf('path="/app"')
  if (inicio < 0) return []
  const trecho = appTsx.slice(inicio, appTsx.indexOf('</Route>', inicio))
  return [...trecho.matchAll(/path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '/app')
}

/** true se o link existe. O curinga ":modulo" (tela "em breve") não conta como tela válida. */
export function linkExiste(link: string, rotas: string[]): boolean {
  const caminho = link.split('?')[0].replace(/\/+$/, '')
  if (caminho === '/app') return true
  if (!caminho.startsWith('/app/')) return false
  const partes = caminho.slice(5).split('/')
  return rotas.some((r) => {
    const rp = r.split('/')
    if (rp.length !== partes.length || r === ':modulo') return false
    return rp.every((s, i) => s.startsWith(':') ? partes[i].length > 0 : s === partes[i])
  })
}
