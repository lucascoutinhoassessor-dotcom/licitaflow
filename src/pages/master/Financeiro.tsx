import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase, mensagemErro } from '@/lib/supabase'
import { formatarMoeda } from '@/lib/format'
import { Aviso, Badge, CabecalhoPagina, Card, Carregando } from '@/components/ui'

export interface ResumoFinanceiro {
  mrr: number; arr: number; ticket_medio: number; mrr_em_risco: number
  assinaturas: { ativas: number; atrasadas: number; pendentes: number; canceladas_30d: number; novas_30d: number }
  recebido_mes: number; liquido_mes: number; a_receber: number; inadimplente: number; clientes_inadimplentes: number; suspensas_por_atraso: number
  receita_12m: { mes: string; assinaturas: number; avulsas: number }[]
  por_plano: { plano: string; nome: string; ativas: number; mrr: number }[]
  trials: { ativos: number; vencendo_7d: number; vencidos_sem_plano: number }
  gateway: { ativo: boolean; ambiente: string; dias_tolerancia: number; bloquear_inadimplente: boolean } | null
}
export function useFinanceiro() {
  return useQuery({ queryKey: ['admin-financeiro'], queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_financeiro'); if (error) throw error; return data as ResumoFinanceiro
  }, retry: false })
}
const R = (c: number) => formatarMoeda(c / 100)
const MES = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')

