import { Link } from 'react-router-dom'
import { ArrowRight, CalendarClock, CheckCircle2, Circle, FileCheck2, Gavel, Radar } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'
import { useOrg } from '@/providers/OrgProvider'
import { useLista } from '@/hooks/useDados'
import { COR_ETAPA, ETAPAS, ETAPAS_ATIVAS, situacaoPrazo, situacaoValidade } from '@/lib/dominio'
import { formatarDataHora, formatarMoeda } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge, CabecalhoPagina, Card } from '@/components/ui'
import { BadgePrazo, BadgeValidade } from '@/components/Situacoes'
import type { Contrato, Documento, Prazo, Processo } from '@/types/db'

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
  const ganhos = (processos.data ?? []).filter((p) => p.etapa === 'homologado').length
  const finalizados = (processos.data ?? []).filter((p) => ['homologado', 'perdido'].includes(p.etapa)).length
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
    { rotulo: 'Processos em andamento', valor: ativos.length, sub: emDisputa ? `${formatarMoeda(emDisputa)} em jogo` : undefined, link: '/app/processos', icone: Gavel },
    { rotulo: 'Prazos nos próximos 7 dias', valor: proximos.length, sub: proximos.some((p) => situacaoPrazo(p.data_hora, false) === 'atrasado') ? 'há prazos atrasados' : undefined, alerta: proximos.some((p) => situacaoPrazo(p.data_hora, false) === 'atrasado'), link: '/app/prazos', icone: CalendarClock },
    { rotulo: 'Documentos para renovar', valor: atencaoDocs.length, sub: atencaoDocs.length ? 'vencidos ou vencendo' : 'tudo em dia', alerta: atencaoDocs.some((d) => situacaoValidade(d.validade) === 'vencido'), link: '/app/documentos', icone: FileCheck2 },
    { rotulo: 'Taxa de vitória', valor: finalizados ? `${Math.round((ganhos / finalizados) * 100)}%` : '—', sub: `${ganhos} ganho(s) · ${contratos.data?.length ?? 0} contrato(s) ativo(s)`, link: '/app/contratos', icone: CheckCircle2 },
  ]

  return (
    <>
      <CabecalhoPagina titulo={`Olá${nome ? `, ${nome}` : ''}!`} descricao={empresa ? `Visão de ${empresa.nome_fantasia || empresa.razao_social}` : 'Visão geral da organização'} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.rotulo} to={k.link}>
            <Card className="h-full p-5 transition hover:border-primary/40">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                {k.rotulo}
                <k.icone className="h-4 w-4" />
              </div>
              <div className={cn('mt-2 text-3xl font-semibold tabular-nums', k.alerta && 'text-destructive')}>{k.valor}</div>
              {k.sub && <div className="mt-1 text-xs text-muted-foreground">{k.sub}</div>}
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Próximos prazos</h2>
            <Link to="/app/prazos" className="text-sm text-primary hover:underline">Ver todos</Link>
          </div>
          {proximos.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Nenhum prazo nos próximos 7 dias.</p>
          ) : (
            <ul className="mt-3 divide-y">
              {proximos.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{p.titulo}</div>
                    <div className="text-xs text-muted-foreground">{formatarDataHora(p.data_hora)}</div>
                  </div>
                  <BadgePrazo dataHora={p.data_hora} concluido={false} />
                </li>
              ))}
            </ul>
          )}
        </Card>

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
              <div className="font-semibold">Radar de oportunidades e agentes de IA</div>
              <div className="text-sm text-muted-foreground">Próxima fase: oportunidades do PNCP entrando sozinhas no seu funil, com nota de aderência.</div>
            </div>
            <Badge>Em breve</Badge>
            <Link to="/app/oportunidades"><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link>
          </div>
        </Card>
      </div>
    </>
  )
}
