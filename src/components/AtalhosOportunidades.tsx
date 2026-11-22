import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Hash, TriangleAlert, Zap } from 'lucide-react'
import { useRecursos } from '@/hooks/useModulos'
import { ATALHOS_PORTAIS } from '@/lib/recursos'
import { PORTAIS } from '@/lib/portais'
import IconePortal from '@/components/IconePortal'
import { cn } from '@/lib/utils'

export type AcaoAtalho = { tipo: 'localizar' } | { tipo: 'sem-vencedor'; portal: string }

/** Menu "Atalhos" da tela Oportunidades. Cada item segue a liberação do master; o menu some quando nenhum está liberado. */
export default function AtalhosOportunidades({ aoEscolher }: { aoEscolher: (a: AcaoAtalho) => void }) {
  const { estado } = useRecursos()
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])

  const localizar = estado('recurso-localizar-edital') === 'liberado'
  const semVencedor = estado('recurso-sem-vencedor') === 'liberado'
  const porPortal = semVencedor && estado('recurso-sem-vencedor-portal') === 'liberado'
  if (!localizar && !semVencedor) return null
  const escolher = (a: AcaoAtalho) => { setAberto(false); aoEscolher(a) }
  const item = 'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none'

  return <div ref={caixa} className="relative">
    <button type="button" aria-haspopup="menu" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-4 text-sm font-semibold hover:bg-muted">
      <Zap className="h-4 w-4 text-amber-500" />Atalhos<ChevronDown className={cn('h-4 w-4 transition-transform', aberto && 'rotate-180')} />
    </button>
    {aberto && <div role="menu" className="absolute right-0 z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border bg-card p-1.5 text-card-foreground shadow-lg">
      {localizar && <button role="menuitem" type="button" className={item} onClick={() => escolher({ tipo: 'localizar' })}>
        <Hash className="h-4 w-4 shrink-0 text-muted-foreground" /><span><span className="block font-medium">Localizar edital</span><span className="block text-xs text-muted-foreground">Pelo número, UASG, CNPJ ou link</span></span>
      </button>}
      {semVencedor && <button role="menuitem" type="button" className={item} onClick={() => escolher({ tipo: 'sem-vencedor', portal: '' })}>
        <TriangleAlert className="h-4 w-4 shrink-0 text-amber-500" /><span><span className="block font-medium">Itens sem vencedor</span><span className="block text-xs text-muted-foreground">Desertos e fracassados em todos os portais</span></span>
      </button>}
      {porPortal && <>
        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sem vencedor por portal</p>
        {ATALHOS_PORTAIS.map((id) => {
          const p = PORTAIS.find((x) => x[0] === id)!
          return <button key={id} role="menuitem" type="button" className={item} onClick={() => escolher({ tipo: 'sem-vencedor', portal: id })}>
            <IconePortal id={id} nome={p[1]} /><span className="truncate">{p[1]}</span>
          </button>
        })}
      </>}
    </div>}
  </div>
}
