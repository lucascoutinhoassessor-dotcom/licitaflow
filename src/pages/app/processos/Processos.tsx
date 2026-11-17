import { useMemo, useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarClock, Gavel, KanbanSquare, List, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, CabecalhoPagina, Card, Carregando, Input, Modal, Select, Vazio } from '@/components/ui'
import { BadgeEtapa } from '@/components/Situacoes'
import { COR_ETAPA, ETAPAS, ETAPAS_ATIVAS, ETAPAS_FINAIS, MODALIDADES, type Etapa } from '@/lib/dominio'
import { formatarDataHora, formatarMoeda } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useLista, useNomeEmpresa, useSalvar } from '@/hooks/useDados'
import { useOrg } from '@/providers/OrgProvider'
import type { Processo } from '@/types/db'
import { ProcessoForm } from './ProcessoForm'

function lerVisao(): 'kanban' | 'lista' {
  try {
    return localStorage.getItem('lf-visao-processos') === 'lista' ? 'lista' : 'kanban'
  } catch {
    return 'kanban'
  }
}

function CartaoProcesso({ p, arrastavel, nomeEmpresa }: { p: Processo; arrastavel?: boolean; nomeEmpresa?: string }) {
  return (
    <Link
      to={`/app/processos/${p.id}`}
      draggable={arrastavel}
      onDragStart={(e) => e.dataTransfer.setData('text/processo', p.id)}
      className="block rounded-lg border bg-card p-3 shadow-sm transition hover:border-primary/40 hover:shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {MODALIDADES[p.modalidade]}
          {p.numero ? ` · ${p.numero}` : ''}
        </div>
        {p.prioridade === 'alta' && <Badge cor="vermelho">Alta</Badge>}
      </div>
      <div className="mt-1 line-clamp-2 text-sm font-medium">{p.objeto}</div>
      {p.orgao_nome && <div className="mt-1 truncate text-xs text-muted-foreground">{p.orgao_nome}</div>}
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {p.data_abertura ? (
          <span className="flex items-center gap-1">
            <CalendarClock className="h-3 w-3" /> {formatarDataHora(p.data_abertura)}
          </span>
        ) : (
          <span />
        )}
        {p.valor_estimado != null && <span className="tabular-nums">{formatarMoeda(p.valor_estimado)}</span>}
      </div>
      {nomeEmpresa && <div className="mt-2 truncate border-t pt-2 text-[11px] text-muted-foreground">{nomeEmpresa}</div>}
    </Link>
  )
}

