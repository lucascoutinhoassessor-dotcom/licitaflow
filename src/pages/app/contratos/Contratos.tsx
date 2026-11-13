import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { FileSignature, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, CabecalhoPagina, Campo, Card, Carregando, Input, Modal, Select, Textarea, Vazio } from '@/components/ui'
import { SeletorEmpresa, useEmpresaPadrao } from '@/components/Situacoes'
import { STATUS_CONTRATO, TIPOS_CONTRATO } from '@/lib/dominio'
import { diasAte, formatarData, formatarMoeda } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { useLista, useNomeEmpresa, useSalvar } from '@/hooks/useDados'
import { useOrg } from '@/providers/OrgProvider'
import type { Contrato, Empenho, Processo } from '@/types/db'

const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(/\./g, '').replace(',', '.')))

export function ContratoForm({ contrato, processo, aoSalvar }: { contrato?: Contrato; processo?: Processo | null; aoSalvar: (c: Contrato) => void }) {
  const padrao = useEmpresaPadrao()
  const [f, setF] = useState({
    empresa_id: contrato?.empresa_id ?? processo?.empresa_id ?? padrao,
    processo_id: contrato?.processo_id ?? processo?.id ?? '',
    tipo: contrato?.tipo ?? (processo?.modalidade === 'dispensa_eletronica' ? 'empenho_direto' : 'contrato'),
    numero: contrato?.numero ?? '',
    orgao_nome: contrato?.orgao_nome ?? processo?.orgao_nome ?? '',
    orgao_cnpj: contrato?.orgao_cnpj ?? processo?.orgao_cnpj ?? '',
    objeto: contrato?.objeto ?? processo?.objeto ?? '',
    valor_total: contrato?.valor_total != null ? String(contrato.valor_total).replace('.', ',') : processo?.valor_adjudicado != null ? String(processo.valor_adjudicado).replace('.', ',') : '',
    inicio_vigencia: contrato?.inicio_vigencia ?? '',
    fim_vigencia: contrato?.fim_vigencia ?? '',
    status: contrato?.status ?? 'ativo',
    gestor_orgao: contrato?.gestor_orgao ?? '',
    observacoes: contrato?.observacoes ?? '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  const { salvar } = useSalvar('contratos', ['prazos'])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!f.empresa_id) return toast.error('Selecione a empresa.')
    const c = (await salvar.mutateAsync({ id: contrato?.id, dados: { ...f, valor_total: num(f.valor_total) } })) as Contrato
    // Fim de vigência vira prazo automático (uma vez, ao criar)
    if (!contrato && c.fim_vigencia) {
      await supabase.from('prazos').insert({
        org_id: c.org_id,
        empresa_id: c.empresa_id,
        contrato_id: c.id,
        tipo: 'vigencia',
        titulo: `Fim de vigência · ${TIPOS_CONTRATO[c.tipo]} ${c.numero ?? ''}`.trim(),
        data_hora: new Date(`${c.fim_vigencia}T09:00:00`).toISOString(),
        origem: 'sistema',
      })
    }
    toast.success(contrato ? 'Contrato atualizado.' : 'Contrato cadastrado.')
    aoSalvar(c)
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      {!contrato && !processo && <SeletorEmpresa valor={f.empresa_id} aoMudar={(v) => setF((x) => ({ ...x, empresa_id: v }))} id="ct-empresa" />}
      {processo && <div className="rounded-md bg-muted/60 px-3 py-2 text-sm">Vinculado ao processo: <strong>{processo.numero ? `${processo.numero} · ` : ''}{processo.objeto}</strong></div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Tipo" htmlFor="ct-tipo">
          <Select id="ct-tipo" value={f.tipo} onChange={set('tipo')}>
            {Object.entries(TIPOS_CONTRATO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Campo>
        <Campo rotulo="Número" htmlFor="ct-num">
          <Input id="ct-num" value={f.numero} onChange={set('numero')} placeholder="ex.: 045/2026" />
        </Campo>
      </div>
      <Campo rotulo="Órgão" htmlFor="ct-orgao">
        <Input id="ct-orgao" value={f.orgao_nome} onChange={set('orgao_nome')} />
      </Campo>
      <Campo rotulo="Objeto" htmlFor="ct-obj">
        <Textarea id="ct-obj" rows={2} value={f.objeto} onChange={set('objeto')} />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="Valor total (R$)" htmlFor="ct-valor">
          <Input id="ct-valor" inputMode="decimal" value={f.valor_total} onChange={set('valor_total')} placeholder="0,00" />
        </Campo>
        <Campo rotulo="Início da vigência" htmlFor="ct-ini">
          <Input id="ct-ini" type="date" value={f.inicio_vigencia} onChange={set('inicio_vigencia')} />
        </Campo>
        <Campo rotulo="Fim da vigência" htmlFor="ct-fim">
          <Input id="ct-fim" type="date" value={f.fim_vigencia} onChange={set('fim_vigencia')} />
        </Campo>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Status" htmlFor="ct-status">
          <Select id="ct-status" value={f.status} onChange={set('status')}>
            {Object.entries(STATUS_CONTRATO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Campo>
        <Campo rotulo="Gestor/fiscal no órgão" htmlFor="ct-gestor">
          <Input id="ct-gestor" value={f.gestor_orgao} onChange={set('gestor_orgao')} />
        </Campo>
      </div>
      <Campo rotulo="Observações" htmlFor="ct-obs">
        <Textarea id="ct-obs" rows={2} value={f.observacoes} onChange={set('observacoes')} />
      </Campo>
      <Button type="submit" className="w-full" carregando={salvar.isPending}>{contrato ? 'Salvar contrato' : 'Cadastrar contrato'}</Button>
    </form>
  )
}

export function BadgeVigencia({ c }: { c: Contrato }) {
  if (c.status !== 'ativo') return <Badge>{STATUS_CONTRATO[c.status]}</Badge>
  if (!c.fim_vigencia) return <Badge cor="verde">Ativo</Badge>
  const d = diasAte(c.fim_vigencia)
  if (d < 0) return <Badge cor="vermelho">Vigência encerrada</Badge>
  if (d <= 30) return <Badge cor="amarelo">Vence em {d}d</Badge>
  return <Badge cor="verde">Ativo · até {formatarData(c.fim_vigencia)}</Badge>
}

export default function Contratos() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { podeEditar, empresa, empresas } = useOrg()
  const nomeEmpresa = useNomeEmpresa()
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('ativo')
  const [novo, setNovo] = useState(false)
  const [processo, setProcesso] = useState<Processo | null>(null)
  const q = useLista<Contrato>('contratos', { ordem: ['fim_vigencia', true] })
  const empenhos = useLista<Empenho>('empenhos', { porEmpresa: false })
  const mostrarEmpresa = !empresa && empresas.length > 1

  // Vindo de um processo ganho: abre o formulário já preenchido
  useEffect(() => {
    const pid = params.get('processo')
    if (!pid) return
    supabase.from('processos').select('*').eq('id', pid).maybeSingle().then(({ data }) => {
      if (data) {
        setProcesso(data as Processo)
        setNovo(true)
      }
      setParams({}, { replace: true })
    })
  }, [params, setParams])

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return (q.data ?? []).filter((c) => (!status || c.status === status) && (!t || `${c.numero} ${c.orgao_nome} ${c.objeto}`.toLowerCase().includes(t)))
  }, [q.data, busca, status])

  const executado = (id: string) => (empenhos.data ?? []).filter((e) => e.contrato_id === id && e.status !== 'cancelado').reduce((a, e) => a + Number(e.valor), 0)

  return (
    <>
      <CabecalhoPagina
        titulo="Contratos e atas"
        descricao="Pós-pregão sob controle: vigências, saldos, empenhos, entregas e faturamento."
        acoes={podeEditar && <Button onClick={() => { setProcesso(null); setNovo(true) }}><Plus className="h-4 w-4" /> Novo contrato</Button>}
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por número, órgão ou objeto" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select className="sm:w-48" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Todos</option>
          {Object.entries(STATUS_CONTRATO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>

      {q.isLoading ? (
        <Carregando />
      ) : (q.data?.length ?? 0) === 0 ? (
        <Vazio
          icone={FileSignature}
          titulo="Nenhum contrato ainda"
          texto="Quando ganhar um processo, cadastre o contrato, a ata de registro de preço ou o empenho direto para acompanhar saldo, entregas e pagamentos."
          acao={podeEditar && <Button onClick={() => setNovo(true)}><Plus className="h-4 w-4" /> Novo contrato</Button>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {lista.map((c) => {
            const exec = executado(c.id)
            const pct = c.valor_total ? Math.min(100, (exec / c.valor_total) * 100) : 0
            return (
              <Link key={c.id} to={`/app/contratos/${c.id}`}>
                <Card className="h-full p-5 transition hover:border-primary/40 hover:shadow">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs text-muted-foreground">{TIPOS_CONTRATO[c.tipo]}{c.numero ? ` · ${c.numero}` : ''}</div>
                    <BadgeVigencia c={c} />
                  </div>
                  <div className="mt-1 line-clamp-2 font-medium">{c.objeto || 'Sem objeto'}</div>
                  <div className="mt-1 truncate text-sm text-muted-foreground">{c.orgao_nome}{mostrarEmpresa ? ` · ${nomeEmpresa(c.empresa_id)}` : ''}</div>
                  <div className="mt-4 flex justify-between text-xs text-muted-foreground">
                    <span>Empenhado {formatarMoeda(exec)}</span>
                    <span>de {formatarMoeda(c.valor_total)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted">
                    <div className="h-1.5 rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                </Card>
              </Link>
            )
          })}
          {lista.length === 0 && <div className="col-span-full p-8 text-center text-sm text-muted-foreground">Nenhum contrato com esses filtros.</div>}
        </div>
      )}

      <Modal aberto={novo} aoFechar={() => setNovo(false)} titulo="Novo contrato">
        {novo && <ContratoForm processo={processo} aoSalvar={(c) => { setNovo(false); navigate(`/app/contratos/${c.id}`) }} />}
      </Modal>
    </>
  )
}
