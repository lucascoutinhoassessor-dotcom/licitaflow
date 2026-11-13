import { Badge } from '@/components/ui'
import { COR_ETAPA, ETAPAS, situacaoPrazo, situacaoValidade, type Etapa } from '@/lib/dominio'
import { diasAte } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useOrg } from '@/providers/OrgProvider'

export function BadgeEtapa({ etapa }: { etapa: Etapa }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
      <span className={cn('h-2 w-2 rounded-full', COR_ETAPA[etapa])} />
      {ETAPAS[etapa]}
    </span>
  )
}

export function BadgeValidade({ validade }: { validade: string | null }) {
  const s = situacaoValidade(validade)
  if (s === 'sem_validade') return <Badge>Sem validade</Badge>
  const d = diasAte(validade!)
  if (s === 'vencido') return <Badge cor="vermelho">Vencido há {Math.abs(d)}d</Badge>
  if (s === 'vence_em_breve') return <Badge cor="amarelo">{d === 0 ? 'Vence hoje' : `Vence em ${d}d`}</Badge>
  return <Badge cor="verde">Válido · {d}d</Badge>
}

export function BadgePrazo({ dataHora, concluido }: { dataHora: string; concluido: boolean }) {
  const s = situacaoPrazo(dataHora, concluido)
  const d = diasAte(dataHora)
  if (s === 'concluido') return <Badge cor="verde">Concluído</Badge>
  if (s === 'atrasado') return <Badge cor="vermelho">Atrasado</Badge>
  if (s === 'hoje') return <Badge cor="amarelo">Hoje</Badge>
  if (s === 'semana') return <Badge cor="azul">{d === 1 ? 'Amanhã' : `Em ${d} dias`}</Badge>
  return <Badge>Em {d} dias</Badge>
}

/** Select de empresa: só aparece quando a organização tem mais de uma. */
export function SeletorEmpresa({ valor, aoMudar, id = 'empresa' }: { valor: string; aoMudar: (v: string) => void; id?: string }) {
  const { empresas } = useOrg()
  if (empresas.length <= 1) return null
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        Empresa
      </label>
      <select
        id={id}
        required
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Selecione…</option>
        {empresas.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nome_fantasia || e.razao_social}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Empresa padrão para novos registros: a selecionada, ou a única existente. */
export function useEmpresaPadrao() {
  const { empresa, empresas } = useOrg()
  return empresa?.id ?? (empresas.length === 1 ? empresas[0].id : '')
}
