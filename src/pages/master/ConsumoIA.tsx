import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase, mensagemErro } from '@/lib/supabase'
import { formatarMoeda } from '@/lib/format'
import { nomeAgente, textoLimite, type LimiteIA } from '@/lib/agentesIA'
import { Aviso, Badge, CabecalhoPagina, Card, Carregando, Input, Vazio } from '@/components/ui'

interface LinhaConsumo {
  org_id: string; org: string; plano: string; mensal_centavos: number; agente: string
  novas: number; reaproveitadas: number; custo_usd: number; tokens: number; limite: LimiteIA
}
const dolar = (v: number) => `US$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}`
const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

/** Consumo de IA por cliente no mês: usos novos, reaproveitados, custo estimado e plano, para acompanhar a margem. */
export default function ConsumoIA() {
  const [mes, setMes] = useState(mesAtual())
  const q = useQuery({ queryKey: ['admin-consumo-ia', mes], queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_consumo_ia', { p_mes: `${mes}-01` })
    if (error) throw error
    return data as { inicio: string; fim: string; linhas: LinhaConsumo[] }
  } })
  const linhas = q.data?.linhas ?? []
  const total = linhas.reduce((s, l) => s + Number(l.custo_usd), 0)
  const novas = linhas.reduce((s, l) => s + l.novas, 0)
  const reaproveitadas = linhas.reduce((s, l) => s + l.reaproveitadas, 0)

  return (
    <>
      <CabecalhoPagina titulo="Consumo de IA" descricao="Quanto cada cliente usou dos agentes de IA no mês e o custo estimado, ao lado do plano dele. Os limites se ajustam em Planos e na ficha do cliente." />
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="text-sm">Mês<Input type="month" value={mes} max={mesAtual()} onChange={(e) => e.target.value && setMes(e.target.value)} className="mt-1 w-44" /></label>
      </div>
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-4"><p className="text-sm text-muted-foreground">Custo estimado de IA</p><p className="mt-1 text-2xl font-semibold">{dolar(total)}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted-foreground">Usos novos (com custo)</p><p className="mt-1 text-2xl font-semibold">{novas}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted-foreground">Reaproveitados (sem custo)</p><p className="mt-1 text-2xl font-semibold">{reaproveitadas}</p></Card>
      </div>
      {q.isLoading ? <Carregando /> : q.isError ? <Aviso>{mensagemErro(q.error)}</Aviso> : !linhas.length ? (
        <Vazio titulo="Nenhum uso de IA neste mês" texto="Quando os clientes usarem os agentes, o consumo aparece aqui." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-3">Cliente</th><th className="p-3">Plano</th><th className="p-3">Agente</th><th className="p-3 text-right">Novos</th><th className="p-3 text-right">Reaprov.</th><th className="p-3 text-right">Custo IA</th><th className="p-3 text-right">Mensalidade</th></tr>
            </thead>
            <tbody className="divide-y">
              {linhas.map((l) => {
                const lim = l.limite?.limite
                const estourou = lim !== null && lim !== undefined && lim > 0 && l.novas >= lim
                return (
                  <tr key={`${l.org_id}-${l.agente}`}>
                    <td className="p-3"><Link className="font-medium text-primary hover:underline" to={`/master/clientes/${l.org_id}`}>{l.org}</Link></td>
                    <td className="p-3">{l.plano}</td>
                    <td className="p-3">{nomeAgente(l.agente)}<span className="block text-xs text-muted-foreground">{textoLimite(lim)}{l.limite?.origem === 'cliente' ? ' (exceção)' : ''}</span></td>
                    <td className="p-3 text-right">{l.novas} {estourou && <Badge cor="amarelo">No limite</Badge>}</td>
                    <td className="p-3 text-right">{l.reaproveitadas}</td>
                    <td className="p-3 text-right font-medium">{dolar(l.custo_usd)}</td>
                    <td className="p-3 text-right">{formatarMoeda(l.mensal_centavos / 100)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
      <p className="mt-4 text-xs text-muted-foreground">O custo é estimado pelos tokens de cada leitura, no preço oficial do modelo, e está em dólar. A mensalidade é o preço de catálogo do plano, em reais.</p>
    </>
  )
}
