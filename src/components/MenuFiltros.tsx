import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, SlidersHorizontal, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Botão "Filtros" no mesmo formato do menu Atalhos. No computador abre uma janela centralizada na frente da tela;
 * no celular, uma gaveta de baixo para cima. O conteúdo vem em seções (SecaoFiltro) com chips (ChipFiltro).
 * `colunas={2}` divide as seções em duas colunas na janela do computador (telas com muitos filtros).
 * `children` pode ser uma função que recebe `fechar`, para botões do rodapé que aplicam e fecham.
 */
export default function MenuFiltros({ ativos = 0, rotulo = 'Filtros', titulo, icone: Icone = SlidersHorizontal, aoLimpar, rodape, children, colunas = 1, className }: {
  ativos?: number
  rotulo?: string
  /** Título da janela (padrão: o próprio rótulo do botão). */
  titulo?: string
  icone?: LucideIcon
  aoLimpar?: () => void
  rodape?: (fechar: () => void) => ReactNode
  children: ReactNode | ((fechar: () => void) => ReactNode)
  colunas?: 1 | 2
  className?: string
}) {
  const [aberto, setAberto] = useState(false)
  const botao = useRef<HTMLButtonElement>(null)
  const fechar = () => { setAberto(false); botao.current?.focus() }
  useEffect(() => {
    if (!aberto) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    // Trava a rolagem da página enquanto a janela está aberta.
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = antes }
  }, [aberto])

  return <div className={className}>
    <button ref={botao} type="button" aria-haspopup="dialog" aria-expanded={aberto} onClick={() => setAberto(true)}
      className={cn('inline-flex h-10 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full border bg-card px-4 text-sm font-semibold hover:bg-muted sm:w-auto', ativos > 0 && 'border-primary text-primary')}>
      <Icone className="h-4 w-4 shrink-0 text-sky-500" /><span className="truncate">{rotulo}</span>
      {ativos > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">{ativos}</span>}
      <ChevronDown className={cn('h-4 w-4 transition-transform', aberto && 'rotate-180')} />
    </button>
    {aberto && createPortal(<div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
    <div aria-hidden className="absolute inset-0 bg-black/60 sm:backdrop-blur-[2px]" onClick={fechar} />
    <div role="dialog" aria-modal="true" aria-label={titulo ?? rotulo} className={cn('relative flex max-h-[85dvh] w-full flex-col rounded-t-2xl border-t bg-card text-left text-card-foreground shadow-2xl sm:max-h-[85vh] sm:rounded-2xl sm:border', colunas === 2 ? 'sm:max-w-4xl' : 'sm:max-w-lg')}>
      <div className="px-2 pt-2 sm:border-b sm:px-4 sm:py-3">
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-muted sm:hidden" aria-hidden />
        <div className="flex items-center justify-between pb-1 pl-3 sm:p-0">
          <p className="flex items-center gap-2 text-base font-semibold sm:text-lg"><Icone className="hidden h-5 w-5 text-sky-500 sm:block" />{titulo ?? rotulo}</p>
          <button type="button" aria-label={`Fechar ${(titulo ?? rotulo).toLowerCase()}`} onClick={fechar} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
      </div>
      <div className={cn('min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2 sm:p-4', colunas === 2 && 'sm:columns-2 sm:gap-3 sm:space-y-0 sm:[&>*]:mb-3 sm:[&>*]:break-inside-avoid')}>{typeof children === 'function' ? children(fechar) : children}</div>
      {(aoLimpar || rodape) && <div className="flex items-center gap-2 border-t p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:px-4 sm:py-3">
        {aoLimpar && <button type="button" disabled={!ativos} onClick={aoLimpar} className="inline-flex h-10 items-center rounded-full px-3 text-sm font-semibold text-rose-500 hover:bg-rose-500/10 disabled:pointer-events-none disabled:opacity-40 sm:h-9">Limpar filtros</button>}
        <div className="ml-auto flex items-center gap-2">{rodape ? rodape(fechar) : <button type="button" onClick={fechar} className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:h-9">Pronto</button>}</div>
      </div>}
    </div>
    </div>, document.body)}
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
