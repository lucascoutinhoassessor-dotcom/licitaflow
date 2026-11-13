import { useMemo, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Circle, Search } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensagemErro } from '@/lib/supabase'
import { diasAte, formatarData, formatarDataHora } from '@/lib/format'
import { Aviso, Badge, Button, CabecalhoPagina, Campo, Card, Carregando, Input, Modal, Select } from '@/components/ui'

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

function statusOrg(o: OrgAdmin) {
  if (o.suspensa) return <Badge cor="vermelho">Suspensa</Badge>
  if (o.plano === 'trial') {
    const d = diasAte(o.trial_ate)
    if (d < 0) return <Badge cor="vermelho">Teste vencido</Badge>
    if (d <= 3) return <Badge cor="amarelo">Teste · {d}d</Badge>
    return <Badge>Teste · {d}d</Badge>
  }
  if (o.plano === 'cancelado') return <Badge>Cancelado</Badge>
  return <Badge cor="verde">{NOME_PLANO[o.plano]}</Badge>
}

function EditarOrg({ org, aoFechar }: { org: OrgAdmin; aoFechar: () => void }) {
  const qc = useQueryClient()
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
            {PLANOS.map((p) => (
              <option key={p} value={p}>
                {NOME_PLANO[p]}
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

export default function Organizacoes() {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('todas')
  const [editando, setEditando] = useState<OrgAdmin | null>(null)

  const q = useQuery({
    queryKey: ['admin-orgs'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_organizacoes')
      if (error) throw error
      return data as OrgAdmin[]
    },
  })

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return (q.data ?? []).filter((o) => {
      if (t && !`${o.nome} ${o.dono_email} ${o.dono_nome}`.toLowerCase().includes(t)) return false
      if (filtro === 'suspensas') return o.suspensa
      if (filtro === 'trial') return o.plano === 'trial' && !o.suspensa
      if (filtro === 'vencidos') return o.plano === 'trial' && diasAte(o.trial_ate) < 0
      if (filtro === 'pagantes') return ['essencial', 'profissional', 'assessoria'].includes(o.plano)
      return true
    })
  }, [q.data, busca, filtro])

  return (
    <>
      <CabecalhoPagina titulo="Organizações" descricao="Todas as contas clientes: plano, teste grátis, uso e implantação." />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome ou e-mail do dono" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select className="sm:w-48" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtro">
          <option value="todas">Todas</option>
          <option value="trial">Em teste</option>
          <option value="vencidos">Teste vencido</option>
          <option value="pagantes">Pagantes</option>
          <option value="suspensas">Suspensas</option>
        </Select>
      </div>

      {q.isLoading && <Carregando />}
      {q.error && <Aviso>{(q.error as Error).message}</Aviso>}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Organização</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Implantação</th>
                <th className="px-4 py-3 text-right font-medium">Uso</th>
                <th className="px-4 py-3 font-medium">Última atividade</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lista.map((o) => {
                const { pct } = progresso(o)
                return (
                  <tr key={o.id} onClick={() => setEditando(o)} className="cursor-pointer hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <div className="font-medium">{o.nome}</div>
                      <div className="text-xs text-muted-foreground">{o.dono_email} · {o.tipo === 'assessoria' ? 'assessoria' : 'fornecedor'}</div>
                    </td>
                    <td className="px-4 py-3">{statusOrg(o)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-muted">
                          <div className="h-1.5 rounded-full bg-accent" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">
                      {o.membros} memb. · {o.empresas} emp. · {o.processos} proc.
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatarDataHora(o.ultima_atividade)}</td>
                  </tr>
                )
              })}
              {!q.isLoading && lista.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhuma organização encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal aberto={!!editando} aoFechar={() => setEditando(null)} titulo={editando?.nome ?? ''}>
        {editando && <EditarOrg org={editando} aoFechar={() => setEditando(null)} />}
      </Modal>
    </>
  )
}
