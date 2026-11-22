import { useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, Gauge, Users } from 'lucide-react'
import { supabase, mensagemErro } from '@/lib/supabase'
import { formatarDataHora } from '@/lib/format'
import type { TipoLog } from '@/lib/registroUso'
import { Aviso, Badge, Button, Card, Carregando, Input, Select, Vazio } from '@/components/ui'

interface EventoUso { id: number; criado_em: string; usuario: string; email: string | null; org: string | null; tipo: TipoLog; area: string | null; mensagem: string; detalhe: string | null; duracao_ms: number | null; navegador: string | null }
interface ResumoUsuario { usuario: string; email: string | null; org: string | null; eventos: number; erros: number; lentos: number; ultimo: string }
interface Resposta { configurado: boolean; eventos?: EventoUso[]; haMais?: boolean; usuarios?: ResumoUsuario[]; ultimas24h?: { eventos: number; erros: number; lentos: number; usuarios: number } }

const TIPOS: Record<TipoLog, [string, 'neutro' | 'azul' | 'vermelho' | 'amarelo']> = {
  pagina: ['Página', 'neutro'], acao: ['Ação', 'azul'], erro: ['Erro', 'vermelho'], lento: ['Lentidão', 'amarelo'],
}
const PERIODOS = [[1, 'Última hora'], [24, 'Últimas 24 horas'], [168, 'Últimos 7 dias'], [720, 'Últimos 30 dias'], [2160, 'Últimos 90 dias']] as const

