import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, SlidersHorizontal, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Botão "Filtros" no mesmo formato do menu Atalhos: no computador abre suspenso sob o botão;
 * no celular, como gaveta de baixo para cima. O conteúdo vem em seções (SecaoFiltro) com chips (ChipFiltro).
 * `children` pode ser uma função que recebe `fechar`, para botões do rodapé que aplicam e fecham.
 */
export default function MenuFiltros({ ativos = 0, rotulo = 'Filtros', aoLimpar, rodape, children, largura = 'sm:w-[26rem]', className, alinhar = 'direita' }: {
  ativos?: number
  rotulo?: string
  aoLimpar?: () => void
  rodape?: (fechar: () => void) => ReactNode
  children: ReactNode | ((fechar: () => void) => ReactNode)
  largura?: string
  className?: string
  alinhar?: 'direita' | 'esquerda'
}) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const fora = (e: PointerEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('pointerdown', fora); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])
  const fechar = () => setAberto(false)

  return <div ref={caixa} className={cn('relative', className)}>
    <button type="button" aria-haspopup="dialog" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}
      className={cn('inline-flex h-10 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full border bg-card px-4 text-sm font-semibold hover:bg-muted sm:w-auto', ativos > 0 && 'border-primary text-primary')}>
      <SlidersHorizontal className="h-4 w-4 text-sky-500" />{rotulo}
      {ativos > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">{ativos}</span>}
      <ChevronDown className={cn('h-4 w-4 transition-transform', aberto && 'rotate-180')} />
    </button>
    {aberto && <div aria-hidden className="fixed inset-0 z-50 bg-black/50 sm:hidden" onClick={fechar} />}
    {aberto && <div role="dialog" aria-label={rotulo} className={cn('fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl border-t bg-card text-left text-card-foreground shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:z-30 sm:mt-2 sm:max-h-[70vh] sm:rounded-xl sm:border sm:shadow-lg', alinhar === 'direita' ? 'sm:right-0' : 'sm:left-0', largura)}>
      <div className="px-2 pt-2 sm:hidden">
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-muted" aria-hidden />
        <div className="flex items-center justify-between pb-1 pl-3">
          <p className="text-base font-semibold">{rotulo}</p>
          <button type="button" aria-label={`Fechar ${rotulo.toLowerCase()}`} onClick={fechar} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2 sm:p-1.5">{typeof children === 'function' ? children(fechar) : children}</div>
      {(aoLimpar || rodape) && <div className="flex items-center gap-2 border-t p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:pb-2">
        {aoLimpar && <button type="button" disabled={!ativos} onClick={aoLimpar} className="inline-flex h-10 items-center rounded-full px-3 text-sm font-semibold text-rose-500 hover:bg-rose-500/10 disabled:pointer-events-none disabled:opacity-40 sm:h-9">Limpar filtros</button>}
        <div className="ml-auto flex items-center gap-2">{rodape ? rodape(fechar) : <button type="button" onClick={fechar} className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:h-9">Pronto</button>}</div>
      </div>}
    </div>}
  </div>
}

const CORES = {
  verde: ['border-emerald-500/30 bg-emerald-500/5', 'text-emerald-600 dark:text-emerald-400'],
  azul: ['border-sky-500/30 bg-sky-500/5', 'text-sky-600 dark:text-sky-400'],
  ambar: ['border-amber-500/30 bg-amber-500/5', 'text-amber-600 dark:text-amber-400'],
  violeta: ['border-violet-500/30 bg-violet-500/5', 'text-violet-600 dark:text-violet-400'],
  rosa: ['border-rose-500/30 bg-rose-500/5', 'text-rose-600 dark:text-rose-400'],
  neutro: ['bg-muted/30', 'text-muted-foreground'],
} as const

/** Bloco colorido de um grupo de filtros, igual ao "Próximas disputas" dos Atalhos. */
export function SecaoFiltro({ icone: Icone, titulo, descricao, cor = 'neutro', acao, children }: { icone: LucideIcon; titulo: string; descricao?: string; cor?: keyof typeof CORES; acao?: ReactNode; children: ReactNode }) {
  const [caixa, tom] = CORES[cor]
  return <div className={cn('rounded-lg border p-2', caixa)}>
    <div className="flex items-start gap-2 px-1 pb-2">
      <Icone className={cn('mt-0.5 h-4 w-4 shrink-0', tom)} />
      <p className="min-w-0 flex-1 text-sm font-medium"><span className="block">{titulo}</span>{descricao && <span className="block text-xs font-normal text-muted-foreground">{descricao}</span>}</p>
      {acao}
    </div>
    {children}
  </div>
}

/** Subtítulo dentro de uma seção (ex.: "Próximos 30 dias por portal"). */
export function SubtituloFiltro({ children }: { children: ReactNode }) {
  return <p className="px-1 pb-1.5 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>
}

/** Chip que liga/desliga uma opção do filtro. */
export function ChipFiltro({ ativo, onClick, children, className, title, disabled }: { ativo: boolean; onClick: () => void; children: ReactNode; className?: string; title?: string; disabled?: boolean }) {
  return <button type="button" aria-pressed={ativo} title={title} disabled={disabled} onClick={onClick}
    className={cn('flex min-h-10 items-center justify-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:border-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-8',
      ativo ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:border-primary hover:bg-primary/10', className)}>{children}</button>
}

/** Link discreto de ação dentro de uma seção (ex.: "Marcar todos"). */
export function AcaoSecao({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className="shrink-0 text-xs font-semibold text-primary hover:underline">{children}</button>
}
