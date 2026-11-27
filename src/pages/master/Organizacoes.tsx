import { useCatalogoPlanos } from '@/hooks/useCatalogoPlanos'
import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Circle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensagemErro } from '@/lib/supabase'
import { diasAte, formatarData } from '@/lib/format'
import { Badge, Button, Campo, Input, Select } from '@/components/ui'

export interface OrgAdmin {
  id: string
  nome: string
  tipo: string
  plano: string
  trial_ate: string
  suspensa: boolean
  motivo_suspensao: string | null
  notas_admin: string | null
  created_at: string
  dono_email: string | null
  dono_nome: string | null
  membros: number
  empresas: number
  processos: number
  documentos: number
  contratos: number
  tem_palavras_chave: boolean
  ultima_atividade: string | null
}

const PLANOS = ['trial', 'essencial', 'profissional', 'assessoria', 'cancelado']
const NOME_PLANO: Record<string, string> = { trial: 'Teste', essencial: 'Essencial', profissional: 'Profissional', assessoria: 'Assessoria', cancelado: 'Cancelado' }

/** Progresso de implantação da conta (o "desenvolvimento" do cliente dentro da plataforma). */
export function progresso(o: OrgAdmin) {
  const passos = [
    { rotulo: 'Empresa cadastrada', ok: o.empresas > 0 },
    { rotulo: 'Perfil do Radar (palavras-chave)', ok: o.tem_palavras_chave },
    { rotulo: 'Equipe convidada', ok: o.membros > 1 },
    { rotulo: 'Primeiro processo', ok: o.processos > 0 },
    { rotulo: 'Documentos cadastrados', ok: o.documentos > 0 },
    { rotulo: 'Contrato no pós-pregão', ok: o.contratos > 0 },
  ]
  return { passos, pct: Math.round((passos.filter((p) => p.ok).length / passos.length) * 100) }
}

export function statusOrg(o: OrgAdmin) {
  if (o.suspensa) return <Badge cor="vermelho">Suspensa</Badge>
  if (o.plano === 'trial') {
    const d = diasAte(o.trial_ate)
    if (d < 0) return <Badge cor="vermelho">Teste vencido</Badge>
    if (d <= 3) return <Badge cor="amarelo">Teste · {d}d</Badge>
    return <Badge>Teste · {d}d</Badge>
  }
  if (o.plano === 'cancelado') return <Badge>Cancelado</Badge>
  return <Badge cor="verde">{NOME_PLANO[o.plano] ?? o.plano}</Badge>
}

export function EditarOrg({ org, aoFechar }: { org: OrgAdmin; aoFechar: () => void }) {
  const qc = useQueryClient()
  const catalogo = useCatalogoPlanos()
  const planos = catalogo.data?.length ? catalogo.data : [...new Set([...PLANOS, org.plano])].map(id => ({id,nome:NOME_PLANO[id] ?? id}))
  const [plano, setPlano] = useState(org.plano)
  const [trial, setTrial] = useState(org.trial_ate)
  const [suspensa, setSuspensa] = useState(org.suspensa)
  const [motivo, setMotivo] = useState(org.motivo_suspensao ?? '')
  const [notas, setNotas] = useState(org.notas_admin ?? '')
  const [salvando, setSalvando] = useState(false)
  const { passos, pct } = progresso(org)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (suspensa && !org.suspensa && !confirm(`Suspender ${org.nome}? Todos os membros perdem o acesso aos dados até a reativação.`)) return
    setSalvando(true)
    const { error } = await supabase.rpc('admin_atualizar_org', {
      p_org: org.id,
      p_plano: plano,
      p_trial_ate: trial,
      p_suspensa: suspensa,
      p_motivo: motivo,
      p_notas: notas,
    })
    setSalvando(false)
    if (error) return toast.error(mensagemErro(error))
    toast.success('Organização atualizada.')
    qc.invalidateQueries({ queryKey: ['admin-orgs'] })
    qc.invalidateQueries({ queryKey: ['admin-resumo'] })
    aoFechar()
  }

  const estenderTrial = (dias: number) => {
    const base = diasAte(trial) < 0 ? new Date() : new Date(`${trial}T00:00:00`)
    base.setDate(base.getDate() + dias)
    setTrial(base.toISOString().slice(0, 10))
  }

  return (
    <form onSubmit={salvar} className="space-y-5">
      <div className="rounded-md bg-muted/60 p-3 text-sm">
        <div className="font-medium">{org.dono_nome || org.dono_email}</div>
        <div className="text-muted-foreground">{org.dono_email} · {org.tipo === 'assessoria' ? 'Assessoria' : 'Fornecedor'} · desde {formatarData(org.created_at)}</div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">Implantação da conta</span>
          <span className="tabular-nums text-muted-foreground">{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted">
          <div className="h-2 rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
          {passos.map((p) => (
            <li key={p.rotulo} className="flex items-center gap-2">
              {p.ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
              <span className={p.ok ? '' : 'text-muted-foreground'}>{p.rotulo}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Plano" htmlFor="plano">
          <Select id="plano" value={plano} onChange={(e) => setPlano(e.target.value)}>
            {planos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo rotulo="Teste grátis até" htmlFor="trial">
          <Input id="trial" type="date" value={trial} onChange={(e) => setTrial(e.target.value)} />
        </Campo>
      </div>
      <div className="flex flex-wrap gap-2">
        {[7, 14, 30].map((d) => (
          <Button key={d} type="button" tamanho="sm" variante="contorno" onClick={() => estenderTrial(d)}>
            +{d} dias de teste
          </Button>
        ))}
      </div>

      <label className="flex items-start gap-3 rounded-md border p-3">
        <input type="checkbox" className="mt-1" checked={suspensa} onChange={(e) => setSuspensa(e.target.checked)} />
        <span>
          <span className="block text-sm font-medium">Suspender acesso</span>
          <span className="block text-xs text-muted-foreground">Os dados ficam preservados; os membros veem um aviso e não acessam nada até a reativação.</span>
        </span>
      </label>
      {suspensa && (
        <Campo rotulo="Motivo (aparece para o cliente)" htmlFor="motivo">
          <Input id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ex.: pagamento pendente" />
        </Campo>
      )}
      <Campo rotulo="Notas internas (só o master vê)" htmlFor="notas">
        <textarea id="notas" rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </Campo>
      <Button type="submit" className="w-full" carregando={salvando}>
        Salvar alterações
      </Button>
    </form>
  )
}
