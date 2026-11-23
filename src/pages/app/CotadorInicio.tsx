import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Calculator } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/providers/OrgProvider'
import { useLista } from '@/hooks/useDados'
import { textoLimite, type LimiteIA } from '@/lib/agentesIA'
import { ETAPAS_FINAIS } from '@/lib/dominio'
import { formatarDataHora } from '@/lib/format'
import type { Processo } from '@/types/db'
import { Badge, Card, Carregando, Vazio } from '@/components/ui'

/** Escolha do processo para cotar. */
export default function CotadorInicio() {
  const { org } = useOrg()
  const processos = useLista<Processo>('processos', { porEmpresa: false, ordem: ['data_abertura', true] })
  const uso = useQuery({ queryKey: ['ia-uso-resumo', org?.id], enabled: !!org, queryFn: async () => {
    const { data, error } = await supabase.rpc('ia_uso_resumo', { p_org: org!.id }); if (error) throw error; return data as Record<string, LimiteIA>
  } })
  const ativos = (processos.data ?? []).filter((p) => !ETAPAS_FINAIS.includes(p.etapa) && !p.arquivado_em)
  const u = uso.data?.cotador
  return (
    <>
      <Link to="/app/agentes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Agentes de IA</Link>
      <Card className="mb-5 p-5 sm:p-6">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><Calculator className="h-6 w-6 text-primary" />Cotador <Badge cor="azul">Beta</Badge></h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Importa os itens do edital, pesquisa o preço de mercado de cada um nas compras públicas dos últimos 12 meses, calcula o seu
          preço-limite com custo e margem, sugere o preço da proposta e baixa a planilha pronta.
        </p>
        {u && <p className="mt-3 text-xs text-muted-foreground">Processos cotados neste mês: {u.usadas ?? 0}{u.limite === null ? '' : ` de ${textoLimite(u.limite)}`.replace(' por mês', '')}. Cada processo conta uma vez por mês.</p>}
      </Card>
      <h2 className="mb-3 text-lg font-semibold">Escolha o processo</h2>
      {processos.isLoading ? <Carregando /> : !ativos.length ? (
        <Vazio icone={Calculator} titulo="Nenhum processo em andamento" texto="Adicione um edital aos processos pela tela de Oportunidades ou pelo Radar." />
      ) : (
        <Card className="divide-y">
          {ativos.map((p) => (
            <Link key={p.id} to={`/app/agentes/cotador/${p.id}`} className="flex flex-col gap-1 p-4 hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{p.numero ? `${p.numero} · ` : ''}{p.objeto}</span>
                <span className="text-xs text-muted-foreground">{p.orgao_nome ?? ''}{p.pncp_controle ? '' : ' · sem edital do PNCP vinculado'}</span></span>
              <span className="shrink-0 text-xs text-muted-foreground">{p.data_abertura ? `Abertura ${formatarDataHora(p.data_abertura)}` : ''}</span>
            </Link>
          ))}
        </Card>
      )}
    </>
  )
}
