import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatarMoeda } from '@/lib/format'
import { Aviso, CabecalhoPagina, Card, Carregando } from '@/components/ui'
import { useFinanceiro } from './Financeiro'

interface Resumo {
  organizacoes: number
  usuarios: number
  usuarios_confirmados: number
  empresas: number
  processos: number
  documentos: number
  contratos: number
  suspensas: number
  trials_ativos: number
  trials_vencendo: number
  trials_vencidos: number
  pagantes: number
  ativos_7d: number
  por_plano: Record<string, number>
  cadastros_30d: { dia: string; n: number }[]
}

const NOME_PLANO: Record<string, string> = {
  trial: 'Teste grátis',
  essencial: 'Essencial',
  profissional: 'Profissional',
  assessoria: 'Assessoria',
  cancelado: 'Cancelado',
}

export default function VisaoGeral() {
  const q = useQuery({
    queryKey: ['admin-resumo'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_resumo')
      if (error) throw error
      return data as Resumo
    },
  })

  const fin = useFinanceiro()
  const chamados = useQuery({
    queryKey: ['admin-chamados-abertos'],
    queryFn: async () => {
      const { count, error } = await supabase.from('suporte_chamados').select('id', { count: 'exact', head: true }).in('status', ['aberto', 'em_andamento'])
      if (error) throw error
      return count ?? 0
    },
  })

  if (q.isLoading) return <Carregando />
  if (q.error) return <Aviso>{(q.error as Error).message}</Aviso>
  const r = q.data!
  const max = Math.max(1, ...r.cadastros_30d.map((c) => c.n))

  const kpis = [
    { rotulo: 'Organizações', valor: r.organizacoes },
    { rotulo: 'Usuários', valor: r.usuarios, sub: `${r.usuarios_confirmados} com e-mail confirmado` },
    { rotulo: 'Ativos (7 dias)', valor: r.ativos_7d },
    { rotulo: 'Em plano comercial', valor: r.pagantes },
    { rotulo: 'Testes ativos', valor: r.trials_ativos, sub: `${r.trials_vencendo} vencem em até 3 dias` },
    { rotulo: 'Testes vencidos', valor: r.trials_vencidos, alerta: r.trials_vencidos > 0 },
    { rotulo: 'Suspensas', valor: r.suspensas, alerta: r.suspensas > 0 },
    { rotulo: 'Empresas (CNPJ)', valor: r.empresas },
  ]

  return (
    <>
      <CabecalhoPagina titulo="Visão geral da plataforma" descricao="Receita, clientes e o que precisa da sua atenção hoje." />

      {fin.data && (
        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { rotulo: 'MRR', valor: formatarMoeda(fin.data.mrr / 100), sub: `${fin.data.assinaturas.ativas} assinaturas ativas` },
            { rotulo: 'Recebido no mês', valor: formatarMoeda(fin.data.recebido_mes / 100) },
            { rotulo: 'Inadimplência', valor: formatarMoeda(fin.data.inadimplente / 100), sub: `${fin.data.clientes_inadimplentes} cliente(s)`, alerta: fin.data.inadimplente > 0 },
            { rotulo: 'A receber', valor: formatarMoeda(fin.data.a_receber / 100) },
          ].map((k) => (
            <Link key={k.rotulo} to="/master/financeiro" className="block">
              <Card className="h-full p-5 transition-colors hover:border-primary/50">
                <div className="text-sm text-muted-foreground">{k.rotulo}</div>
                <div className={`mt-2 text-2xl font-semibold tabular-nums ${k.alerta ? 'text-warning' : ''}`}>{k.valor}</div>
                {k.sub && <div className="mt-1 text-xs text-muted-foreground">{k.sub}</div>}
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Atencao r={r} fin={fin.data} chamados={chamados.data ?? 0} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.rotulo} className="p-5">
            <div className="text-sm text-muted-foreground">{k.rotulo}</div>
            <div className={`mt-2 text-3xl font-semibold tabular-nums ${k.alerta ? 'text-warning' : ''}`}>{k.valor}</div>
            {k.sub && <div className="mt-1 text-xs text-muted-foreground">{k.sub}</div>}
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <h2 className="font-semibold">Novos cadastros · últimos 30 dias</h2>
          <div className="mt-6 flex h-40 items-end gap-1" role="img" aria-label="Gráfico de cadastros por dia">
            {r.cadastros_30d.map((c) => (
              <div key={c.dia} className="group relative flex-1">
                <div className="w-full rounded-t bg-primary/80 transition-colors group-hover:bg-primary" style={{ height: `${Math.max(2, (c.n / max) * 160)}px` }} />
                <div className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs text-background group-hover:block">
                  {new Date(`${c.dia}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}: {c.n}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>há 30 dias</span>
            <span>hoje</span>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold">Organizações por plano</h2>
          <ul className="mt-4 space-y-3">
            {Object.entries(r.por_plano).map(([plano, n]) => (
              <li key={plano}>
                <div className="flex justify-between text-sm">
                  <span>{NOME_PLANO[plano] ?? plano}</span>
                  <span className="tabular-nums text-muted-foreground">{n}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-accent" style={{ width: `${(n / Math.max(1, r.organizacoes)) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-6 grid grid-cols-3 gap-2 border-t pt-4 text-center text-sm">
            <div>
              <div className="font-semibold tabular-nums">{r.processos}</div>
              <div className="text-xs text-muted-foreground">processos</div>
            </div>
            <div>
              <div className="font-semibold tabular-nums">{r.documentos}</div>
              <div className="text-xs text-muted-foreground">documentos</div>
            </div>
            <div>
              <div className="font-semibold tabular-nums">{r.contratos}</div>
              <div className="text-xs text-muted-foreground">contratos</div>
            </div>
          </div>
        </Card>
      </div>
    </>
  )
}

function Atencao({ r, fin, chamados }: { r: Resumo; fin?: ReturnType<typeof useFinanceiro>['data']; chamados: number }) {
  const itens = [
    fin && fin.clientes_inadimplentes > 0 && { texto: `${fin.clientes_inadimplentes} cliente(s) com fatura vencida (${formatarMoeda(fin.inadimplente / 100)})`, rota: '/master/assinaturas' },
    fin && fin.suspensas_por_atraso > 0 && { texto: `${fin.suspensas_por_atraso} conta(s) suspensa(s) automaticamente por atraso`, rota: '/master/assinaturas' },
    fin && fin.assinaturas.pendentes > 0 && { texto: `${fin.assinaturas.pendentes} assinatura(s) aguardando o 1º pagamento`, rota: '/master/assinaturas' },
    r.trials_vencendo > 0 && { texto: `${r.trials_vencendo} teste(s) grátis vencem em até 3 dias: hora de converter`, rota: '/master/clientes?filtro=trial' },
    r.trials_vencidos > 0 && { texto: `${r.trials_vencidos} teste(s) vencido(s) sem plano`, rota: '/master/clientes?filtro=vencidos' },
    chamados > 0 && { texto: `${chamados} chamado(s) de suporte aberto(s)`, rota: '/master/suporte' },
    fin?.gateway && !fin.gateway.ativo && { texto: 'Asaas desativado: clientes não conseguem contratar planos', rota: '/master/integracoes' },
  ].filter(Boolean) as { texto: string; rota: string }[]
  return (
    <Card className="mb-6 p-5">
      <h2 className="font-semibold">Precisa de atenção</h2>
      {!itens.length && <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-success" />Nada pendente agora.</p>}
      <ul className="mt-3 space-y-2">
        {itens.map((i) => (
          <li key={i.texto}>
            <Link to={i.rota} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              <span className="flex-1">{i.texto}</span>
              <span className="text-primary">Abrir →</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
