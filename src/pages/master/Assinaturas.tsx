import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase, mensagemErro } from '@/lib/supabase'
import { formatarData, formatarMoeda } from '@/lib/format'
import { STATUS_ASSINATURA, type StatusAssinatura } from '@/lib/pagamentos'
import { Abas, Aviso, Badge, CabecalhoPagina, Card, Carregando, Input } from '@/components/ui'

interface Linha {
  id: string; org_id: string; org_nome: string; dono_email: string | null; plano_id: string; plano_nome: string; ciclo: string; valor_centavos: number
  forma: string; status: StatusAssinatura; proximo_vencimento: string | null; pago_ate: string | null; link_pagamento: string | null
  gateway_assinatura_id: string | null; erro: string | null; created_at: string; cancelada_em: string | null; faturas_atrasadas: number; total_pago: number; suspensa: boolean
}
type Filtro = 'todas' | StatusAssinatura

export default function Assinaturas() {
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busca, setBusca] = useState('')
  const q = useQuery({ queryKey: ['admin-assinaturas'], queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_assinaturas'); if (error) throw error; return data as Linha[]
  } })
  const eventos = useQuery({ queryKey: ['gateway-eventos'], queryFn: async () => {
    const { data, error } = await supabase.from('gateway_eventos').select('id,evento,recebido_em,resultado').order('recebido_em', { ascending: false }).limit(15)
    if (error) throw error; return data as { id: string; evento: string; recebido_em: string; resultado: string | null }[]
  } })
  const lista = useMemo(() => q.data ?? [], [q.data])
  const conta = (s: StatusAssinatura) => lista.filter(l => l.status === s).length
  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return lista.filter(l => (filtro === 'todas' || l.status === filtro) && (!t || l.org_nome.toLowerCase().includes(t) || (l.dono_email ?? '').toLowerCase().includes(t)))
  }, [lista, filtro, busca])

  return <>
    <CabecalhoPagina titulo="Assinaturas" descricao="Todas as assinaturas recorrentes do Asaas. Abra o cliente para trocar plano, cancelar ou sincronizar." />
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1 overflow-x-auto"><Abas atual={filtro} aoTrocar={(id) => setFiltro(id as Filtro)} abas={[
        { id: 'todas', rotulo: 'Todas', contagem: lista.length }, { id: 'atrasada', rotulo: 'Em atraso', contagem: conta('atrasada') },
        { id: 'pendente', rotulo: 'Aguardando', contagem: conta('pendente') }, { id: 'ativa', rotulo: 'Ativas', contagem: conta('ativa') },
        { id: 'cancelada', rotulo: 'Canceladas', contagem: conta('cancelada') }]} /></div>
      <Input className="lg:w-72" placeholder="Buscar cliente ou e-mail" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar assinatura" />
    </div>
    {q.isLoading && <Carregando />}
    {q.isError && <Aviso>{mensagemErro(q.error)} <button className="underline" onClick={() => q.refetch()}>Tentar novamente</button></Aviso>}
    {q.data && <Card className="overflow-x-auto"><table className="w-full min-w-[860px] whitespace-nowrap text-sm">
      <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3 font-medium">Cliente</th><th className="font-medium">Plano</th><th className="font-medium">Valor</th><th className="font-medium">Situação</th><th className="font-medium">Próx. vencimento</th><th className="font-medium">Pago até</th><th className="font-medium">Total pago</th><th /></tr></thead>
      <tbody>{visiveis.map(l => <tr key={l.id} className="border-b last:border-0 hover:bg-muted/40">
        <td className="p-3"><Link to={`/master/clientes/${l.org_id}`} className="font-medium hover:underline">{l.org_nome}</Link><div className="text-xs text-muted-foreground">{l.dono_email}</div></td>
        <td>{l.plano_nome}<div className="text-xs text-muted-foreground">{l.ciclo}</div></td>
        <td className="tabular-nums">{formatarMoeda(l.valor_centavos / 100)}</td>
        <td><div className="flex flex-wrap gap-1"><Badge cor={STATUS_ASSINATURA[l.status].cor}>{STATUS_ASSINATURA[l.status].rotulo}</Badge>{l.suspensa && <Badge cor="vermelho">Conta suspensa</Badge>}{l.erro && <Badge cor="amarelo">Revisar</Badge>}</div>
          {l.faturas_atrasadas > 0 && <div className="mt-1 text-xs text-destructive">{l.faturas_atrasadas} fatura(s) vencida(s)</div>}</td>
        <td>{formatarData(l.proximo_vencimento)}</td><td>{l.pago_ate ? formatarData(l.pago_ate) : '—'}</td>
        <td className="tabular-nums">{formatarMoeda(l.total_pago / 100)}</td>
        <td className="pr-3 text-right">{l.link_pagamento && l.status === 'pendente' && <a className="text-primary hover:underline" href={l.link_pagamento} target="_blank" rel="noopener noreferrer">Link</a>}</td>
      </tr>)}
      {!visiveis.length && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nenhuma assinatura neste filtro.</td></tr>}</tbody>
    </table></Card>}

    <Card className="mt-6 p-5">
      <h2 className="font-semibold">Últimos avisos do Asaas (webhook)</h2>
      {eventos.isError && <p className="mt-2 text-sm text-destructive">Não foi possível consultar os eventos.</p>}
      {eventos.data && !eventos.data.length && <p className="mt-2 text-sm text-muted-foreground">Nenhum evento recebido ainda. Confira a configuração do webhook em Integrações.</p>}
      <ul className="mt-3 divide-y text-sm">{eventos.data?.map(e => <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2"><span className="font-mono text-xs">{e.evento}</span><span className="text-muted-foreground">{e.resultado ?? '—'}</span><span className="text-xs text-muted-foreground">{new Date(e.recebido_em).toLocaleString('pt-BR')}</span></li>)}</ul>
    </Card>
  </>
}
