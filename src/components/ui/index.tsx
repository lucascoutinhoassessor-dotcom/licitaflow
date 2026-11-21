import type React from 'react'
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variante = 'primario' | 'secundario' | 'fantasma' | 'perigo' | 'contorno'
type Tamanho = 'sm' | 'md' | 'lg' | 'icone'

const variantes: Record<Variante, string> = {
  primario: 'lf-degrade border border-emerald-400/40 text-white font-semibold shadow-[0_18px_36px_-20px_rgba(16,185,129,0.65)] hover:brightness-110',
  secundario: 'border border-border bg-secondary text-secondary-foreground font-semibold hover:bg-secondary/80 dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-800 dark:to-slate-900',
  fantasma: 'hover:bg-muted text-foreground',
  perigo: 'bg-destructive text-destructive-foreground font-semibold hover:bg-destructive/90',
  contorno: 'border border-input bg-card hover:bg-muted text-foreground font-semibold',
}
const tamanhos: Record<Tamanho, string> = {
  sm: 'h-8 px-3.5 text-sm',
  md: 'h-10 px-5 text-sm',
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
        'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all',
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
      'flex h-10 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm',
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
      'flex h-10 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm',
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
      'flex min-h-[80px] w-full rounded-xl border border-input bg-card px-3 py-2 text-sm',
      'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export function Vazio({ icone: Icone, titulo, texto, acao }: { icone?: React.ComponentType<{ className?: string }>; titulo: string; texto?: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-14 text-center">
      {Icone && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-500/30">
          <Icone className="h-6 w-6 text-emerald-500 dark:text-emerald-400" />
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
    <div className="mb-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
      {abas.map((a) => (
        <button
          key={a.id}
          role="tab"
          aria-selected={atual === a.id}
          onClick={() => aoTrocar(a.id)}
          className={cn(
            'flex h-9 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
            atual === a.id ? 'border-primary bg-primary text-primary-foreground shadow-[0_10px_24px_-14px_hsl(var(--primary))]' : 'border-border bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          {a.rotulo}
          {a.contagem != null && <span className={cn('rounded-full px-1.5 text-xs tabular-nums', atual === a.id ? 'bg-white/20' : 'bg-muted')}>{a.contagem}</span>}
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
  return <div className={cn('lf-cartao rounded-2xl border bg-card text-card-foreground shadow-sm', className)} {...props} />
}

export function Badge({ className, cor = 'neutro', ...props }: HTMLAttributes<HTMLSpanElement> & { cor?: 'neutro' | 'azul' | 'verde' | 'amarelo' | 'vermelho' }) {
  const cores = {
    neutro: 'border-border bg-muted text-muted-foreground',
    azul: 'border-sky-600/50 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    verde: 'border-emerald-600/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    amarelo: 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    vermelho: 'border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  }
  return <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', cores[cor], className)} {...props} />
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
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  )
}

export function Modal({ aberto, aoFechar, titulo, children, largo }: { aberto: boolean; aoFechar: () => void; titulo: string; children: ReactNode; largo?: boolean }) {
  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={aoFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={cn('max-h-[92dvh] w-full min-w-0 overflow-y-auto overscroll-contain rounded-t-xl border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-xl sm:p-6', largo ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
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
