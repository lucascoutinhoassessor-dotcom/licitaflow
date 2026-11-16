import type React from 'react'
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variante = 'primario' | 'secundario' | 'fantasma' | 'perigo' | 'contorno'
type Tamanho = 'sm' | 'md' | 'lg' | 'icone'

const variantes: Record<Variante, string> = {
  primario: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
  secundario: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  fantasma: 'hover:bg-muted text-foreground',
  perigo: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  contorno: 'border border-input bg-card hover:bg-muted text-foreground',
}
const tamanhos: Record<Tamanho, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-6 text-base',
  icone: 'h-9 w-9',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
  tamanho?: Tamanho
  carregando?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variante = 'primario', tamanho = 'md', carregando, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || carregando}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50',
        variantes[variante],
        tamanhos[tamanho],
        className,
      )}
      {...props}
    >
      {carregando && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm',
      'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
))
Input.displayName = 'Input'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
      className,
    )}
    {...props}
  />
))
Select.displayName = 'Select'

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[80px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm',
      'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export function Vazio({ icone: Icone, titulo, texto, acao }: { icone?: React.ComponentType<{ className?: string }>; titulo: string; texto?: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-14 text-center">
      {Icone && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Icone className="h-6 w-6 text-primary" />
        </div>
      )}
      <div className="font-medium">{titulo}</div>
      {texto && <p className="mt-1 max-w-md text-sm text-muted-foreground">{texto}</p>}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  )
}

export function Abas<T extends string>({ abas, atual, aoTrocar }: { abas: { id: T; rotulo: string; contagem?: number }[]; atual: T; aoTrocar: (id: T) => void }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
      {abas.map((a) => (
        <button
          key={a.id}
          role="tab"
          aria-selected={atual === a.id}
          onClick={() => aoTrocar(a.id)}
          className={cn(
            '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors',
            atual === a.id ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {a.rotulo}
          {a.contagem != null && <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{a.contagem}</span>}
        </button>
      ))}
    </div>
  )
}

export function Campo({ rotulo, erro, ajuda, htmlFor, children }: { rotulo: string; erro?: string; ajuda?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {rotulo}
      </label>
      {children}
      {erro ? <p className="text-xs text-destructive">{erro}</p> : ajuda ? <p className="text-xs text-muted-foreground">{ajuda}</p> : null}
    </div>
  )
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)} {...props} />
}

export function Badge({ className, cor = 'neutro', ...props }: HTMLAttributes<HTMLSpanElement> & { cor?: 'neutro' | 'azul' | 'verde' | 'amarelo' | 'vermelho' }) {
  const cores = {
    neutro: 'bg-muted text-muted-foreground',
    azul: 'bg-primary/10 text-primary',
    verde: 'bg-success/10 text-success',
    amarelo: 'bg-warning/15 text-warning',
    vermelho: 'bg-destructive/10 text-destructive',
  }
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', cores[cor], className)} {...props} />
}

export function Aviso({ tipo = 'erro', children }: { tipo?: 'erro' | 'sucesso' | 'info'; children: ReactNode }) {
  const estilos = {
    erro: 'border-destructive/30 bg-destructive/10 text-destructive',
    sucesso: 'border-success/30 bg-success/10 text-success',
    info: 'border-primary/30 bg-primary/10 text-primary',
  }
  return <div role={tipo === 'erro' ? 'alert' : 'status'} className={cn('rounded-md border px-3 py-2 text-sm', estilos[tipo])}>{children}</div>
}

export function Carregando({ texto = 'Carregando…', telaCheia }: { texto?: string; telaCheia?: boolean }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 text-sm text-muted-foreground', telaCheia ? 'h-full min-h-screen' : 'py-12')}>
      <Loader2 className="h-5 w-5 animate-spin" />
      {texto}
    </div>
  )
}

export function CabecalhoPagina({ titulo, descricao, acoes }: { titulo: string; descricao?: string; acoes?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  )
}

export function Modal({ aberto, aoFechar, titulo, children }: { aberto: boolean; aoFechar: () => void; titulo: string; children: ReactNode }) {
  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={aoFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="max-h-[92dvh] w-full min-w-0 overflow-y-auto overscroll-contain rounded-t-xl border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:max-w-lg sm:rounded-xl sm:p-6"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && aoFechar()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="min-w-0 break-words text-lg font-semibold">{titulo}</h2>
          <button onClick={aoFechar} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Fechar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Logo({ className, claro }: { className?: string; claro?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
      <img src="/favicon.svg" alt="" className="h-7 w-7" />
      <span className={cn('text-lg', claro && 'text-white')}>
        Licita<span className="text-accent">Flow</span>
      </span>
    </div>
  )
}
