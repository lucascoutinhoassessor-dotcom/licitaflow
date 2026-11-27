import { lazy as lazyReact, type ComponentType } from 'react'

/**
 * Páginas carregadas sob demanda sem nunca deixar a tela em branco.
 *
 * 1. Repete o download (rede oscilando) antes de desistir.
 * 2. Depois que o app abre, baixa todas as páginas em segundo plano: a partir daí, trocar de página não
 *    depende mais da rede nem do deploy (o navegador guarda o módulo já carregado).
 * 3. Os arquivos das versões anteriores continuam no servidor por 30 dias (scripts/manter-assets-antigos.mjs),
 *    então mesmo quem ficou com o app aberto durante um deploy acha a página.
 */
type Carregador<T> = () => Promise<{ default: T }>

const carregadores: Carregador<unknown>[] = []
const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function comTentativas<T>(carregar: () => Promise<T>, pausas = [400, 1200, 3000]): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await carregar()
    } catch (e) {
      if (i >= pausas.length) throw e
      await esperar(pausas[i])
    }
  }
}

export function lazy<T extends ComponentType<any>>(carregar: Carregador<T>) {
  let promessa: Promise<{ default: T }> | null = null
  // Uma promessa por página: o pré-carregamento e a navegação usam o mesmo download.
  const unico = () => {
    promessa ??= comTentativas(carregar).catch(e => { promessa = null; throw e })
    return promessa
  }
  carregadores.push(unico)
  return lazyReact(unico)
}

let preCarregando = false

/** Baixa todas as páginas, uma de cada vez e só com o navegador ocioso, para não disputar banda com a tela atual. */
export function preCarregarPaginas() {
  if (preCarregando || typeof window === 'undefined') return
  preCarregando = true
  const conexao = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (conexao?.saveData) return
  const ocioso = (fn: () => void) =>
    'requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 200)
  const fila = [...carregadores]
  const proximo = () => {
    const c = fila.shift()
    if (!c) return
    ocioso(() => { c().catch(() => undefined).finally(proximo) })
  }
  setTimeout(proximo, 1500)
}
