import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, ArrowRight, Ban, BellRing, CalendarClock, CheckCircle2, CircleDollarSign, ExternalLink, FileMinus, FileText, Lightbulb, ScanEye, Trophy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/providers/OrgProvider'
import { formatarDataHora } from '@/lib/format'
import { textoLimite, type LimiteIA } from '@/lib/agentesIA'
import { haQuanto } from '@/lib/agentesProcesso'
import { cn } from '@/lib/utils'
import { Abas, Aviso, Badge, Card, Carregando, Vazio } from '@/components/ui'

interface Vigiado { processo_id: string; objeto: string; numero: string | null; controle: string; verificado_em: string | null; situacao: string | null; encerramento: string | null; alterado_em: string | null }
interface Resumo { liberado: boolean; limite: LimiteIA; vigiados: Vigiado[]; fora_do_limite: number; sem_controle: number; desligados?: number }
interface Detalhe { contexto?: string; antes?: string | null; depois?: string | null; orientacao?: string; categoria?: string; documento?: string; publicado_em?: string; url?: string; de?: string; para?: string }
interface Evento { id: number; controle: string; tipo: string; nivel: 'alto' | 'medio' | 'baixo'; titulo: string; detalhe: Detalhe; created_at: string }

const NIVEL = {
  alto: { rotulo: 'Atenção', cor: 'vermelho' as const, borda: 'border-l-red-500' },
  medio: { rotulo: 'Novidade', cor: 'amarelo' as const, borda: 'border-l-amber-500' },
  baixo: { rotulo: 'Informação', cor: 'neutro' as const, borda: 'border-l-muted-foreground/40' },
}
const ICONE: Record<string, LucideIcon> = {
  situacao: AlertTriangle, encerramento: CalendarClock, abertura: CalendarClock, documento_novo: FileText,
  documento_retirado: FileMinus, resultado: Trophy, valor: CircleDollarSign, retirado: Ban,
}
/** "2026-12-05T09:00:00" (PNCP, horário de Brasília) → "05/12/2026 09:00". */
const dataPncp = (s: string | null) => { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s ?? ''); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : null }
const diaDe = (iso: string) => { const d = new Date(iso); const hoje = new Date(); const ontem = new Date(Date.now() - 864e5)
  if (d.toDateString() === hoje.toDateString()) return 'Hoje'
  if (d.toDateString() === ontem.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) }

