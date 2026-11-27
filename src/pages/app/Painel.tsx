import QuadroInformativo from '@/components/QuadroInformativo'
import { Link } from 'react-router-dom'
import ResumoEditaisHoje from '@/components/ResumoEditaisHoje'
import AgendaSemana from '@/components/AgendaSemana'
import { termosPerfil } from '@/lib/resumoEditais'
import { ArrowRight, ArrowUpRight, Briefcase, CalendarClock, CheckCircle2, Circle, FileCheck2, Gavel, Radar, Search } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'
import { useOrg } from '@/providers/OrgProvider'
import { useLista } from '@/hooks/useDados'
import { COR_ETAPA, ETAPAS, ETAPAS_ATIVAS, situacaoPrazo, situacaoValidade } from '@/lib/dominio'
import { formatarMoeda } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge, Card } from '@/components/ui'
import { BadgeValidade } from '@/components/Situacoes'
import type { Contrato, Documento, Prazo, Processo } from '@/types/db'

function saudacao() {
  const h = new Date().getHours()
  return h < 12 ? 'Bom dia · bem-vindo de volta' : h < 18 ? 'Boa tarde · bem-vindo de volta' : 'Boa noite · bem-vindo de volta'
}

export default function Painel() {
  const { user } = useAuth()
  const { org, empresas, empresa } = useOrg()
  const processos = useLista<Processo>('processos')
  const prazos = useLista<Prazo>('prazos', { filtro: (q) => q.eq('concluido', false), chave: ['abertos'], ordem: ['data_hora', true] })
  const docs = useLista<Documento>('documentos', { filtro: (q) => q.not('validade', 'is', null), chave: ['com-validade'], ordem: ['validade', true] })
  const contratos = useLista<Contrato>('contratos', { filtro: (q) => q.eq('status', 'ativo'), chave: ['ativos'] })
  const membros = useQuery({
    queryKey: ['contagem-membros', org?.id],
    enabled: !!org,
    queryFn: async () => {
      const { count } = await supabase.from('memberships').select('user_id', { count: 'exact', head: true }).eq('org_id', org!.id)
      return count ?? 0
    },
  })

  const nome = (user?.user_metadata?.nome as string | undefined)?.split(' ')[0]
  const ativos = (processos.data ?? []).filter((p) => ETAPAS_ATIVAS.includes(p.etapa))
  const emDisputa = ativos.reduce((a, p) => a + (p.valor_estimado ?? 0), 0)
  const ganhos = (processos.data ?? []).filter((p) => p.etapa === 'homologado' || p.etapa === 'concluido').length
  const finalizados = (processos.data ?? []).filter((p) => ['homologado', 'concluido', 'perdido'].includes(p.etapa)).length
  const proximos = (prazos.data ?? []).filter((p) => ['atrasado', 'hoje', 'semana'].includes(situacaoPrazo(p.data_hora, false)))
  const atencaoDocs = (docs.data ?? []).filter((d) => ['vencido', 'vence_em_breve'].includes(situacaoValidade(d.validade)))

  const passos = [
    { feito: empresas.length > 0, texto: 'Cadastrar a empresa licitante', link: '/app/empresas' },
    { feito: empresas.some((e) => e.palavras_chave.length > 0), texto: 'Definir o que a empresa vende (Radar)', link: '/app/empresas' },
    { feito: (processos.data?.length ?? 0) > 0, texto: 'Cadastrar o primeiro processo', link: '/app/processos' },
    { feito: (docs.data?.length ?? 0) > 0, texto: 'Cadastrar certidões com validade', link: '/app/documentos' },
    { feito: (membros.data ?? 1) > 1, texto: 'Convidar sua equipe', link: '/app/equipe' },
  ]
  const pendentes = passos.filter((p) => !p.feito).length

  const kpis = [
    { rotulo: 'Processos em andamento', valor: ativos.length, sub: emDisputa ? `${formatarMoeda(emDisputa)} em jogo` : undefined, link: '/app/processos', icone: Gavel, cor: 'from-emerald-500/25 to-teal-400/10 text-emerald-400 ring-emerald-500/30' },
    { rotulo: 'Prazos nos próximos 7 dias', valor: proximos.length, sub: proximos.some((p) => situacaoPrazo(p.data_hora, false) === 'atrasado') ? 'há prazos atrasados' : undefined, alerta: proximos.some((p) => situacaoPrazo(p.data_hora, false) === 'atrasado'), link: '/app/prazos', icone: CalendarClock, cor: 'from-sky-500/25 to-blue-500/10 text-sky-400 ring-sky-500/30' },
    { rotulo: 'Documentos para renovar', valor: atencaoDocs.length, sub: atencaoDocs.length ? 'vencidos ou vencendo' : 'tudo em dia', alerta: atencaoDocs.some((d) => situacaoValidade(d.validade) === 'vencido'), link: '/app/documentos', icone: FileCheck2, cor: 'from-amber-500/25 to-yellow-300/10 text-amber-400 ring-amber-500/30' },
    { rotulo: 'Taxa de vitória', valor: finalizados ? `${Math.round((ganhos / finalizados) * 100)}%` : '—', sub: `${ganhos} ganho(s) · ${contratos.data?.length ?? 0} contrato(s) ativo(s)`, link: '/app/contratos', icone: CheckCircle2, cor: 'from-violet-500/25 to-fuchsia-400/10 text-violet-400 ring-violet-500/30' },
  ]

  return (
    <>
      {/* Boas-vindas com as duas ações principais. */}
      <section className="lf-hero mb-6 flex flex-col gap-5 rounded-3xl p-6 text-slate-200 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-500">{saudacao()}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-100 sm:text-4xl">
            Olá{nome ? <>, <span className="text-emerald-400">{nome}</span></> : ''}
          </h1>
          <p className="mt-2 text-sm text-slate-400">{empresa ? `Panorama de ${empresa.nome_fantasia || empresa.razao_social}` : 'Aqui está um panorama dos seus resultados.'}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to="/app/oportunidades" className="lf-degrade inline-flex h-11 items-center gap-2 rounded-full border border-emerald-400/40 px-6 text-sm font-semibold text-white shadow-[0_18px_36px_-20px_rgba(16,185,129,0.7)] transition hover:brightness-110">
            <Search className="h-4 w-4" /> Pesquisar oportunidades
          </Link>
          <Link to="/app/processos" className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-700/70 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-6 text-sm font-semibold text-white transition hover:border-slate-500">
            <Briefcase className="h-4 w-4" /> Abrir meus processos
          </Link>
        </div>
      </section>

      {/* Panorama do dia (só para quem está logado) e agenda da equipe lado a lado. */}
      <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <ResumoEditaisHoje termos={termosPerfil(empresa?.palavras_chave)} />
        <AgendaSemana prazos={prazos.data ?? []} processos={ativos} carregando={prazos.isPending || processos.isPending} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.rotulo} to={k.link}>
            <Card className="group h-full p-4 transition hover:-translate-y-0.5 hover:border-primary/50 sm:p-5">
              <div className="flex items-start justify-between">
                <span className={cn('lf-kpi-icone flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ring-1', k.cor, k.alerta && 'lf-kpi-alerta')}>
                  <k.icone className="h-5 w-5" />
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition group-hover:text-foreground">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </div>
              <div className={cn('mt-4 text-3xl font-bold tabular-nums text-sky-500 dark:text-sky-300', k.alerta && 'text-destructive dark:text-rose-400')}>{k.valor}</div>
              <div className="mt-1 text-sm font-medium">{k.rotulo}</div>
              {k.sub && <div className="mt-1 text-xs text-muted-foreground">{k.sub}</div>}
            </Card>
          </Link>
        ))}
      </div>

      <QuadroInformativo compacto />
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="p-6">
          <h2 className="font-semibold">Funil</h2>
          <ul className="mt-4 space-y-3">
            {ETAPAS_ATIVAS.map((e) => {
              const n = ativos.filter((p) => p.etapa === e).length
              return (
                <li key={e}>
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2"><span className={cn('h-2 w-2 rounded-full', COR_ETAPA[e])} />{ETAPAS[e]}</span>
                    <span className="tabular-nums text-muted-foreground">{n}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted">
                    <div className={cn('h-1.5 rounded-full', COR_ETAPA[e])} style={{ width: `${ativos.length ? (n / ativos.length) * 100 : 0}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>

        {atencaoDocs.length > 0 && (
          <Card className="p-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Documentos para renovar</h2>
              <Link to="/app/documentos" className="text-sm text-primary hover:underline">Ver todos</Link>
            </div>
            <ul className="mt-3 divide-y">
              {atencaoDocs.slice(0, 5).map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm">{d.nome}</span>
                  <BadgeValidade validade={d.validade} />
                </li>
              ))}
            </ul>
          </Card>
        )}

        {pendentes > 0 && (
          <Card className="p-6">
            <h2 className="font-semibold">Primeiros passos</h2>
            <ul className="mt-4 space-y-3">
              {passos.map((p) => (
                <li key={p.texto} className="flex items-start gap-3 text-sm">
                  {p.feito ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                  {p.feito ? <span className="text-muted-foreground line-through">{p.texto}</span> : <Link to={p.link} className="text-primary hover:underline">{p.texto}</Link>}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="p-6 lg:col-span-3">
          <div className="flex items-center gap-3">
            <Radar className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <div className="font-semibold">Buscar oportunidades</div>
              <div className="text-sm text-muted-foreground">Consulte publicações oficiais por período, modalidade e UF e importe para seus processos.</div>
            </div>
            <Badge>Consultar</Badge>
            <Link to="/app/oportunidades"><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link>
          </div>
        </Card>
      </div>
    </>
  )
}
