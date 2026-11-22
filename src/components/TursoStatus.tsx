import { useQuery } from '@tanstack/react-query'
import { Database } from 'lucide-react'
import { Badge, Button, Card } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { formatarDataHora } from '@/lib/format'

interface Situacao { configurado: boolean; coletaAgendada: boolean; editais?: number; abertos?: number; comItens?: number; ultimaColeta?: string | null; cargaCompletaEm?: string | null; pausadoAte?: string | null }

async function situacao(): Promise<Situacao> {
  const { data } = await supabase.auth.getSession()
  const r = await fetch('/api/oportunidades?acao=turso-situacao', { headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` } })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(j?.error ?? 'Não foi possível consultar o Turso agora.')
  return j
}

/** Master: base rápida de dados brutos (Turso). Mostra se está conectada e quanto já foi coletado. */
export default function TursoStatus() {
  const q = useQuery({ queryKey: ['turso-situacao'], queryFn: situacao, retry: false, refetchInterval: 60_000 })
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
        <li className="sm:col-span-2"><span className="text-muted-foreground">Busca do app:</span> <b>{s.cargaCompletaEm ? `lendo daqui (carga completa em ${formatarDataHora(s.cargaCompletaEm)})` : 'ainda no Supabase, até terminar a primeira carga completa'}</b>{s.pausadoAte && new Date(s.pausadoAte) > new Date() ? ' · coleta pausada pelo PNCP por alguns minutos' : ''}</li>
      </ul>}
      {s && !s.configurado && <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Crie um banco no Turso (app.turso.tech) e gere um token de acesso.</li>
        <li>Na Vercel, cadastre <code>TURSO_DATABASE_URL</code> e <code>TURSO_AUTH_TOKEN</code> e faça um novo deploy.</li>
        <li>Ligue a coleta no Supabase (o token do agendador já é gerado no banco; passo a passo em docs/turso.md).</li>
      </ol>}
      <Button tamanho="sm" variante="contorno" onClick={() => q.refetch()} carregando={q.isFetching}>Atualizar</Button>
    </Card>
  )
}
