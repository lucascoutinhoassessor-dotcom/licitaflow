import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Trophy } from 'lucide-react'
import { supabase, mensagemErro } from '@/lib/supabase'
import { formatarData, formatarMoeda } from '@/lib/format'
import { STATUS_ASSINATURA, type StatusAssinatura } from '@/lib/pagamentos'
import { Aviso, Badge, CabecalhoPagina, Card, Carregando } from '@/components/ui'

interface Linha { org_id: string; nome: string; plano: string; total_pago: number; meses_pagos: number; processos: number; usuarios: number; ultimo_acesso: string | null; assinatura_status: StatusAssinatura | null; created_at: string }

/** Saúde da conta: uso recente e quantidade de processos. Ajuda a priorizar contato antes do cancelamento. */
function saude(l: Linha): { rotulo: string; cor: 'verde' | 'amarelo' | 'vermelho' } {
  const dias = l.ultimo_acesso ? (Date.now() - new Date(l.ultimo_acesso).getTime()) / 86_400_000 : Infinity
  if (dias <= 7 && l.processos > 0) return { rotulo: 'Engajado', cor: 'verde' }
  if (dias <= 30) return { rotulo: 'Uso baixo', cor: 'amarelo' }
  return { rotulo: 'Sem uso recente', cor: 'vermelho' }
}

export default function Ranking() {
  const q = useQuery({ queryKey: ['admin-ranking'], queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_ranking_clientes'); if (error) throw error; return data as Linha[]
  } })
  return <>
    <CabecalhoPagina titulo="Melhores clientes" descricao="Ordenado por receita paga ao LicitaForce e, em seguida, por uso (processos). A saúde indica risco de cancelamento." />
    {q.isLoading && <Carregando />}
    {q.isError && <Aviso>{mensagemErro(q.error)} <button className="underline" onClick={() => q.refetch()}>Tentar novamente</button></Aviso>}
    {q.data && <Card className="overflow-x-auto"><table className="w-full min-w-[820px] whitespace-nowrap text-sm">
      <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3 font-medium">#</th><th className="font-medium">Cliente</th><th className="font-medium">Total pago</th><th className="font-medium">Faturas pagas</th><th className="font-medium">Processos</th><th className="font-medium">Usuários</th><th className="font-medium">Último acesso</th><th className="font-medium">Saúde</th></tr></thead>
      <tbody>{q.data.map((l, i) => { const s = saude(l); return <tr key={l.org_id} className="border-b last:border-0 hover:bg-muted/40">
        <td className="p-3 tabular-nums">{i < 3 ? <Trophy className={`h-4 w-4 ${['text-amber-400', 'text-zinc-400', 'text-orange-600'][i]}`} aria-label={`${i + 1}º`} /> : i + 1}</td>
        <td><Link to={`/master/organizacoes/${l.org_id}`} className="font-medium hover:underline">{l.nome}</Link>
          <div className="flex flex-wrap gap-1 pt-1 text-xs text-muted-foreground">{l.plano}{l.assinatura_status && <Badge cor={STATUS_ASSINATURA[l.assinatura_status].cor}>{STATUS_ASSINATURA[l.assinatura_status].rotulo}</Badge>}</div></td>
        <td className="font-medium tabular-nums">{formatarMoeda(l.total_pago / 100)}</td>
        <td className="tabular-nums">{l.meses_pagos}</td><td className="tabular-nums">{l.processos}</td><td className="tabular-nums">{l.usuarios}</td>
        <td>{l.ultimo_acesso ? formatarData(l.ultimo_acesso) : 'Nunca'}</td>
        <td><Badge cor={s.cor}>{s.rotulo}</Badge></td>
      </tr> })}</tbody>
    </table></Card>}
  </>
}
