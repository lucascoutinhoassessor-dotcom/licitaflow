import { useMemo, useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarClock, Gavel, KanbanSquare, List, Plus, Search } from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
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

// Cor de cada etapa em hex (para bordas e brilhos com transparência nas colunas do kanban).
const HEX_ETAPA: Record<Etapa, string> = {
  captacao: '#94a3b8',
  analise: '#0ea5e9',
  proposta: '#6366f1',
  disputa: '#8b5cf6',
  habilitacao: '#f59e0b',
  recurso: '#f97316',
  homologado: '#10b981',
  perdido: '#ef4444',
  desistencia: '#a1a1aa',
}

function CartaoProcesso({ p, cor, arrastavel, nomeEmpresa }: { p: Processo; cor: string; arrastavel?: boolean; nomeEmpresa?: string }) {
  const [arrastando, setArrastando] = useState(false)
  return (
    <Link
      to={`/app/processos/${p.id}`}
      draggable={arrastavel}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/processo', p.id)
        e.dataTransfer.effectAllowed = 'move'
        setArrastando(true)
      }}
      onDragEnd={() => setArrastando(false)}
      style={{ borderLeftColor: cor }}
      className={cn(
        'block rounded-lg border border-l-4 bg-card p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg',
        arrastavel && 'cursor-grab active:cursor-grabbing',
        arrastando && 'rotate-2 scale-95 opacity-40',
      )}
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
  const [movidos, setMovidos] = useState<Record<string, Etapa>>({})
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

  // Etapa mostrada já na hora do soltar, para o cartão animar sem esperar o servidor.
  const etapaDe = (p: Processo) => movidos[p.id] ?? p.etapa

  async function mover(id: string, etapa: Etapa) {
    const p = q.data?.find((x) => x.id === id)
    if (!p || etapaDe(p) === etapa) return
    setMovidos((m) => ({ ...m, [id]: etapa }))
    try {
      await salvar.mutateAsync({ id, dados: { etapa } })
      await q.refetch() // só solta a etapa local depois que a lista já veio atualizada
      toast.success(`Movido para ${ETAPAS[etapa]}.`)
    } catch {
      /* o erro já aparece no aviso do useSalvar; o cartão volta para a coluna de origem */
    } finally {
      setMovidos(({ [id]: _, ...resto }) => resto)
    }
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
          <LayoutGroup>
          <motion.div layoutScroll className="rolagem-kanban -mx-4 flex gap-4 overflow-x-auto px-4 pb-4 lg:-mx-8 lg:px-8">
            {colunas.map((etapa) => {
              const itens = lista.filter((p) => etapaDe(p) === etapa)
              const total = itens.reduce((a, p) => a + (p.valor_estimado ?? 0), 0)
              const cor = HEX_ETAPA[etapa]
              const ativa = sobre === etapa
              return (
                <div
                  key={etapa}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setSobre(etapa)
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre(null)
                  }}
                  onDrop={soltar(etapa)}
                  style={{
                    borderColor: ativa ? cor : `${cor}40`,
                    backgroundImage: `linear-gradient(to bottom, ${cor}${ativa ? '2e' : '17'}, ${cor}05 45%, transparent)`,
                    boxShadow: ativa ? `0 0 0 3px ${cor}33, 0 12px 32px -12px ${cor}66` : undefined,
                  }}
                  className={cn(
                    'relative flex min-h-[calc(100dvh-20rem)] w-[85vw] max-w-[22rem] shrink-0 flex-col overflow-hidden rounded-2xl border bg-muted/30 p-3 pt-4 transition-all duration-200 sm:w-80 xl:w-[22rem]',
                    ativa && 'scale-[1.01]',
                  )}
                >
                  <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: cor }} />
                  <div className="mb-1 flex items-center justify-between border-b px-1 pb-3" style={{ borderColor: `${cor}33` }}>
                    <div className="flex items-center gap-2 text-base font-semibold">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cor, boxShadow: `0 0 8px ${cor}` }} />
                      {ETAPAS[etapa]}
                      <span className="rounded-full px-2 text-xs tabular-nums" style={{ backgroundColor: `${cor}26`, color: cor }}>
                        {itens.length}
                      </span>
                    </div>
                    {total > 0 && <span className="text-[11px] tabular-nums text-muted-foreground">{formatarMoeda(total)}</span>}
                  </div>
                  <div className="flex flex-1 flex-col gap-3 pt-2">
                    <AnimatePresence initial={false} mode="popLayout">
                      {itens.map((p) => (
                        <motion.div
                          key={p.id}
                          layout
                          layoutId={`processo-${p.id}`}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                        >
                          <CartaoProcesso p={p} cor={cor} arrastavel={podeEditar} nomeEmpresa={mostrarEmpresa ? nomeEmpresa(p.empresa_id) : undefined} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {itens.length === 0 && (
                      <div
                        className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed p-4 text-center text-xs text-muted-foreground transition-colors"
                        style={{ borderColor: ativa ? cor : `${cor}30`, color: ativa ? cor : undefined }}
                      >
                        {ativa ? 'Solte aqui' : 'Nenhum processo nesta etapa'}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </motion.div>
          </LayoutGroup>
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
