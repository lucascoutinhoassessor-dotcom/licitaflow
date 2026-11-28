import { useEffect, useMemo, useRef, useState, type DragEvent, type TouchEvent as EventoToque } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { Archive, ArchiveRestore, ArrowLeft, ArrowRight, CalendarClock, Check, ChevronRight, FileText, Gavel, KanbanSquare, List, MoreHorizontal, Pencil, Plus, Radar, Search, Trash2 } from 'lucide-react'
import MenuFiltros, { ChipFiltro, SecaoFiltro } from '@/components/MenuFiltros'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { toast } from 'sonner'
import { Badge, Button, CabecalhoPagina, Card, Carregando, Input, Modal, Select, Vazio } from '@/components/ui'
import { BadgeEtapa } from '@/components/Situacoes'
import { PECAS } from '@/lib/juridico'
import { ETAPAS, ETAPAS_ATIVAS, ETAPAS_FINAIS, MODALIDADES, type Etapa } from '@/lib/dominio'
import { formatarDataHora, formatarMoeda } from '@/lib/format'
import { resumoProcessos } from '@/lib/contagemProcessos'
import { cn } from '@/lib/utils'
import { useLista, useNomeEmpresa, useSalvar } from '@/hooks/useDados'
import { useModulos, useRecursos } from '@/hooks/useModulos'
import { useQueryClient } from '@tanstack/react-query'
import { StatusAgentes } from '@/components/StatusAgentes'
import { useEstadosAgentes } from '@/hooks/useEstadosAgentes'
import { detalheDoEstado, type StatusAgente } from '@/lib/agentesProcesso'
import { useOrg } from '@/providers/OrgProvider'
import type { Processo, ProcessoColuna } from '@/types/db'
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
  concluido: '#14b8a6',
  perdido: '#ef4444',
  desistencia: '#a1a1aa',
}

/** Tempo segurando o dedo no cartão até ele "descolar" e começar a arrastar (no celular). */
const SEGURAR_MS = 320
/** Quanto o dedo pode mexer enquanto segura; mais que isso é rolagem, não arraste. */
const TOLERANCIA_PX = 8

/** Coluna do Kanban: uma etapa (chave = etapa) ou uma coluna criada pelo cliente (chave = 'c:<id>'). */
interface ColunaKanban {
  chave: string
  nome: string
  cor: string
  coluna?: ProcessoColuna
}

/** Cores oferecidas para as colunas criadas pelo cliente. */
const CORES_COLUNA = ['#64748b', '#0ea5e9', '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#14b8a6', '#06b6d4']

const finalizada = (e: Etapa) => (ETAPAS_FINAIS as readonly Etapa[]).includes(e)

function ConteudoCartao({ p, nomeEmpresa, agentes }: { p: Processo; nomeEmpresa?: string; agentes?: Record<string, StatusAgente> }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2 pr-7">
        <div className="text-xs text-muted-foreground">
          {MODALIDADES[p.modalidade]}
          {p.numero ? ` · ${p.numero}` : ''}
        </div>
        <div className="flex shrink-0 gap-1">
          {p.arquivado_em && <Badge>Arquivado</Badge>}
          {p.prioridade === 'alta' && <Badge cor="vermelho">Alta</Badge>}
        </div>
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
      {/* Estado real de cada agente (calculado no banco): trabalhando, na fila ou parado com o motivo. */}
      <StatusAgentes estados={agentes} />
      {nomeEmpresa && <div className="mt-2 truncate border-t pt-2 text-[11px] text-muted-foreground">{nomeEmpresa}</div>}
    </>
  )
}

const itemMenu =
  'flex min-h-10 cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 text-sm outline-none data-[disabled]:cursor-not-allowed data-[highlighted]:bg-muted data-[disabled]:opacity-50'

