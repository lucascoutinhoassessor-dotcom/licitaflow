import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BellRing, ExternalLink, ScanEye } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/providers/OrgProvider'
import { formatarDataHora } from '@/lib/format'
import { textoLimite, type LimiteIA } from '@/lib/agentesIA'
import { Aviso, Badge, Card, Carregando, Vazio } from '@/components/ui'

interface Vigiado { processo_id: string; objeto: string; numero: string | null; controle: string; verificado_em: string | null; situacao: string | null; encerramento: string | null; alterado_em: string | null }
interface Resumo { liberado: boolean; limite: LimiteIA; vigiados: Vigiado[]; fora_do_limite: number; sem_controle: number }
interface Evento { id: number; controle: string; tipo: string; nivel: 'alto' | 'medio' | 'baixo'; titulo: string; detalhe: { url?: string }; created_at: string }

const COR = { alto: 'vermelho', medio: 'amarelo', baixo: 'neutro' } as const
const NIVEL = { alto: 'Atenção', medio: 'Novidade', baixo: 'Informação' }

export default function Sentinela() {
  const { org } = useOrg()
  const resumo = useQuery({ queryKey: ['sentinela-resumo', org?.id], enabled: !!org, refetchInterval: 120_000, queryFn: async () => {
    const { data, error } = await supabase.rpc('sentinela_resumo', { p_org: org!.id })
    if (error) throw error
    return data as Resumo
  } })
  const controles = (resumo.data?.vigiados ?? []).map((v) => v.controle)
  const eventos = useQuery({ queryKey: ['sentinela-eventos', org?.id, controles.join(',')], enabled: controles.length > 0, queryFn: async () => {
    const { data, error } = await supabase.from('sentinela_eventos').select('*').in('controle', controles).order('created_at', { ascending: false }).limit(50)
    if (error) throw error
    return data as Evento[]
  } })
  const processoDe = (controle: string) => resumo.data?.vigiados.find((v) => v.controle === controle)

  const voltar = <Link to="/app/agentes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Agentes de IA</Link>
  if (resumo.isLoading) return <Carregando />
  if (resumo.isError) return <>{voltar}<Aviso>Não foi possível abrir a Sentinela agora.</Aviso></>
  const r = resumo.data!

  return (
    <>
      {voltar}
      <Card className="mb-5 p-5 sm:p-6">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><ScanEye className="h-6 w-6 text-primary" />Sentinela</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Vigia no PNCP os editais dos seus processos em andamento e avisa quando o órgão muda a situação da compra, as datas,
          publica um documento novo (errata, resposta de esclarecimento, aviso) ou o resultado. Os avisos chegam por notificação
          no celular e ficam no histórico de cada processo.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge cor="azul">Seu plano: {textoLimite(r.limite.limite, 'simultaneo')}</Badge>
          <Badge>{r.vigiados.length} vigiados agora</Badge>
          {r.fora_do_limite > 0 && <Badge cor="amarelo">{r.fora_do_limite} fora do limite do plano</Badge>}
        </div>
        {r.limite.limite === 0 && <div className="mt-3"><Aviso tipo="info">O seu plano não inclui a Sentinela. <Link to="/app/plano" className="font-semibold underline">Ver planos</Link>.</Aviso></div>}
        {r.sem_controle > 0 && <p className="mt-3 text-xs text-muted-foreground">{r.sem_controle} processo(s) em andamento não têm o edital do PNCP vinculado e não podem ser vigiados. Processos criados a partir de Oportunidades já vêm vinculados.</p>}
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><BellRing className="h-3.5 w-3.5" />Para receber no celular, toque em "Ativar notificações" na tela de <Link to="/app/avisos" className="font-medium text-primary hover:underline">Avisos</Link>.</p>
      </Card>

      <h2 className="mb-3 text-lg font-semibold">Últimas mudanças</h2>
      {eventos.isLoading ? <Carregando /> : !(eventos.data?.length) ? (
        <Card className="mb-6 p-5 text-sm text-muted-foreground">Nenhuma mudança encontrada até agora. A primeira verificação de cada edital só registra como ele está; dali em diante, toda mudança aparece aqui.</Card>
      ) : (
        <Card className="mb-6 divide-y">
          {eventos.data.map((e) => {
            const p = processoDe(e.controle)
            return (
              <div key={e.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge cor={COR[e.nivel]}>{NIVEL[e.nivel]}</Badge>{formatarDataHora(e.created_at)}
                </div>
                <p className="mt-1 text-sm font-medium">{e.titulo}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {p ? <Link to={`/app/processos/${p.processo_id}`} className="text-primary hover:underline">{p.numero ? `${p.numero} · ` : ''}{p.objeto}</Link> : e.controle}
                  {e.detalhe?.url && <> · <a href={e.detalhe.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">abrir documento <ExternalLink className="h-3 w-3" /></a></>}
                </p>
              </div>
            )
          })}
        </Card>
      )}

      <h2 className="mb-3 text-lg font-semibold">Processos vigiados</h2>
      {!r.vigiados.length ? (
        <Vazio titulo="Nenhum processo vigiado" texto="Adicione editais do PNCP aos seus processos (pela tela de Oportunidades) e a Sentinela passa a acompanhá-los." />
      ) : (
        <Card className="divide-y">
          {r.vigiados.map((v) => (
            <Link key={v.processo_id} to={`/app/processos/${v.processo_id}`} className="flex flex-col gap-1 p-4 hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{v.numero ? `${v.numero} · ` : ''}{v.objeto}</span>
                <span className="text-xs text-muted-foreground">{v.situacao ?? 'Aguardando a primeira verificação'}{v.alterado_em ? ` · última mudança ${formatarDataHora(v.alterado_em)}` : ''}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{v.verificado_em ? `Verificado ${formatarDataHora(v.verificado_em)}` : 'Na fila'}</span>
            </Link>
          ))}
        </Card>
      )}
    </>
  )
}