function CartaoEvento({ e, processo }: { e: Evento; processo?: Vigiado }) {
  const n = NIVEL[e.nivel]
  const Icone = ICONE[e.tipo] ?? FileText
  const d = e.detalhe ?? {}
  const antes = d.antes ?? d.de ?? null
  const depois = d.depois ?? d.para ?? null
  return (
    <div className={cn('border-l-4 p-4', n.borda)}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted"><Icone className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge cor={n.cor}>{n.rotulo}</Badge>
            <span>{new Date(e.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
            {d.categoria && <span>· {d.categoria}</span>}
          </div>
          <p className="mt-1 font-medium leading-snug">{e.titulo}</p>
          {(antes || depois) && e.tipo !== 'documento_novo' && (
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
              {antes && <span className="text-muted-foreground line-through">{antes}</span>}
              {antes && depois && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
              {depois && <span className="font-medium">{depois}</span>}
            </p>
          )}
          {d.orientacao && (
            <div className="mt-2 flex gap-2 rounded-md bg-muted/50 p-2.5 text-sm">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p><span className="font-medium">O que fazer: </span>{d.orientacao}</p>
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {processo ? (
              <Link to={`/app/processos/${processo.processo_id}`} className="font-medium text-primary hover:underline">{processo.numero ? `${processo.numero} · ` : ''}{processo.objeto.slice(0, 90)}</Link>
            ) : <span className="text-muted-foreground">{d.contexto ?? e.controle}</span>}
            {processo && d.contexto && <span className="text-muted-foreground">{d.contexto}</span>}
            {d.url && /^https:\/\/pncp\.gov\.br\//.test(d.url) && (
              <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Abrir documento <ExternalLink className="h-3 w-3" /></a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Sentinela() {
  const { org } = useOrg()
  const [filtro, setFiltro] = useState<'todos' | 'alto'>('todos')
  const resumo = useQuery({ queryKey: ['sentinela-resumo', org?.id], enabled: !!org, refetchInterval: 120_000, queryFn: async () => {
    const { data, error } = await supabase.rpc('sentinela_resumo', { p_org: org!.id })
    if (error) throw error
    return data as Resumo
  } })
  const controles = (resumo.data?.vigiados ?? []).map((v) => v.controle)
  const eventos = useQuery({ queryKey: ['sentinela-eventos', org?.id, controles.join(',')], enabled: controles.length > 0, refetchInterval: 120_000, queryFn: async () => {
    const { data, error } = await supabase.from('sentinela_eventos').select('*').in('controle', controles).order('created_at', { ascending: false }).limit(80)
    if (error) throw error
    return data as Evento[]
  } })
  const processoDe = (controle: string) => resumo.data?.vigiados.find((v) => v.controle === controle)
  const lista = useMemo(() => (eventos.data ?? []).filter((e) => filtro === 'todos' || e.nivel === 'alto'), [eventos.data, filtro])
  const porDia = useMemo(() => {
    const g: { dia: string; itens: Evento[] }[] = []
    for (const e of lista) { const dia = diaDe(e.created_at); const ult = g[g.length - 1]; if (ult?.dia === dia) ult.itens.push(e); else g.push({ dia, itens: [e] }) }
    return g
  }, [lista])

  const voltar = <Link to="/app/agentes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Agentes de IA</Link>
  if (resumo.isLoading) return <Carregando />
  if (resumo.isError) return <>{voltar}<Aviso>Não foi possível abrir a Sentinela agora.</Aviso></>
  const r = resumo.data!
  const semana = (eventos.data ?? []).filter((e) => Date.now() - Date.parse(e.created_at) < 7 * 864e5)
  const atencaoSemana = semana.filter((e) => e.nivel === 'alto').length
  const ultimaVerificacao = r.vigiados.map((v) => v.verificado_em).filter(Boolean).sort().pop() ?? null
  const verificados = r.vigiados.filter((v) => v.verificado_em).length

  return (
    <>
      {voltar}
      <Card className="mb-5 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold"><ScanEye className="h-6 w-6 text-primary" />Sentinela</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Acompanha no PNCP os editais dos seus processos em andamento e avisa quando o órgão altera a situação da compra ou as datas,
              publica errata, resposta a esclarecimento, decisão de impugnação, ata ou resultado. Cada aviso diz o que mudou e o que fazer.
            </p>
          </div>
          <Badge cor="azul">Seu plano: {textoLimite(r.limite.limite, 'simultaneo')}</Badge>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Processos vigiados</p><p className="mt-1 text-2xl font-semibold">{r.vigiados.length}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Já verificados no PNCP</p><p className="mt-1 text-2xl font-semibold">{verificados}<span className="text-sm font-normal text-muted-foreground"> / {r.vigiados.length}</span></p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Avisos de atenção (7 dias)</p><p className={cn('mt-1 text-2xl font-semibold', atencaoSemana > 0 && 'text-red-600 dark:text-red-400')}>{atencaoSemana}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Última verificação</p><p className="mt-1 text-lg font-semibold">{ultimaVerificacao ? haQuanto(ultimaVerificacao) : '—'}</p></div>
        </div>
        {r.limite.limite === 0 && <div className="mt-4"><Aviso tipo="info">O seu plano não inclui a Sentinela. <Link to="/app/plano" className="font-semibold underline">Ver planos</Link>.</Aviso></div>}
        {r.fora_do_limite > 0 && <div className="mt-4"><Aviso tipo="info">{r.fora_do_limite} processo(s) ficaram fora do limite do plano e não estão sendo vigiados. Os mais recentes têm preferência. <Link to="/app/plano" className="font-semibold underline">Ampliar o plano</Link>.</Aviso></div>}
        <div className="mt-4 flex flex-col gap-1 text-xs text-muted-foreground">
          {r.sem_controle > 0 && <p>{r.sem_controle} processo(s) em andamento não têm o edital do PNCP vinculado e não podem ser vigiados. Processos criados pela tela de Oportunidades já vêm vinculados.</p>}
          {!!r.desligados && <p>{r.desligados} processo(s) com o monitoramento desligado no cartão do Kanban.</p>}
          <p className="flex items-center gap-1.5"><BellRing className="h-3.5 w-3.5" />Para receber os avisos no celular, toque em "Ativar notificações" na tela de <Link to="/app/avisos" className="font-medium text-primary hover:underline">Avisos</Link>.</p>
        </div>
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Mudanças nos editais</h2>
        <Abas abas={[{ id: 'todos', rotulo: 'Todas', contagem: eventos.data?.length ?? 0 }, { id: 'alto', rotulo: 'Só atenção', contagem: (eventos.data ?? []).filter((e) => e.nivel === 'alto').length }]} atual={filtro} aoTrocar={(id) => setFiltro(id === 'alto' ? 'alto' : 'todos')} />
      </div>
      {eventos.isLoading ? <Carregando /> : !lista.length ? (
        <Card className="mb-6 flex items-start gap-3 p-5 text-sm text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <p>{filtro === 'alto' ? 'Nenhum aviso de atenção.' : 'Nenhuma mudança encontrada até agora.'} A primeira verificação de cada edital só registra como ele está; dali em diante, toda alteração publicada pelo órgão aparece aqui.</p>
        </Card>
      ) : (
        <div className="mb-6 space-y-4">
          {porDia.map((g) => (
            <div key={g.dia}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.dia}</p>
              <Card className="divide-y overflow-hidden">{g.itens.map((e) => <CartaoEvento key={e.id} e={e} processo={processoDe(e.controle)} />)}</Card>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold">Processos vigiados</h2>
      {!r.vigiados.length ? (
        <Vazio titulo="Nenhum processo vigiado" texto="Adicione editais do PNCP aos seus processos (pela tela de Oportunidades) e a Sentinela passa a acompanhá-los." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-3">Processo</th><th className="p-3">Situação no PNCP</th><th className="p-3">Prazo final das propostas</th><th className="p-3">Verificado</th><th className="p-3">Última mudança</th></tr>
            </thead>
            <tbody className="divide-y">
              {r.vigiados.map((v) => {
                const suspensa = /suspens|revoga|anula/i.test(v.situacao ?? '')
                return (
                  <tr key={v.processo_id} className="hover:bg-muted/40">
                    <td className="max-w-[18rem] p-3"><Link to={`/app/processos/${v.processo_id}`} className="block truncate font-medium text-primary hover:underline">{v.numero ? `${v.numero} · ` : ''}{v.objeto}</Link></td>
                    <td className="p-3">{v.situacao ? <Badge cor={suspensa ? 'vermelho' : 'verde'}>{v.situacao}</Badge> : <span className="text-xs text-muted-foreground">Na fila</span>}</td>
                    <td className="p-3 tabular-nums">{dataPncp(v.encerramento) ?? '—'}</td>
                    <td className="p-3 text-xs text-muted-foreground" title={v.verificado_em ? formatarDataHora(v.verificado_em) : undefined}>{v.verificado_em ? haQuanto(v.verificado_em) : 'aguardando'}</td>
                    <td className="p-3 text-xs text-muted-foreground">{v.alterado_em ? formatarDataHora(v.alterado_em) : 'nenhuma'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}