async function buscar(params: Record<string, string>): Promise<Resposta> {
  const { data } = await supabase.auth.getSession()
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v))
  const r = await fetch(`/api/oportunidades?acao=turso-logs&${qs}`, { headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` } })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(j?.error ?? 'Não foi possível carregar os logs agora.')
  return j
}

/** Logs automáticos de cada usuário: páginas, ações, erros e lentidão (gravados no Turso por src/lib/registroUso.ts). */
export default function LogsUso() {
  const [tipo, setTipo] = useState<'' | TipoLog>('')
  const [horas, setHoras] = useState('168')
  const [busca, setBusca] = useState('')
  const [termo, setTermo] = useState('')
  const [usuario, setUsuario] = useState<ResumoUsuario | null>(null)
  const filtros = { tipo, horas, busca: termo, usuario: usuario?.usuario ?? '' }
  const q = useInfiniteQuery({
    queryKey: ['logs-uso', filtros],
    initialPageParam: '',
    queryFn: ({ pageParam }) => buscar({ ...filtros, antes: pageParam }),
    getNextPageParam: (ult) => (ult.haMais && ult.eventos?.length ? String(ult.eventos[ult.eventos.length - 1].id) : undefined),
    refetchInterval: 60_000,
  })
  const orgs = useQuery({
    queryKey: ['master-orgs-nomes'],
    staleTime: 10 * 60_000,
    queryFn: async () => { const { data, error } = await supabase.from('organizations').select('id,nome'); if (error) throw error; return new Map((data ?? []).map((o) => [o.id as string, o.nome as string])) },
  })
  const primeira = q.data?.pages[0]
  const eventos = q.data?.pages.flatMap((p) => p.eventos ?? []) ?? []
  const nomeOrg = (id: string | null) => (id ? orgs.data?.get(id) ?? null : null)

  if (q.isLoading) return <Carregando />
  if (q.isError) return <Aviso>{mensagemErro(q.error)}</Aviso>
  if (primeira && !primeira.configurado) return <Aviso tipo="info">O Turso não está conectado, então os logs de uso ainda não são gravados.</Aviso>
  const t = primeira?.ultimas24h

  return <>
    {t && <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {([[AlertTriangle, 'Erros (24 h)', t.erros, 'text-destructive'], [Gauge, 'Lentidões (24 h)', t.lentos, 'text-amber-500'], [Users, 'Usuários ativos (24 h)', t.usuarios, 'text-sky-500'], [Activity, 'Eventos (24 h)', t.eventos, 'text-muted-foreground']] as const).map(([Icone, rotulo, n, cor]) => (
        <Card key={rotulo} className="p-4"><p className="flex items-center gap-2 text-xs text-muted-foreground"><Icone className={`h-4 w-4 ${cor}`} />{rotulo}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{Number(n).toLocaleString('pt-BR')}</p></Card>
      ))}
    </div>}

    <form className="mb-4 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); setTermo(busca.trim()) }}>
      <Input aria-label="Pesquisar nos logs de uso" placeholder="E-mail, mensagem ou página… (Enter)" value={busca} onChange={(e) => setBusca(e.target.value)} onBlur={() => setTermo(busca.trim())} />
      <Select aria-label="Tipo de evento" className="sm:w-44" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}><option value="">Todos os tipos</option>{Object.entries(TIPOS).map(([k, [r]]) => <option key={k} value={k}>{r}</option>)}</Select>
      <Select aria-label="Período" className="sm:w-48" value={horas} onChange={(e) => setHoras(e.target.value)}>{PERIODOS.map(([h, r]) => <option key={h} value={h}>{r}</option>)}</Select>
    </form>

    {usuario
      ? <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">Mostrando só <b>{usuario.email ?? usuario.usuario}</b>{nomeOrg(usuario.org) && <span className="text-muted-foreground">· {nomeOrg(usuario.org)}</span>}<Button tamanho="sm" variante="contorno" onClick={() => setUsuario(null)}>Ver todos</Button></div>
      : !!primeira?.usuarios?.length && <details className="mb-4" open>
        <summary className="mb-2 cursor-pointer text-sm font-medium">Por usuário no período ({primeira.usuarios.length})</summary>
        <Card className="divide-y overflow-hidden">{primeira.usuarios.map((u) => (
          <button key={u.usuario} type="button" onClick={() => setUsuario(u)} className="flex w-full flex-col gap-1 p-3 text-left text-sm hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-4">
            <span className="min-w-0 flex-1 truncate"><span className="font-medium">{u.email ?? u.usuario}</span>{nomeOrg(u.org) && <span className="text-muted-foreground"> · {nomeOrg(u.org)}</span>}</span>
            <span className="flex flex-wrap items-center gap-2 text-xs">{u.erros > 0 && <Badge cor="vermelho">{u.erros} erro{u.erros > 1 ? 's' : ''}</Badge>}{u.lentos > 0 && <Badge cor="amarelo">{u.lentos} lento{u.lentos > 1 ? 's' : ''}</Badge>}<span className="tabular-nums text-muted-foreground">{u.eventos} eventos · último {formatarDataHora(u.ultimo)}</span></span>
          </button>
        ))}</Card>
      </details>}

    {!eventos.length && <Vazio icone={Activity} titulo="Nenhum evento com esses filtros" texto="Os eventos aparecem aqui conforme os usuários navegam: páginas, ações, erros e lentidão." />}
    <Card className="divide-y">{eventos.map((e) => (
      <div key={e.id} className="p-3 text-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <span className="w-36 shrink-0 text-xs tabular-nums text-muted-foreground">{formatarDataHora(e.criado_em)}</span>
          <Badge cor={TIPOS[e.tipo]?.[1] ?? 'neutro'} className="w-fit">{TIPOS[e.tipo]?.[0] ?? e.tipo}</Badge>
          <span className="min-w-0 flex-1 break-words">{e.mensagem}{e.duracao_ms !== null && e.tipo !== 'pagina' && <span className="text-xs text-muted-foreground"> · {e.duracao_ms < 1000 ? `${e.duracao_ms} ms` : `${(e.duracao_ms / 1000).toFixed(1)} s`}</span>}</span>
          {!usuario && <button type="button" className="truncate text-left text-xs text-muted-foreground hover:underline sm:w-56 sm:text-right" onClick={() => setUsuario({ usuario: e.usuario, email: e.email, org: e.org, eventos: 0, erros: 0, lentos: 0, ultimo: e.criado_em })}>{e.email ?? e.usuario}</button>}
        </div>
        {(e.area || e.detalhe || e.navegador) && <details className="mt-1 sm:ml-40">
          <summary className="cursor-pointer text-xs text-muted-foreground">{e.area ?? 'detalhes'}</summary>
          <div className="mt-1 space-y-1 text-xs">
            {nomeOrg(e.org) && <p>Organização: {nomeOrg(e.org)}</p>}
            {e.navegador && <p className="break-all text-muted-foreground">{e.navegador}</p>}
            {e.detalhe && <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2">{(() => { try { return JSON.stringify(JSON.parse(e.detalhe), null, 2) } catch { return e.detalhe } })()}</pre>}
          </div>
        </details>}
      </div>
    ))}</Card>
    {q.hasNextPage && <div className="mt-4 text-center"><Button variante="contorno" carregando={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Carregar mais</Button></div>}
    <p className="mt-4 text-xs text-muted-foreground">Guardados por 90 dias. Não registra o conteúdo do que o usuário digita nem os filtros de busca: só a página, a ação, o status e o tempo.</p>
  </>
}
