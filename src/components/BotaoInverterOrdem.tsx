import { ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Botão que inverte a ordem de uma lista; mostra a ordem atual (ex.: "Mais recentes primeiro"). */
export default function BotaoInverterOrdem({ invertido, aoMudar, normal, inverso, className }: {
  invertido: boolean; aoMudar: (invertido: boolean) => void; normal: string; inverso: string; className?: string
}) {
  return (
    <button type="button" onClick={() => aoMudar(!invertido)} aria-pressed={invertido} title="Inverter a ordem da lista"
      className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors',
        invertido ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground', className)}>
      <ArrowUpDown className="h-4 w-4" />{invertido ? inverso : normal}
    </button>
  )
}