export default function Financeiro() {
  const q = useFinanceiro()
  if (q.isLoading) return <Carregando />
  if (q.isError) return <Aviso>{mensagemErro(q.error)} — confira se a migração de assinaturas foi aplicada. <button className="underline" onClick={() => q.refetch()}>Tentar novamente</button></Aviso>
  const f = q.data!
  const churnBase = f.assinaturas.ativas + f.assinaturas.canceladas_30d
  const churn = churnBase ? Math.round((f.assinaturas.canceladas_30d / churnBase) * 1000) / 10 : 0
  const max = Math.max(1, ...f.receita_12m.map(m => m.assinaturas + m.avulsas))
  const total12 = f.receita_12m.reduce((s, m) => s + m.assinaturas + m.avulsas, 0)

  const kpis: { rotulo: string; valor: string; sub?: string; alerta?: boolean }[] = [
    { rotulo: 'MRR (receita recorrente)', valor: R(f.mrr), sub: `ARR ${R(f.arr)}` },
    { rotulo: 'Recebido no mês', valor: R(f.recebido_mes), sub: `Líquido Asaas ${R(f.liquido_mes)}` },
    { rotulo: 'Assinaturas ativas', valor: String(f.assinaturas.ativas), sub: `Ticket médio ${R(f.ticket_medio)}` },
    { rotulo: 'Inadimplência', valor: R(f.inadimplente), sub: `${f.clientes_inadimplentes} cliente(s) · ${f.suspensas_por_atraso} suspenso(s)`, alerta: f.inadimplente > 0 },
    { rotulo: 'A receber (faturas em aberto)', valor: R(f.a_receber) },
    { rotulo: 'MRR em risco (atrasadas)', valor: R(f.mrr_em_risco), alerta: f.mrr_em_risco > 0 },
    { rotulo: 'Novas assinaturas (30 dias)', valor: String(f.assinaturas.novas_30d), sub: `${f.assinaturas.pendentes} aguardando 1º pagamento` },
    { rotulo: 'Cancelamentos (30 dias)', valor: String(f.assinaturas.canceladas_30d), sub: `Churn ${churn.toLocaleString('pt-BR')}%`, alerta: f.assinaturas.canceladas_30d > 0 },
  ]

  return <>
    <CabecalhoPagina titulo="Painel financeiro" descricao="Receita recorrente das assinaturas do Asaas e cobranças avulsas confirmadas. Valores em tempo real do banco."
      acoes={<div className="flex flex-wrap gap-2"><Link to="/master/assinaturas" className="inline-flex h-10 items-center rounded-md border px-4 text-sm hover:bg-muted">Assinaturas</Link><Link to="/master/cobrancas" className="inline-flex h-10 items-center rounded-md border px-4 text-sm hover:bg-muted">Cobranças avulsas</Link></div>} />
    {!f.gateway?.ativo && <div className="mb-5"><Aviso tipo="info">O Asaas ainda não está ativo: clientes não conseguem contratar planos. <Link className="underline" to="/master/integracoes">Configurar agora</Link></Aviso></div>}
    {f.gateway?.ativo && f.gateway.ambiente !== 'production' && <div className="mb-5"><Aviso tipo="info">Asaas em ambiente de testes (sandbox): as cobranças não são reais.</Aviso></div>}

    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {kpis.map(k => <Card key={k.rotulo} className="p-5">
        <div className="text-sm text-muted-foreground">{k.rotulo}</div>
        <div className={`mt-2 text-2xl font-semibold tabular-nums ${k.alerta ? 'text-warning' : ''}`}>{k.valor}</div>
        {k.sub && <div className="mt-1 text-xs text-muted-foreground">{k.sub}</div>}
      </Card>)}
    </div>

    <div className="mt-6 grid gap-6 lg:grid-cols-3">
      <Card className="p-6 lg:col-span-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-semibold">Receita confirmada · 12 meses</h2><span className="text-sm text-muted-foreground">{R(total12)} no período</span></div>
        <div className="mt-6 flex h-44 items-end gap-2" role="img" aria-label="Receita por mês">
          {f.receita_12m.map(m => { const t = m.assinaturas + m.avulsas; return <div key={m.mes} className="group relative flex h-full flex-1 flex-col justify-end">
            <div className="w-full rounded-t bg-sky-500/80" style={{ height: `${(m.avulsas / max) * 100}%` }} />
            <div className={`w-full bg-primary/80 group-hover:bg-primary ${m.avulsas ? '' : 'rounded-t'}`} style={{ height: `${Math.max(t ? 2 : 0.5, (m.assinaturas / max) * 100)}%` }} />
            <div className="pointer-events-none absolute -top-14 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs text-background group-hover:block">{MES(m.mes)}: {R(t)}<br />Assinaturas {R(m.assinaturas)} · Avulsas {R(m.avulsas)}</div>
          </div> })}
        </div>
        <div className="mt-2 flex gap-2 text-[11px] text-muted-foreground">{f.receita_12m.map(m => <span key={m.mes} className="flex-1 text-center">{MES(m.mes)}</span>)}</div>
        <div className="mt-3 flex gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-primary/80" />Assinaturas</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-sky-500/80" />Avulsas</span></div>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold">MRR por plano</h2>
        {!f.por_plano.length && <p className="mt-4 text-sm text-muted-foreground">Nenhuma assinatura ativa ainda.</p>}
        <ul className="mt-4 space-y-3">{f.por_plano.map(p => <li key={p.plano}>
          <div className="flex justify-between text-sm"><span>{p.nome} <span className="text-muted-foreground">· {p.ativas}</span></span><span className="tabular-nums">{R(p.mrr)}</span></div>
          <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${(p.mrr / Math.max(1, f.mrr)) * 100}%` }} /></div>
        </li>)}</ul>
        <div className="mt-6 space-y-2 border-t pt-4 text-sm">
          <h3 className="font-medium">Funil de conversão</h3>
          <p className="flex justify-between"><span className="text-muted-foreground">Testes ativos</span><span>{f.trials.ativos}</span></p>
          <p className="flex justify-between"><span className="text-muted-foreground">Testes vencendo em 7 dias</span><Badge cor={f.trials.vencendo_7d ? 'amarelo' : 'neutro'}>{f.trials.vencendo_7d}</Badge></p>
          <p className="flex justify-between"><span className="text-muted-foreground">Teste vencido sem plano</span><Badge cor={f.trials.vencidos_sem_plano ? 'vermelho' : 'neutro'}>{f.trials.vencidos_sem_plano}</Badge></p>
          <Link to="/master/clientes" className="block pt-1 text-primary hover:underline">Abordar clientes em teste →</Link>
        </div>
      </Card>
    </div>
    {f.gateway && <p className="mt-4 text-xs text-muted-foreground">Regra de inadimplência: {f.gateway.bloquear_inadimplente ? `suspende a conta ${f.gateway.dias_tolerancia} dia(s) após o vencimento sem pagamento e libera sozinha quando o Asaas confirma.` : 'suspensão automática desligada.'} <Link className="underline" to="/master/integracoes">Alterar</Link></p>}
  </>
}
