import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ScanEye } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/providers/OrgProvider'
import { formatarDataHora } from '@/lib/format'
import { Badge, Card } from '@/components/ui'
import type { Processo } from '@/types/db'

export interface Vigiado {
  processo_id: string; objeto: string; numero: string | null; controle: string
  verificado_em: string | null; situacao: string | null; encerramento: string | null; alterado_em: string | null
  proxima_em?: string; falhas?: number; ultimo_erro?: string | null; documentos?: number; existe_resultado?: boolean
  empresa_nome?: string; empresa_cnpj?: string; resultados_consultados_em?: string | null
  resultados_parcial?: boolean; resultados_erro?: string | null
  historico?: { data: string; operacao: string; categoria: string; item?: number | null; documento?: string | null; justificativa?: string }[]
  historico_erro?: string | null; historico_parcial?: boolean
  resultados_cliente?: { item: number; situacao_id: number; situacao: string; valor: number; classificacao?: number | null; reserva?: number | null }[]
}

export function AcompanhamentoSentinela({ v }: { v: Vigiado }) {
  const falha = !!v.falhas || !!v.resultados_erro || !!v.historico_erro
  const atrasado = !!v.proxima_em && Date.parse(v.proxima_em) < Date.now() - 30 * 60e3
  const resultado = v.resultados_cliente ?? []
  const cnpj = v.empresa_cnpj?.replace(/[^a-z0-9]/gi, '').toUpperCase()
  const temCnpj = !!cnpj && /^[A-Z0-9]{12}\d{2}$/.test(cnpj)
  const prazo = v.encerramento ? Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(v.encerramento) ? v.encerramento : `${v.encerramento}-03:00`) : NaN
  const proximoPasso = !v.verificado_em ? 'Aguarde a primeira consulta para conhecer a situação publicada.'
    : /suspens/i.test(v.situacao ?? '') ? 'Acompanhe a publicação da retomada e de uma nova data antes de reorganizar a proposta.'
    : /revoga|anula/i.test(v.situacao ?? '') ? 'Confira o motivo publicado pelo órgão e acompanhe eventual nova contratação.'
    : v.existe_resultado ? 'Confira os resultados dos itens, eventuais cancelamentos e a convocação no portal da disputa.'
    : prazo > Date.now() ? 'Prepare a proposta e os documentos de habilitação e envie a proposta no portal da disputa dentro do prazo.'
    : prazo <= Date.now() ? 'O prazo das propostas passou. Acompanhe julgamento, habilitação e mensagens no portal da disputa enquanto o órgão publica as atualizações no PNCP.'
    : 'Confira o cronograma e os documentos no edital e no portal da disputa.'
  return <div className="text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="flex items-center gap-2 font-semibold"><ScanEye className="h-4 w-4 text-primary" /> Acompanhamento do Sentinela</p>
      <Badge cor={falha || atrasado ? 'amarelo' : v.verificado_em ? 'verde' : 'azul'}>{falha ? 'Consulta com falha' : atrasado ? 'Verificação atrasada' : v.verificado_em ? 'PNCP consultado' : 'Na fila'}</Badge>
    </div>
    <ol className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
      <li><strong>1. Empresa do processo</strong><p className="mt-1 text-muted-foreground">{temCnpj ? `${v.empresa_nome} · CNPJ ${v.empresa_cnpj}` : 'Vincule uma empresa com CNPJ válido para conferir seus resultados.'}</p></li>
      <li><strong>2. Situação e documentos</strong><p className="mt-1 text-muted-foreground">{v.verificado_em ? `${v.situacao ?? 'Situação não informada'} · ${v.documentos ?? 0} documento(s). Consultado em ${formatarDataHora(v.verificado_em)}.` : 'Aguardando a primeira consulta ao PNCP.'}</p></li>
      <li><strong>3. Resultado por CNPJ</strong><p className="mt-1 text-muted-foreground">{!temCnpj ? 'Conferência depende da empresa vinculada.' : v.resultados_erro ? `Não foi possível concluir: ${v.resultados_erro}` : !v.existe_resultado ? 'Aguardando o órgão publicar resultados no PNCP.' : !v.resultados_consultados_em ? 'Resultados publicados; conferência dos itens na fila.' : v.resultados_parcial ? 'Conferência parcial dos itens; continua na próxima consulta.' : resultado.length ? `${resultado.length} registro(s) para o CNPJ desta empresa.` : 'CNPJ não encontrado nos resultados consultados. Isso não confirma derrota ou desclassificação.'}</p>
        {resultado.length > 0 && <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto text-muted-foreground">{resultado.map((r, i) => <li key={`${r.item}-${i}`}>Item {r.item}: {r.situacao ?? (Number(r.situacao_id) === 2 ? 'Cancelado' : 'Informado')}{r.reserva === 3 ? ' · Cadastro de reserva' : ''}{r.classificacao ? ` · Classificação publicada: ${r.classificacao}` : ''}</li>)}</ul>}
      </li>
      <li><strong>4. Próxima verificação</strong><p className="mt-1 text-muted-foreground">{v.proxima_em ? `${formatarDataHora(v.proxima_em)}${atrasado ? ' · aguardando o agendador' : ' · novas publicações entram no histórico e nos avisos'}.` : 'Aguardando o agendador iniciar o acompanhamento.'}</p></li>
    </ol>
    {!!v.historico?.length && <div className="mt-3 border-t pt-3">
      <p className="text-xs font-semibold">Últimas publicações consultadas</p>
      <ol className="mt-2 space-y-2 border-l pl-3 text-xs text-muted-foreground">{v.historico.slice(0, 5).map((h, i) => <li key={`${h.data}-${i}`}>
        <span className="block">{h.data.slice(0, 16).replace(/^(\d{4})-(\d{2})-(\d{2})T/, '$3/$2/$1 ')}</span>
        <span className="text-foreground">{h.operacao} · {h.categoria}{h.item ? ` · Item ${h.item}` : ''}{h.documento ? ` · ${h.documento}` : ''}</span>
        {h.justificativa && <p className="mt-0.5 break-words">{h.justificativa}</p>}
      </li>)}</ol>
      {v.historico_parcial && <p className="mt-2 text-xs text-muted-foreground">Histórico parcial; a consulta continua na próxima verificação.</p>}
    </div>}
    {v.historico_erro && <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">Histórico do órgão indisponível nesta consulta. Nova tentativa agendada.</p>}
    <p className="mt-3 rounded-md bg-muted/50 p-3 text-xs"><strong>Próximo passo: </strong>{proximoPasso}</p>
    {!!v.falhas && <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">{v.ultimo_erro ?? 'O PNCP não respondeu à última consulta.'} Nova tentativa agendada. Os dados acima são da última consulta concluída.</p>}
    <p className="mt-3 text-xs text-muted-foreground">Fonte: publicações do PNCP. Lances, mensagens e habilitação em tempo real devem ser acompanhados no portal da disputa. A etapa do Kanban é atualizada pela sua equipe.</p>
  </div>
}

export function SentinelaNoProcesso({ processo }: { processo: Processo }) {
  const { org } = useOrg()
  const q = useQuery({ queryKey: ['sentinela-resumo', org?.id], enabled: !!org, refetchInterval: 120_000, queryFn: async () => {
    const { data, error } = await supabase.rpc('sentinela_resumo', { p_org: org!.id })
    if (error) throw error
    return data as { vigiados: Vigiado[]; liberado: boolean }
  } })
  const v = q.data?.vigiados.find(x => x.processo_id === processo.id)
  return <Card className="mb-5 p-4">
    {v ? <AcompanhamentoSentinela v={v} /> : <div className="text-sm"><strong>Sentinela</strong><p className="mt-1 text-muted-foreground">{q.isError ? 'Não foi possível consultar o acompanhamento agora.' : q.isLoading ? 'Consultando o acompanhamento…' : !processo.pncp_controle ? 'Vincule o edital do PNCP para iniciar o acompanhamento.' : !processo.monitorar ? 'Monitoramento desligado neste processo.' : processo.arquivado_em || ['homologado', 'concluido', 'perdido', 'desistencia'].includes(processo.etapa) ? 'Acompanhamento encerrado para este processo.' : !q.data?.liberado ? 'O módulo de agentes não está liberado para esta conta.' : 'Este processo está fora do limite de acompanhamento do plano.'}</p></div>}
    <Link className="mt-3 inline-block text-xs font-medium text-primary hover:underline" to="/app/agentes/sentinela">Ver avisos do Sentinela</Link>
  </Card>
}
