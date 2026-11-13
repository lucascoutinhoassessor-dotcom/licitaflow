import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Aviso, CabecalhoPagina, Card, Carregando } from '@/components/ui'

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

  if (q.isLoading) return <Carregando />
  if (q.error) return <Aviso>{(q.error as Error).message}</Aviso>
  const r = q.data!
  const max = Math.max(1, ...r.cadastros_30d.map((c) => c.n))

  const kpis = [
    { rotulo: 'Organizações', valor: r.organizacoes },
    { rotulo: 'Usuários', valor: r.usuarios, sub: `${r.usuarios_confirmados} com e-mail confirmado` },
    { rotulo: 'Ativos (7 dias)', valor: r.ativos_7d },
    { rotulo: 'Pagantes', valor: r.pagantes },
    { rotulo: 'Testes ativos', valor: r.trials_ativos, sub: `${r.trials_vencendo} vencem em até 3 dias` },
    { rotulo: 'Testes vencidos', valor: r.trials_vencidos, alerta: r.trials_vencidos > 0 },
    { rotulo: 'Suspensas', valor: r.suspensas, alerta: r.suspensas > 0 },
    { rotulo: 'Empresas (CNPJ)', valor: r.empresas },
  ]

  return (
    <>
      <CabecalhoPagina titulo="Visão geral da plataforma" descricao="Números de todas as contas do LicitaFlow." />

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
