import { useQuery } from '@tanstack/react-query'
import { Database } from 'lucide-react'
import { Badge, Button, Card } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { formatarDataHora } from '@/lib/format'

type Nivel = 'normal' | 'economia' | 'critico' | 'parado'
interface Cota {
  plano: string; nomePlano: string; ciclo: string; cicloFim: string; lidas: number; escritas: number; limiteLeituras: number; limiteEscritas: number
  usoLeituras: number; usoEscritas: number; projecaoLeituras: number; projecaoEscritas: number; nivel: Nivel
}
interface Situacao { configurado: boolean; coletaAgendada: boolean; editais?: number; abertos?: number; comItens?: number; contadoEm?: string | null; ultimaColeta?: string | null; cargaCompletaEm?: string | null; pausadoAte?: string | null; cota?: Cota }

const NIVEL: Record<Nivel, { cor: 'verde' | 'amarelo' | 'vermelho'; texto: string; explica: string }> = {
  normal: { cor: 'verde', texto: 'Cota folgada', explica: 'Tudo funcionando normalmente.' },
  economia: { cor: 'amarelo', texto: 'Economizando', explica: 'Contagens da busca ficam 30 min em cache, a coleta roda em minutos alternados e os logs de uso param.' },
  critico: { cor: 'vermelho', texto: 'Cota quase no fim', explica: 'A busca do app voltou para o Supabase e a coleta só acompanha as atualizações do dia.' },
  parado: { cor: 'vermelho', texto: 'Pausado até o próximo ciclo', explica: 'Coleta e busca no Turso pausadas para o banco não ser bloqueado. A busca do app segue pelo Supabase.' },
}
const milhoes = (n: number) => n >= 1e9 ? `${(n / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} bi` : `${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
const pct = (n: number) => `${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

function Barra({ rotulo, usado, limite, uso, projecao }: { rotulo: string; usado: number; limite: number; uso: number; projecao: number }) {
  const cor = uso >= 0.9 ? 'bg-red-500' : uso >= 0.7 || projecao > 1 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap justify-between gap-x-2 text-xs"><span className="text-muted-foreground">{rotulo}</span><span><b>{milhoes(usado)}</b> de {milhoes(limite)} ({pct(uso)}) · projeção do ciclo: {pct(projecao)}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={rotulo} aria-valuenow={Math.round(uso * 100)} aria-valuemin={0} aria-valuemax={100}><div className={`h-full ${cor}`} style={{ width: `${Math.min(100, uso * 100)}%` }} /></div>
    </div>
  )
}

async function situacao(): Promise<Situacao> {
  const { data } = await supabase.auth.getSession()
  const r = await fetch('/api/oportunidades?acao=turso-situacao', { headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` } })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(j?.error ?? 'Não foi possível consultar o Turso agora.')
  return j
}

/** Master: base rápida de dados brutos (Turso). Mostra se está conectada e quanto já foi coletado. */
export default function TursoStatus() {
  const q = useQuery({ queryKey: ['turso-situacao'], queryFn: situacao, retry: false, refetchInterval: 5 * 60_000 })
  const s = q.data
  return (
    <Card className="mb-6 space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex min-w-0 flex-1 items-center gap-2 font-semibold"><Database className="h-4 w-4 text-sky-400" />Base rápida de dados brutos (Turso)</h2>
        {s && <Badge cor={s.configurado && s.coletaAgendada ? 'verde' : 'amarelo'}>{!s.configurado ? 'Não conectada' : s.coletaAgendada ? 'Coletando' : 'Conectada, coleta parada'}</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">O coletor grava aqui o edital bruto assim que ele muda no PNCP, sem pesar no banco do Supabase. O Supabase cuida do login e dispara a coleta a cada minuto; os painéis leem o Turso.</p>
      {q.isError && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {s?.configurado && <ul className="grid gap-1 text-sm sm:grid-cols-2">
        <li><span className="text-muted-foreground">Editais guardados:</span> <b>{(s.editais ?? 0).toLocaleString('pt-BR')}</b></li>
        <li><span className="text-muted-foreground">Com proposta aberta:</span> <b>{(s.abertos ?? 0).toLocaleString('pt-BR')}</b></li>
        <li><span className="text-muted-foreground">Com itens coletados:</span> <b>{(s.comItens ?? 0).toLocaleString('pt-BR')}</b></li>
        <li><span className="text-muted-foreground">Última coleta:</span> <b>{s.ultimaColeta ? formatarDataHora(s.ultimaColeta) : '—'}</b></li>
        <li className="sm:col-span-2 text-xs text-muted-foreground">Contagem feita pela coleta a cada 6 h{s.contadoEm ? ` (última: ${formatarDataHora(s.contadoEm)})` : ''}.</li>
        <li className="sm:col-span-2"><span className="text-muted-foreground">Busca do app:</span> <b>{s.cargaCompletaEm ? `lendo daqui (carga completa em ${formatarDataHora(s.cargaCompletaEm)})` : 'ainda no Supabase, até terminar a primeira carga completa'}</b>{s.pausadoAte && new Date(s.pausadoAte) > new Date() ? ' · coleta pausada pelo PNCP por alguns minutos' : ''}</li>
      </ul>}
      {s?.configurado && s.cota && <div className="space-y-2 rounded-lg border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 flex-1 text-sm font-medium">Cota do mês · plano {s.cota.nomePlano}</h3>
          <Badge cor={NIVEL[s.cota.nivel].cor}>{NIVEL[s.cota.nivel].texto}</Badge>
        </div>
        <Barra rotulo="Linhas lidas" usado={s.cota.lidas} limite={s.cota.limiteLeituras} uso={s.cota.usoLeituras} projecao={s.cota.projecaoLeituras} />
        <Barra rotulo="Linhas escritas" usado={s.cota.escritas} limite={s.cota.limiteEscritas} uso={s.cota.usoEscritas} projecao={s.cota.projecaoEscritas} />
        <p className="text-xs text-muted-foreground">{NIVEL[s.cota.nivel].explica} O ciclo vira em {formatarDataHora(s.cota.cicloFim)}. Medido pelo próprio app a partir das respostas do Turso; o painel do Turso (Usage) é a referência oficial. Para trocar de plano, mude <code>TURSO_PLANO</code> na Vercel (docs/turso.md).</p>
      </div>}
      {s && !s.configurado && <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Crie um banco no Turso (app.turso.tech) e gere um token de acesso.</li>
        <li>Na Vercel, cadastre <code>TURSO_DATABASE_URL</code> e <code>TURSO_AUTH_TOKEN</code> e faça um novo deploy.</li>
        <li>Ligue a coleta no Supabase (o token do agendador já é gerado no banco; passo a passo em docs/turso.md).</li>
      </ol>}
      <Button tamanho="sm" variante="contorno" onClick={() => q.refetch()} carregando={q.isFetching}>Atualizar</Button>
    </Card>
  )
}