function MenuCartao({
  p,
  estadoMonitor,
  sentinela,
  aoMonitorar,
  aoArquivar,
  aoExcluir,
  aoCriarPeca,
}: {
  p: Processo
  estadoMonitor: string
  /** Abre o Jurídico já preenchido com este processo; ausente = módulo Jurídico indisponível. */
  aoCriarPeca?: (tipo: string) => void
  /** Estado real da Sentinela neste processo (do banco); mostra se está mesmo ativa e, se não, por quê. */
  sentinela?: StatusAgente
  aoMonitorar: (ligar: boolean) => void
  aoArquivar: (arquivar: boolean) => void
  aoExcluir: () => void
}) {
  const semEdital = !p.pncp_controle
  const encerrado = finalizada(p.etapa)
  const ligado = p.monitorar !== false
  const motivo = semEdital ? 'Sem edital do PNCP vinculado' : encerrado ? 'Processo encerrado' : p.arquivado_em ? 'Processo arquivado' : null
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        aria-label="Opções do processo"
        className="absolute right-1.5 top-1.5 z-10 rounded-md p-1.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted"
      >
        <MoreHorizontal className="h-4 w-4" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={4} collisionPadding={8} className="z-50 min-w-[15rem] rounded-xl border bg-card p-1.5 text-card-foreground shadow-xl">
          {(estadoMonitor === 'liberado' || estadoMonitor === 'em_breve') && (
            <Menu.CheckboxItem
              className={itemMenu}
              checked={ligado}
              disabled={estadoMonitor === 'em_breve' || !!motivo}
              onCheckedChange={(v) => aoMonitorar(v === true)}
            >
              <Radar className="h-4 w-4" />
              <span className="flex-1">
                Monitorar com IA
                {estadoMonitor === 'em_breve' ? (
                  <span className="block text-[11px] text-muted-foreground">Em breve</span>
                ) : motivo ? (
                  <span className="block text-[11px] text-muted-foreground">{motivo}</span>
                ) : sentinela ? (
                  <span className={cn('block text-[11px]', sentinela.estado === 'ativo' ? 'text-emerald-600 dark:text-emerald-400' : sentinela.estado === 'parado' || sentinela.estado === 'falha' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                    {sentinela.estado === 'ativo' ? 'Ativo · ' : sentinela.estado === 'parado' ? 'Parado · ' : ''}{detalheDoEstado(sentinela)}
                  </span>
                ) : null}
              </span>
              <Menu.ItemIndicator>
                <Check className="h-4 w-4 text-primary" />
              </Menu.ItemIndicator>
            </Menu.CheckboxItem>
          )}
          {aoCriarPeca && (
            <Menu.Sub>
              <Menu.SubTrigger className={itemMenu}>
                <Gavel className="h-4 w-4" />
                <span className="flex-1">Criar peça jurídica</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Menu.SubTrigger>
              <Menu.Portal>
                <Menu.SubContent sideOffset={6} collisionPadding={8} className="z-50 min-w-[13rem] rounded-xl border bg-card p-1.5 text-card-foreground shadow-xl">
                  {PECAS.map((peca) => (
                    <Menu.Item key={peca.id} className={itemMenu} onSelect={() => aoCriarPeca(peca.id)}>
                      <FileText className="h-4 w-4" /> {peca.rotulo}
                    </Menu.Item>
                  ))}
                </Menu.SubContent>
              </Menu.Portal>
            </Menu.Sub>
          )}
          <Menu.Item className={itemMenu} onSelect={() => aoArquivar(!p.arquivado_em)}>
            {p.arquivado_em ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {p.arquivado_em ? 'Desarquivar' : 'Arquivar'}
          </Menu.Item>
          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Item className={cn(itemMenu, 'text-destructive data-[highlighted]:bg-destructive/10')} onSelect={aoExcluir}>
            <Trash2 className="h-4 w-4" /> Excluir
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

function MenuColuna({ primeira, ultima, aoEditar, aoMover, aoExcluir }: { primeira: boolean; ultima: boolean; aoEditar: () => void; aoMover: (passo: -1 | 1) => void; aoExcluir: () => void }) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger aria-label="Opções da coluna" className="rounded-md p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted">
        <MoreHorizontal className="h-4 w-4" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={4} collisionPadding={8} className="z-50 min-w-[13rem] rounded-xl border bg-card p-1.5 text-card-foreground shadow-xl">
          <Menu.Item className={itemMenu} onSelect={aoEditar}>
            <Pencil className="h-4 w-4" /> Renomear ou mudar a cor
          </Menu.Item>
          <Menu.Item className={itemMenu} disabled={primeira} onSelect={() => aoMover(-1)}>
            <ArrowLeft className="h-4 w-4" /> Mover para a esquerda
          </Menu.Item>
          <Menu.Item className={itemMenu} disabled={ultima} onSelect={() => aoMover(1)}>
            <ArrowRight className="h-4 w-4" /> Mover para a direita
          </Menu.Item>
          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Item className={cn(itemMenu, 'text-destructive data-[highlighted]:bg-destructive/10')} onSelect={aoExcluir}>
            <Trash2 className="h-4 w-4" /> Excluir coluna
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

function FormColuna({ inicial, salvando, aoSalvar }: { inicial?: ProcessoColuna; salvando: boolean; aoSalvar: (nome: string, cor: string) => void }) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [cor, setCor] = useState(inicial?.cor ?? CORES_COLUNA[1])
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (nome.trim()) aoSalvar(nome.trim(), cor)
      }}
    >
      <div>
        <label htmlFor="coluna-nome" className="mb-1.5 block text-sm font-medium">Nome da coluna</label>
        <Input id="coluna-nome" autoFocus maxLength={40} placeholder="Ex.: Aguardando empenho" value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Cor</legend>
        <div className="flex flex-wrap gap-2">
          {CORES_COLUNA.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Cor ${c}`}
              aria-pressed={cor === c}
              onClick={() => setCor(c)}
              className={cn('h-8 w-8 rounded-full ring-offset-2 ring-offset-background transition', cor === c && 'ring-2 ring-foreground')}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-muted-foreground">A coluna organiza o quadro da sua equipe. A etapa oficial do processo (usada em relatórios e no monitoramento) não muda.</p>
      <div className="flex justify-end">
        <Button type="submit" carregando={salvando} disabled={!nome.trim()}>
          {inicial ? 'Salvar' : 'Criar coluna'}
        </Button>
      </div>
    </form>
  )
}

interface Segurado {
  p: Processo
  cor: string
  /** Onde o dedo pegou o cartão, relativo ao canto do cartão. */
  dx: number
  dy: number
  largura: number
  x: number
  y: number
}

function CartaoProcesso({
  p,
  cor,
  arrastavel,
  nomeEmpresa,
  agentes,
  fantasma,
  menu,
  aoSegurar,
  cliqueBloqueado,
}: {
  p: Processo
  cor: string
  arrastavel?: boolean
  nomeEmpresa?: string
  agentes?: Record<string, StatusAgente>
  fantasma?: boolean
  menu?: React.ReactNode
  aoSegurar?: (s: Segurado) => void
  cliqueBloqueado?: () => boolean
}) {
  const [arrastando, setArrastando] = useState(false)
  const timer = useRef<number>()
  const dedo = useRef<{ x0: number; y0: number; x: number; y: number } | null>(null)

  const cancelar = () => {
    window.clearTimeout(timer.current)
    dedo.current = null
  }
  useEffect(() => cancelar, [])

  const tocar = (e: EventoToque<HTMLAnchorElement>) => {
    if (!arrastavel || !aoSegurar || e.touches.length !== 1) return
    const t = e.touches[0]
    dedo.current = { x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY }
    const el = e.currentTarget
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const d = dedo.current
      if (!d) return
      const r = el.getBoundingClientRect()
      navigator.vibrate?.(15)
      aoSegurar({ p, cor, dx: d.x - r.left, dy: d.y - r.top, largura: r.width, x: d.x, y: d.y })
      dedo.current = null
    }, SEGURAR_MS)
  }

  return (
    <div className="relative">
      <Link
        to={`/app/processos/${p.id}`}
        draggable={arrastavel}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/processo', p.id)
          e.dataTransfer.effectAllowed = 'move'
          setArrastando(true)
        }}
        onDragEnd={() => setArrastando(false)}
        onTouchStart={tocar}
        onTouchMove={(e) => {
          const d = dedo.current
          if (!d) return
          const t = e.touches[0]
          d.x = t.clientX
          d.y = t.clientY
          if (Math.hypot(t.clientX - d.x0, t.clientY - d.y0) > TOLERANCIA_PX) cancelar()
        }}
        onTouchEnd={cancelar}
        onTouchCancel={cancelar}
        // Segurar o dedo num link abre o menu do navegador; aqui segurar é para arrastar.
        onContextMenu={(e) => arrastavel && e.preventDefault()}
        onClick={(e) => cliqueBloqueado?.() && e.preventDefault()}
        style={{ borderLeftColor: cor, WebkitTouchCallout: 'none' }}
        className={cn(
          'block select-none rounded-lg border border-l-4 bg-card p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg',
          arrastavel && 'cursor-grab active:cursor-grabbing',
          (arrastando || fantasma) && 'rotate-2 scale-95 opacity-40',
          p.arquivado_em && !fantasma && 'opacity-70',
        )}
      >
        <ConteudoCartao p={p} nomeEmpresa={nomeEmpresa} agentes={agentes} />
      </Link>
      {menu}
    </div>
  )
}

export default function Processos() {
  const navigate = useNavigate()
  const { podeEditar, empresa, empresas } = useOrg()
  const nomeEmpresa = useNomeEmpresa()
  const { estado: estadoRecurso } = useRecursos()
  const estadoMonitor = estadoRecurso('recurso-monitorar-processo')
  // Selos dos agentes só com o módulo "agentes" liberado para a organização (senão o Kanban não fala de IA).
  const { estado: estadoModulo } = useModulos()
  const agentesLiberados = estadoModulo('/app/agentes') === 'liberado'
  const juridicoLiberado = estadoModulo('/app/juridico/impugnacao') === 'liberado'
  const estadosAgentes = useEstadosAgentes(agentesLiberados || estadoMonitor === 'liberado')
  const agentesDe = (p: Processo) => (agentesLiberados ? estadosAgentes.data?.[p.id] : undefined)
  const qc = useQueryClient()
  const [visao, setVisao] = useState(lerVisao)
  const [novo, setNovo] = useState(false)
  const [busca, setBusca] = useState('')
  const [modalidade, setModalidade] = useState('')
  const [mostrarFinais, setMostrarFinais] = useState(false)
  const [mostrarArquivados, setMostrarArquivados] = useState(false)
  // Colunas do Kanban são identificadas por uma chave: a etapa ('captacao'...) ou 'c:<id>' para coluna do cliente.
  const [sobre, setSobre] = useState<string | null>(null)
  const [movidos, setMovidos] = useState<Record<string, string>>({})
  const [colunaEditada, setColunaEditada] = useState<ProcessoColuna | 'nova' | null>(null)
  const [segurado, setSegurado] = useState<Segurado | null>(null)
  const trilho = useRef<HTMLDivElement>(null)
  const fantasmaRef = useRef<HTMLDivElement>(null)
  const fimDoArraste = useRef(0)
  const q = useLista<Processo>('processos', { ordem: ['data_abertura', true] })
  const { salvar, excluir } = useSalvar('processos', ['processo_eventos'])
  const colunasQ = useLista<ProcessoColuna>('processo_colunas', { porEmpresa: false, ordem: ['ordem', true] })
  const { salvar: salvarColuna, excluir: excluirColuna } = useSalvar('processo_colunas', ['processos'])
  const mostrarEmpresa = !empresa && empresas.length > 1

  const trocarVisao = (v: 'kanban' | 'lista') => {
    setVisao(v)
    try {
      localStorage.setItem('lf-visao-processos', v)
    } catch {
      /* armazenamento indisponível */
    }
  }

  const arquivados = (q.data ?? []).filter((p) => p.arquivado_em).length
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return (q.data ?? []).filter(
      (p) =>
        (mostrarArquivados || !p.arquivado_em) &&
        (!modalidade || p.modalidade === modalidade) &&
        (!t || `${p.objeto} ${p.orgao_nome} ${p.numero} ${p.uasg}`.toLowerCase().includes(t)),
    )
  }, [q.data, busca, modalidade, mostrarArquivados])

  const extras = colunasQ.data ?? []
  const deEtapa = (e: Etapa): ColunaKanban => ({ chave: e, nome: ETAPAS[e], cor: HEX_ETAPA[e] })
  const colunas: ColunaKanban[] = [
    ...ETAPAS_ATIVAS.map(deEtapa),
    ...extras.map((c) => ({ chave: `c:${c.id}`, nome: c.nome, cor: c.cor, coluna: c })),
    ...(mostrarFinais ? ETAPAS_FINAIS.map(deEtapa) : []),
  ]

  // Coluna de cada cartão: a coluna do cliente, se houver e ainda existir; senão a da etapa.
  // A chave local vale já na hora do soltar, para o cartão animar sem esperar o servidor.
  const chaveDe = (p: Processo) => movidos[p.id] ?? (p.coluna_id && extras.some((c) => c.id === p.coluna_id) ? `c:${p.coluna_id}` : p.etapa)

  async function mover(id: string, chave: string) {
    const p = q.data?.find((x) => x.id === id)
    if (!p || chaveDe(p) === chave) return
    const nome = chave.startsWith('c:') ? extras.find((c) => `c:${c.id}` === chave)?.nome : ETAPAS[chave as Etapa]
    if (!nome) return
    setMovidos((m) => ({ ...m, [id]: chave }))
    try {
      await salvar.mutateAsync({ id, dados: chave.startsWith('c:') ? { coluna_id: chave.slice(2) } : { etapa: chave, coluna_id: null } })
      await q.refetch() // só solta a coluna local depois que a lista já veio atualizada
      toast.success(`Movido para ${nome}.`)
    } catch {
      /* o erro já aparece no aviso do useSalvar; o cartão volta para a coluna de origem */
    } finally {
      setMovidos(({ [id]: _, ...resto }) => resto)
    }
  }
  const moverRef = useRef(mover)
  moverRef.current = mover

  const soltar = (chave: string) => (e: DragEvent) => {
    e.preventDefault()
    setSobre(null)
    const id = e.dataTransfer.getData('text/processo')
    if (id && podeEditar) mover(id, chave)
  }

  // Arraste pelo dedo (o arrastar nativo do navegador não funciona no toque): o cartão segue o dedo,
  // a coluna sob o dedo acende e a tela rola sozinha quando o dedo chega perto da borda.
  const idSegurado = segurado?.p.id
  useEffect(() => {
    if (!segurado) return
    const pos = { x: segurado.x, y: segurado.y }
    let alvo: string | null = null
    let quadro = 0
    const posicionar = () => {
      const el = fantasmaRef.current
      if (el) el.style.transform = `translate3d(${pos.x - segurado.dx}px, ${pos.y - segurado.dy}px, 0)`
    }
    const procurarColuna = () => {
      const col = document.elementFromPoint(pos.x, pos.y)?.closest<HTMLElement>('[data-coluna]')
      const chave = col?.dataset.coluna ?? null
      if (chave !== alvo) {
        alvo = chave
        setSobre(chave)
        if (chave) navigator.vibrate?.(5)
      }
    }
    const rolar = () => {
      const borda = 56
      const h = trilho.current
      if (h) {
        if (pos.x < borda) h.scrollLeft -= Math.ceil((borda - pos.x) / 3)
        else if (pos.x > window.innerWidth - borda) h.scrollLeft += Math.ceil((pos.x - (window.innerWidth - borda)) / 3)
      }
      const v = document.getElementById('conteudo-principal')
      if (v) {
        const r = v.getBoundingClientRect()
        if (pos.y < r.top + borda) v.scrollTop -= Math.ceil((r.top + borda - pos.y) / 4)
        else if (pos.y > r.bottom - borda) v.scrollTop += Math.ceil((pos.y - (r.bottom - borda)) / 4)
      }
      procurarColuna()
      quadro = requestAnimationFrame(rolar)
    }
    const aoMover = (e: TouchEvent) => {
      e.preventDefault() // segura a rolagem da página enquanto arrasta
      const t = e.touches[0]
      if (!t) return
      pos.x = t.clientX
      pos.y = t.clientY
      posicionar()
    }
    const terminar = (cancelado: boolean) => () => {
      cancelAnimationFrame(quadro)
      fimDoArraste.current = Date.now()
      setSegurado(null)
      setSobre(null)
      if (!cancelado && alvo && podeEditar) void moverRef.current(segurado.p.id, alvo)
    }
    const fim = terminar(false)
    const cancelamento = terminar(true)
    posicionar()
    procurarColuna()
    quadro = requestAnimationFrame(rolar)
    document.addEventListener('touchmove', aoMover, { passive: false })
    document.addEventListener('touchend', fim)
    document.addEventListener('touchcancel', cancelamento)
    return () => {
      cancelAnimationFrame(quadro)
      document.removeEventListener('touchmove', aoMover)
      document.removeEventListener('touchend', fim)
      document.removeEventListener('touchcancel', cancelamento)
    }
    // O arraste dura enquanto o mesmo cartão estiver segurado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idSegurado])

  async function gravarColuna(nome: string, cor: string) {
    const editada = colunaEditada
    try {
      if (editada && editada !== 'nova') await salvarColuna.mutateAsync({ id: editada.id, dados: { nome, cor } })
      else await salvarColuna.mutateAsync({ dados: { nome, cor, ordem: Math.max(0, ...extras.map((c) => c.ordem)) + 1 } })
      setColunaEditada(null)
      toast.success(editada === 'nova' ? 'Coluna criada.' : 'Coluna atualizada.')
    } catch {
      /* useSalvar mostra o erro */
    }
  }

  async function apagarColuna(c: ProcessoColuna) {
    const n = (q.data ?? []).filter((p) => p.coluna_id === c.id).length
    if (!confirm(`Excluir a coluna "${c.nome}"?${n ? ` Os ${n} processo(s) nela voltam para a coluna da etapa deles; nada é apagado.` : ''}`)) return
    try {
      await excluirColuna.mutateAsync(c.id)
      toast.success('Coluna excluída.')
    } catch {
      /* useSalvar mostra o erro */
    }
  }

  async function reordenarColuna(c: ProcessoColuna, passo: -1 | 1) {
    const i = extras.findIndex((x) => x.id === c.id)
    const outra = extras[i + passo]
    if (!outra) return
    try {
      // Troca a ordem das duas; se empatarem, dá uma ordem distinta para cada.
      const [a, b] = c.ordem === outra.ordem ? [outra.ordem + passo, c.ordem] : [outra.ordem, c.ordem]
      await salvarColuna.mutateAsync({ id: c.id, dados: { ordem: a } })
      await salvarColuna.mutateAsync({ id: outra.id, dados: { ordem: b } })
    } catch {
      /* useSalvar mostra o erro */
    }
  }

  async function monitorar(p: Processo, ligar: boolean) {
    try {
      await salvar.mutateAsync({ id: p.id, dados: { monitorar: ligar } })
      await qc.invalidateQueries({ queryKey: ['agentes-estado-processos'] })
      toast.success(ligar ? 'Monitoramento ligado. O estado real aparece no cartão.' : 'Monitoramento desligado neste processo.')
    } catch {
      /* useSalvar mostra o erro */
    }
  }

  async function arquivar(p: Processo, arquivar: boolean) {
    try {
      await salvar.mutateAsync({ id: p.id, dados: { arquivado_em: arquivar ? new Date().toISOString() : null } })
      toast.success(arquivar ? 'Processo arquivado.' : 'Processo desarquivado.', {
        action: { label: 'Desfazer', onClick: () => void salvar.mutateAsync({ id: p.id, dados: { arquivado_em: arquivar ? null : p.arquivado_em } }).catch(() => {}) },
      })
    } catch {
      /* useSalvar mostra o erro */
    }
  }

  async function apagar(p: Processo) {
    if (!confirm(`Excluir o processo "${p.objeto.slice(0, 80)}"? Itens, prazos, documentos anexados e histórico serão apagados. Esta ação não pode ser desfeita.`)) return
    try {
      await excluir.mutateAsync(p.id)
      toast.success('Processo excluído.')
    } catch {
      /* useSalvar mostra o erro */
    }
  }

  const menuDe = (p: Processo) =>
    podeEditar ? (
      <MenuCartao
        p={p}
        estadoMonitor={estadoMonitor}
        sentinela={estadosAgentes.data?.[p.id]?.sentinela}
        aoMonitorar={(v) => monitorar(p, v)}
        aoArquivar={(v) => arquivar(p, v)}
        aoExcluir={() => apagar(p)}
        aoCriarPeca={juridicoLiberado ? (tipo) => navigate(`/app/juridico/${tipo}?aba=minuta&processo=${p.id}`) : undefined}
      />
    ) : undefined

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
        <MenuFiltros ativos={modalidade ? 1 : 0} aoLimpar={() => setModalidade('')}>
          <SecaoFiltro icone={Gavel} cor="ambar" titulo="Modalidade" descricao={modalidade ? MODALIDADES[modalidade as keyof typeof MODALIDADES] : 'Todas as modalidades'}>
            <div className="grid grid-cols-2 gap-1.5">
              <ChipFiltro ativo={!modalidade} onClick={() => setModalidade('')} className="rounded-md">Todas</ChipFiltro>
              {Object.entries(MODALIDADES).map(([k, v]) => <ChipFiltro key={k} ativo={modalidade === k} onClick={() => setModalidade(modalidade === k ? '' : k)} className="rounded-md">{v}</ChipFiltro>)}
            </div>
          </SecaoFiltro>
        </MenuFiltros>
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
                className={cn('flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm', visao === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
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
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {visao === 'kanban' && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={mostrarFinais} onChange={(e) => setMostrarFinais(e.target.checked)} /> Mostrar ganhos, concluídos, perdidos e desistências
              </label>
            )}
            {arquivados > 0 && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={mostrarArquivados} onChange={(e) => setMostrarArquivados(e.target.checked)} /> Mostrar arquivados ({arquivados})
              </label>
            )}
          </div>
          {visao === 'kanban' ? (
            <>
              <LayoutGroup>
                <motion.div
                  ref={trilho}
                  layoutScroll
                  className={cn('rolagem-kanban -mx-4 flex gap-4 overflow-x-auto px-4 pb-4 lg:-mx-8 lg:px-8', segurado ? 'snap-none' : 'snap-x snap-mandatory sm:snap-none')}
                >
                  {colunas.map((col) => {
                    const itens = lista.filter((p) => chaveDe(p) === col.chave)
                    // Arquivados aparecem (com "Mostrar arquivados"), mas não entram na quantidade nem no total da coluna.
                    const { quantidade, total } = resumoProcessos(itens)
                    const cor = col.cor
                    const ativa = sobre === col.chave
                    return (
                      <div
                        key={col.chave}
                        data-coluna={col.chave}
                        onDragOver={(e) => {
                          e.preventDefault()
                          setSobre(col.chave)
                        }}
                        onDragLeave={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre(null)
                        }}
                        onDrop={soltar(col.chave)}
                        style={{
                          borderColor: ativa ? cor : `${cor}40`,
                          backgroundImage: `linear-gradient(to bottom, ${cor}${ativa ? '2e' : '17'}, ${cor}05 45%, transparent)`,
                          boxShadow: ativa ? `0 0 0 3px ${cor}33, 0 12px 32px -12px ${cor}66` : undefined,
                        }}
                        className={cn(
                          'relative flex min-h-[calc(100dvh-20rem)] w-[85vw] max-w-[22rem] shrink-0 snap-center flex-col overflow-hidden rounded-2xl border bg-muted/30 p-3 pt-4 transition-all duration-200 sm:w-80 xl:w-[22rem]',
                          ativa && 'scale-[1.01]',
                        )}
                      >
                        <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: cor }} />
                        <div className="mb-1 flex items-center justify-between gap-2 border-b px-1 pb-3" style={{ borderColor: `${cor}33` }}>
                          <div className="flex min-w-0 items-center gap-2 text-base font-semibold">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: cor, boxShadow: `0 0 8px ${cor}` }} />
                            <span className="truncate">{col.nome}</span>
                            <span className="rounded-full px-2 text-xs tabular-nums" style={{ backgroundColor: `${cor}26`, color: cor }}>
                              {quantidade}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {total > 0 && <span className="text-[11px] tabular-nums text-muted-foreground">{formatarMoeda(total)}</span>}
                            {col.coluna && podeEditar && (
                              <MenuColuna
                                primeira={extras[0]?.id === col.coluna.id}
                                ultima={extras[extras.length - 1]?.id === col.coluna.id}
                                aoEditar={() => setColunaEditada(col.coluna!)}
                                aoMover={(passo) => reordenarColuna(col.coluna!, passo)}
                                aoExcluir={() => apagarColuna(col.coluna!)}
                              />
                            )}
                          </div>
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
                                <CartaoProcesso
                                  p={p}
                                  cor={cor}
                                  arrastavel={podeEditar}
                                  nomeEmpresa={mostrarEmpresa ? nomeEmpresa(p.empresa_id) : undefined}
                                  agentes={agentesDe(p)}
                                  fantasma={idSegurado === p.id}
                                  menu={menuDe(p)}
                                  aoSegurar={setSegurado}
                                  cliqueBloqueado={() => Date.now() - fimDoArraste.current < 500}
                                />
                              </motion.div>
                            ))}
                          </AnimatePresence>
                          {itens.length === 0 && (
                            <div
                              className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed p-4 text-center text-xs text-muted-foreground transition-colors"
                              style={{ borderColor: ativa ? cor : `${cor}30`, color: ativa ? cor : undefined }}
                            >
                              {ativa ? 'Solte aqui' : 'Nenhum processo nesta coluna'}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {podeEditar && (
                    <button
                      type="button"
                      onClick={() => setColunaEditada('nova')}
                      className="flex min-h-[calc(100dvh-20rem)] w-[70vw] max-w-[16rem] shrink-0 snap-center flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground sm:w-56"
                    >
                      <Plus className="h-5 w-5" /> Nova coluna
                    </button>
                  )}
                </motion.div>
              </LayoutGroup>
              <p className="text-xs text-muted-foreground">
                Dica: arraste os cartões entre as colunas para mudar a etapa. No celular, segure o cartão um instante e arraste. Colunas criadas por você organizam o quadro sem mudar a etapa do processo.
              </p>
              {segurado &&
                createPortal(
                  <div ref={fantasmaRef} className="pointer-events-none fixed left-0 top-0 z-[60]" style={{ width: segurado.largura }}>
                    <motion.div
                      initial={{ scale: 1, rotate: 0 }}
                      animate={{ scale: 1.05, rotate: 3 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                      style={{ borderLeftColor: segurado.cor }}
                      className="rounded-lg border border-l-4 bg-card p-3 shadow-2xl ring-2 ring-primary/30"
                    >
                      <ConteudoCartao p={segurado.p} agentes={agentesDe(segurado.p)} />
                    </motion.div>
                  </div>,
                  document.body,
                )}
            </>
          ) : (
            <Card className="divide-y">
              {lista.map((p) => (
                <div key={p.id} className="relative">
                  <Link to={`/app/processos/${p.id}`} className={cn('flex flex-col gap-2 p-4 pr-12 hover:bg-muted/40 sm:flex-row sm:items-center', p.arquivado_em && 'opacity-70')}>
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
                      {(() => {
                        const s = agentesDe(p)?.sentinela
                        if (!s || !['ativo', 'na_fila', 'falha', 'parado'].includes(s.estado)) return null
                        const cor = s.estado === 'ativo' ? 'text-emerald-600 dark:text-emerald-400' : s.estado === 'na_fila' ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'
                        return <span title={detalheDoEstado(s)}><Radar className={cn('h-3.5 w-3.5', cor)} aria-label={detalheDoEstado(s)} /></span>
                      })()}
                      {p.arquivado_em && <Badge>Arquivado</Badge>}
                      <BadgeEtapa etapa={p.etapa} />
                    </div>
                  </Link>
                  {menuDe(p)}
                </div>
              ))}
              {lista.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Nenhum processo encontrado com esses filtros.</div>}
            </Card>
          )}
        </>
      )}

      <Modal aberto={!!colunaEditada} aoFechar={() => setColunaEditada(null)} titulo={colunaEditada === 'nova' ? 'Nova coluna' : 'Editar coluna'}>
        {colunaEditada && (
          <FormColuna
            key={colunaEditada === 'nova' ? 'nova' : colunaEditada.id}
            inicial={colunaEditada === 'nova' ? undefined : colunaEditada}
            salvando={salvarColuna.isPending}
            aoSalvar={gravarColuna}
          />
        )}
      </Modal>

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
