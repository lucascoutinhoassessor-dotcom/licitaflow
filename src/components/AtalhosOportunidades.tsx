import { useEffect, useRef, useState } from 'react'
import { CalendarClock, ChevronDown, Hash, Sparkles, TriangleAlert, X, Zap } from 'lucide-react'
import { useRecursos } from '@/hooks/useModulos'
import { ATALHOS_PORTAIS } from '@/lib/recursos'
import { PORTAIS } from '@/lib/portais'
import { PROXIMAS_DISPUTAS } from '@/lib/filtrosOportunidades'
import IconePortal from '@/components/IconePortal'
import { cn } from '@/lib/utils'

export type AcaoAtalho = { tipo: 'localizar' } | { tipo: 'iminencia' } | { tipo: 'sem-vencedor'; portal: string }
  /** Editais que ainda vão abrir entre hoje+de e hoje+ate; portal '' = todos. */
  | { tipo: 'proximas'; de: number; ate: number; portal: string }

/** Menu "Atalhos" da tela Oportunidades. Cada item segue a liberação do master; o menu some quando nenhum está liberado. */
export default function AtalhosOportunidades({ aoEscolher }: { aoEscolher: (a: AcaoAtalho) => void }) {
  const { estado } = useRecursos()
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const fora = (e: PointerEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('pointerdown', fora); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])

  const localizar = estado('recurso-localizar-edital') === 'liberado'
  const semVencedor = estado('recurso-sem-vencedor') === 'liberado'
  const proximas = estado('recurso-proximas-disputas') === 'liberado'
  if (!localizar && !semVencedor && !proximas) return null
  const escolher = (a: AcaoAtalho) => { setAberto(false); aoEscolher(a) }
  const chip = 'flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border bg-background px-1.5 text-xs font-semibold hover:border-primary hover:bg-primary/10 focus-visible:border-primary focus-visible:outline-none sm:min-h-8'
  const item = 'flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none sm:min-h-0'

  // No celular o menu abre como gaveta de baixo para cima (acima da barra inferior); no computador, suspenso sob o botão.
  return <div ref={caixa} className="relative">
    <button type="button" aria-haspopup="menu" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}
      className="inline-flex h-10 items-center gap-1.5 rounded-full border bg-card px-4 text-sm font-semibold hover:bg-muted sm:h-9">
      <Zap className="h-4 w-4 text-amber-500" />Atalhos<ChevronDown className={cn('h-4 w-4 transition-transform', aberto && 'rotate-180')} />
    </button>
    {aberto && <div aria-hidden className="fixed inset-0 z-50 bg-black/50 sm:hidden" onClick={() => setAberto(false)} />}
    {aberto && <div role="menu" aria-label="Atalhos" className="fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto rounded-t-2xl border-t bg-card p-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-card-foreground shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:z-30 sm:mt-2 sm:max-h-[70vh] sm:w-80 sm:rounded-xl sm:border sm:p-1.5 sm:shadow-lg">
      <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-muted sm:hidden" aria-hidden />
      <div className="flex items-center justify-between pb-1 pl-3 sm:hidden">
        <p className="text-base font-semibold">Atalhos</p>
        <button type="button" aria-label="Fechar atalhos" onClick={() => setAberto(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
      </div>
      {proximas && <div className="mb-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2">
        <p className="flex items-center gap-2 px-1 pb-2 text-sm font-medium"><CalendarClock className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" /><span><span className="block">Próximas disputas</span><span className="block text-xs font-normal text-muted-foreground">Editais que ainda vão abrir</span></span></p>
        <div className="grid grid-cols-4 gap-1.5">{PROXIMAS_DISPUTAS.map(([de, ate, rotulo]) =>
          <button key={rotulo} role="menuitem" type="button" className={chip} onClick={() => escolher({ tipo: 'proximas', de, ate, portal: '' })}>{rotulo}</button>)}</div>
        <p className="px-1 pb-1.5 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Próximos 30 dias por portal</p>
        <div className="grid grid-cols-2 gap-1.5">{ATALHOS_PORTAIS.map((id) => {
          const p = PORTAIS.find((x) => x[0] === id)!
          return <button key={id} role="menuitem" type="button" title={p[1]} className={cn(chip, 'justify-start rounded-md px-2.5 py-1 text-left')} onClick={() => escolher({ tipo: 'proximas', de: 0, ate: 30, portal: id })}>
            <IconePortal id={id} nome={p[1]} /><span className="line-clamp-2 min-w-0 whitespace-normal leading-tight">{p[1]}</span>
          </button>
        })}</div>
      </div>}
      {localizar && <button role="menuitem" type="button" className={item} onClick={() => escolher({ tipo: 'localizar' })}>
        <Hash className="h-4 w-4 shrink-0 text-muted-foreground" /><span><span className="block font-medium">Localizar edital</span><span className="block text-xs text-muted-foreground">Pelo número, UASG, CNPJ ou link</span></span>
      </button>}
      {semVencedor && <button role="menuitem" type="button" className={item} onClick={() => escolher({ tipo: 'iminencia' })}>
        <Sparkles className="h-4 w-4 shrink-0 text-emerald-500" /><span><span className="block font-medium">Sem propostas ainda</span><span className="block text-xs text-muted-foreground">Portal de Compras Públicas: ninguém propôs até agora</span></span>
      </button>}
      {semVencedor && <button role="menuitem" type="button" className={item} onClick={() => escolher({ tipo: 'sem-vencedor', portal: '' })}>
        <TriangleAlert className="h-4 w-4 shrink-0 text-amber-500" /><span><span className="block font-medium">Itens sem vencedor</span><span className="block text-xs text-muted-foreground">Desertos e fracassados; o portal se escolhe dentro da aba</span></span>
      </button>}
    </div>}
  </div>
}
