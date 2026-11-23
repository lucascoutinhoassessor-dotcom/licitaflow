import { cn } from '@/lib/utils'
import { ROTULOS, corDoEstado, detalheDoEstado, visivelNoCartao, type StatusAgente } from '@/lib/agentesProcesso'

const COR = {
  verde: { texto: 'text-emerald-600 dark:text-emerald-400', ponto: 'bg-emerald-500', onda: 'bg-emerald-500/60' },
  azul: { texto: 'text-sky-600 dark:text-sky-400', ponto: 'bg-sky-500', onda: '' },
  ambar: { texto: 'text-amber-600 dark:text-amber-400', ponto: 'bg-amber-500', onda: '' },
  cinza: { texto: 'text-muted-foreground', ponto: 'bg-muted-foreground', onda: '' },
}

function Selo({ agente, s }: { agente: string; s: StatusAgente }) {
  const cor = COR[corDoEstado(s.estado)]
  const rotulo = ROTULOS[agente]?.[s.estado] ?? s.motivo
  const detalhe = detalheDoEstado(s)
  return (
    <div className={cn('flex items-start gap-1.5 text-[11px] font-medium', cor.texto)} title={detalhe}>
      <span className="relative mt-[3px] flex h-2 w-2 shrink-0">
        {s.estado === 'ativo' && cor.onda && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full', cor.onda)} />}
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', cor.ponto)} />
      </span>
      <span className="min-w-0">
        {rotulo}
        {s.estado !== 'ativo' && s.motivo && s.motivo !== rotulo && <span className="block font-normal text-muted-foreground">{s.motivo}</span>}
      </span>
    </div>
  )
}

/** Selos dos agentes no cartão: mostra só o que está trabalhando, na fila ou com problema (com o motivo). */
export function StatusAgentes({ estados, className }: { estados?: Record<string, StatusAgente>; className?: string }) {
  const visiveis = Object.entries(estados ?? {}).filter(([, s]) => visivelNoCartao(s))
  if (!visiveis.length) return null
  return <div className={cn('mt-2 space-y-1', className)}>{visiveis.map(([a, s]) => <Selo key={a} agente={a} s={s} />)}</div>
}