export default function Processos() {
  const navigate = useNavigate()
  const { podeEditar, empresa, empresas } = useOrg()
  const nomeEmpresa = useNomeEmpresa()
  const [visao, setVisao] = useState(lerVisao)
  const [novo, setNovo] = useState(false)
  const [busca, setBusca] = useState('')
  const [modalidade, setModalidade] = useState('')
  const [mostrarFinais, setMostrarFinais] = useState(false)
  const [sobre, setSobre] = useState<Etapa | null>(null)
  const q = useLista<Processo>('processos', { ordem: ['data_abertura', true] })
  const { salvar } = useSalvar('processos', ['processo_eventos'])
  const mostrarEmpresa = !empresa && empresas.length > 1

  const trocarVisao = (v: 'kanban' | 'lista') => {
    setVisao(v)
    try {
      localStorage.setItem('lf-visao-processos', v)
    } catch {
      /* armazenamento indisponível */
    }
  }

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return (q.data ?? []).filter(
      (p) =>
        (!modalidade || p.modalidade === modalidade) &&
        (!t || `${p.objeto} ${p.orgao_nome} ${p.numero} ${p.uasg}`.toLowerCase().includes(t)),
    )
  }, [q.data, busca, modalidade])

  const colunas = mostrarFinais ? [...ETAPAS_ATIVAS, ...ETAPAS_FINAIS] : ETAPAS_ATIVAS

  async function mover(id: string, etapa: Etapa) {
    const p = q.data?.find((x) => x.id === id)
    if (!p || p.etapa === etapa) return
    await salvar.mutateAsync({ id, dados: { etapa } })
    toast.success(`Movido para ${ETAPAS[etapa]}.`)
  }

  const soltar = (etapa: Etapa) => (e: DragEvent) => {
    e.preventDefault()
    setSobre(null)
    const id = e.dataTransfer.getData('text/processo')
    if (id && podeEditar) mover(id, etapa)
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Processos"
        descricao="Pregões, dispensas e demais licitações que sua equipe está acompanhando."
        acoes={
          podeEditar && (
            <Button onClick={() => setNovo(true)}>
              <Plus className="h-4 w-4" /> Novo processo
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por objeto, órgão, número ou UASG" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select className="sm:w-52" value={modalidade} onChange={(e) => setModalidade(e.target.value)} aria-label="Modalidade">
          <option value="">Todas as modalidades</option>
          {Object.entries(MODALIDADES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <div className="flex rounded-md border bg-card p-0.5">
          {[
            ['kanban', KanbanSquare, 'Kanban'],
            ['lista', List, 'Lista'],
          ].map(([v, Ic, r]) => {
            const Icone = Ic as typeof List
            return (
              <button
                key={v as string}
                onClick={() => trocarVisao(v as 'kanban' | 'lista')}
                className={cn('flex items-center gap-1.5 rounded px-3 py-1.5 text-sm', visao === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                <Icone className="h-4 w-4" /> {r as string}
              </button>
            )
          })}
        </div>
      </div>

      {q.isLoading ? (
        <Carregando />
      ) : (q.data?.length ?? 0) === 0 ? (
        <Vazio
          icone={Gavel}
          titulo="Nenhum processo ainda"
          texto="Cadastre um processo ou busque publicações em Oportunidades para importar os editais de interesse."
          acao={podeEditar && <Button onClick={() => setNovo(true)}><Plus className="h-4 w-4" /> Novo processo</Button>}
        />
      ) : visao === 'kanban' ? (
        <>
          <label className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={mostrarFinais} onChange={(e) => setMostrarFinais(e.target.checked)} /> Mostrar ganhos, perdidos e desistências
          </label>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 lg:-mx-8 lg:px-8">
            {colunas.map((etapa) => {
              const itens = lista.filter((p) => p.etapa === etapa)
              const total = itens.reduce((a, p) => a + (p.valor_estimado ?? 0), 0)
              return (
                <div
                  key={etapa}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setSobre(etapa)
                  }}
                  onDragLeave={() => setSobre(null)}
                  onDrop={soltar(etapa)}
                  className={cn('flex w-72 shrink-0 flex-col rounded-xl bg-muted/50 p-2 transition-colors', sobre === etapa && 'bg-primary/10 ring-2 ring-primary/40')}
                >
                  <div className="flex items-center justify-between px-2 py-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className={cn('h-2.5 w-2.5 rounded-full', COR_ETAPA[etapa])} />
                      {ETAPAS[etapa]}
                      <span className="rounded-full bg-background px-1.5 text-xs tabular-nums text-muted-foreground">{itens.length}</span>
                    </div>
                    {total > 0 && <span className="text-[11px] tabular-nums text-muted-foreground">{formatarMoeda(total)}</span>}
                  </div>
                  <div className="flex min-h-[80px] flex-col gap-2">
                    {itens.map((p) => (
                      <CartaoProcesso key={p.id} p={p} arrastavel={podeEditar} nomeEmpresa={mostrarEmpresa ? nomeEmpresa(p.empresa_id) : undefined} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">Dica: arraste os cartões entre as colunas para mudar a etapa (no celular, mude pela página do processo).</p>
        </>
      ) : (
        <Card className="divide-y">
          {lista.map((p) => (
            <Link key={p.id} to={`/app/processos/${p.id}`} className="flex flex-col gap-2 p-4 hover:bg-muted/40 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">
                  {MODALIDADES[p.modalidade]}
                  {p.numero ? ` · ${p.numero}` : ''}
                  {p.orgao_nome ? ` · ${p.orgao_nome}` : ''}
                  {mostrarEmpresa ? ` · ${nomeEmpresa(p.empresa_id)}` : ''}
                </div>
                <div className="truncate font-medium">{p.objeto}</div>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {p.data_abertura && <span>{formatarDataHora(p.data_abertura)}</span>}
                {p.valor_estimado != null && <span className="tabular-nums">{formatarMoeda(p.valor_estimado)}</span>}
                <BadgeEtapa etapa={p.etapa} />
              </div>
            </Link>
          ))}
          {lista.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Nenhum processo encontrado com esses filtros.</div>}
        </Card>
      )}

      <Modal aberto={novo} aoFechar={() => setNovo(false)} titulo="Novo processo">
        <ProcessoForm
          aoSalvar={(p) => {
            setNovo(false)
            navigate(`/app/processos/${p.id}`)
          }}
        />
      </Modal>
    </>
  )
}
