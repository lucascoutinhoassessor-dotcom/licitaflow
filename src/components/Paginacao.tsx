import { Button } from '@/components/ui'

/** Quantos itens cada página mostra nas listas do app (mesmo tamanho da busca de editais). */
export const POR_PAGINA = 20

/** "Anterior · 2 / 5 · Próxima". Some quando há uma página só. */
export default function Paginacao({ pagina, totalPaginas, aoMudar, carregando, className }: {
  pagina: number; totalPaginas: number; aoMudar: (p: number) => void; carregando?: boolean; className?: string
}) {
  if (totalPaginas <= 1) return null
  // Volta ao topo da lista: a área de conteúdo do app rola sozinha (#conteudo-principal); fora dela, a janela.
  const ir = (p: number) => { aoMudar(p); (document.getElementById('conteudo-principal') ?? window).scrollTo({ top: 0, behavior: 'smooth' }) }
  return <nav aria-label="Páginas" className={`mt-5 flex items-center justify-between gap-2 ${className ?? ''}`}>
    <Button variante="contorno" disabled={pagina <= 1 || carregando} onClick={() => ir(pagina - 1)}>Anterior</Button>
    <span className="text-sm tabular-nums" aria-current="page">{pagina} / {totalPaginas}</span>
    <Button variante="contorno" disabled={pagina >= totalPaginas || carregando} onClick={() => ir(pagina + 1)}>Próxima</Button>
  </nav>
}
