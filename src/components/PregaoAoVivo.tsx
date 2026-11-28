import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlarmClock, Download, Gavel, MessageSquare, MonitorSmartphone, Radio, TrendingDown, Trophy, type LucideIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/providers/OrgProvider'
import { formatarDataHora } from '@/lib/format'
import { cn } from '@/lib/utils'
import { conectado, importante, juntarEventos, LINK_DOWNLOAD, PORTAIS, ROTULO_EVENTO, type Computador, type EventoPav, type SessaoPav, type TipoEvento } from '@/lib/pregaoAoVivo'
import { Badge, Button, Card, Vazio } from '@/components/ui'

const ICONE: Record<TipoEvento, LucideIcon> = {
  mensagem: MessageSquare, convocacao: AlarmClock, fase: Gavel, lance: TrendingDown, posicao: Trophy, situacao: Radio, aviso: Radio,
}

/** Computadores com o programa aberto (sinal de vida a cada minuto). */
export function useComputadores() {
  const { org } = useOrg()
  return useQuery({
    queryKey: ['pav-computadores', org?.id], enabled: !!org, refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('pav_computadores').select('id, nome, versao, sinal_em, user_id').eq('org_id', org!.id).order('sinal_em', { ascending: false })
      if (error) throw error
      return (data ?? []) as Computador[]
    },
  })
}

/** Sessões da organização (ou de um processo), atualizadas em tempo real. */
export function useSessoes(processoId?: string) {
  const { org } = useOrg()
  const qc = useQueryClient()
  const chave = ['pav-sessoes', org?.id, processoId ?? 'todas']
  useEffect(() => {
    if (!org) return
    const canal = supabase.channel(`pav-sessoes-${org.id}-${processoId ?? 'todas'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pav_sessoes', filter: `org_id=eq.${org.id}` }, () => qc.invalidateQueries({ queryKey: ['pav-sessoes', org.id] }))
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [org, processoId, qc])
  return useQuery({
    queryKey: chave, enabled: !!org,
    queryFn: async () => {
      let q = supabase.from('pav_sessoes').select('*, processos(objeto, numero)').eq('org_id', org!.id).order('created_at', { ascending: false }).limit(50)
      if (processoId) q = q.eq('processo_id', processoId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as SessaoPav[]
    },
  })
}

/** Linha do tempo: carrega os últimos eventos e recebe os novos pelo Supabase Realtime. */
export function LinhaDoTempo({ sessoes, vazio }: { sessoes: SessaoPav[]; vazio?: string }) {
  const { org } = useOrg()
  const ids = sessoes.map((s) => s.id)
  const chaveIds = ids.join(',')
  const [eventos, setEventos] = useState<EventoPav[]>([])
  const [carregando, setCarregando] = useState(true)
  const nomes = Object.fromEntries(sessoes.map((s) => [s.id, s.titulo ?? s.chave]))

  useEffect(() => {
    if (!org || !chaveIds) { setEventos([]); setCarregando(false); return }
    let vivo = true
    const lista = chaveIds.split(',')
    setCarregando(true)
    supabase.from('pav_eventos').select('*').in('sessao_id', lista).order('quando', { ascending: false }).limit(200)
      .then(({ data }) => { if (vivo) { setEventos((data ?? []) as EventoPav[]); setCarregando(false) } })
    const canal = supabase.channel(`pav-eventos-${org.id}-${lista.length}-${lista[0]}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pav_eventos', filter: `org_id=eq.${org.id}` }, (m) => {
        const e = m.new as EventoPav
        if (lista.includes(e.sessao_id)) setEventos((atuais) => juntarEventos(atuais, [e]))
      })
      .subscribe()
    return () => { vivo = false; supabase.removeChannel(canal) }
  }, [org, chaveIds])

  if (carregando) return <p className="text-sm text-muted-foreground">Carregando eventos…</p>
  if (!eventos.length) return <p className="text-sm text-muted-foreground">{vazio ?? 'Nenhum evento ainda. Eles aparecem aqui assim que acontecem na sala.'}</p>
  return (
    <ol className="space-y-2">
      {eventos.map((e) => {
        const Icone = ICONE[e.tipo] ?? Radio
        const forte = importante(e)
        return (
          <li key={e.id} className={cn('rounded-lg border-l-4 bg-muted/30 px-3 py-2', e.tipo === 'convocacao' ? 'border-l-amber-500' : e.cita_cliente ? 'border-l-emerald-500' : forte ? 'border-l-sky-500' : 'border-l-muted-foreground/30')}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <Icone className="h-3.5 w-3.5" />
              <span className="font-semibold uppercase tracking-wide">{ROTULO_EVENTO[e.tipo]}</span>
              {sessoes.length > 1 && <span>{nomes[e.sessao_id]}</span>}
              {e.item && <span>item {e.item}</span>}
              {e.autor && <span>{e.autor}</span>}
              <span>{formatarDataHora(e.quando)}</span>
              {e.cita_cliente && <Badge cor="verde">sua empresa</Badge>}
            </div>
            <p className={cn('mt-1 text-sm', forte && 'font-medium')}>{e.texto}</p>
            {e.prazo && <p className="mt-1 text-sm font-semibold text-amber-600 dark:text-amber-400">Prazo: {formatarDataHora(e.prazo)} (já está nos Prazos do processo)</p>}
          </li>
        )
      })}
    </ol>
  )
}

/** Situação dos computadores e botão de baixar o programa. */
export function CartaoComputadores() {
  const q = useComputadores()
  const lista = q.data ?? []
  const ligados = lista.filter((c) => conectado(c.sinal_em))
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10"><MonitorSmartphone className="h-6 w-6 text-primary" /></div>
          <div>
            <h2 className="font-semibold">Programa no computador</h2>
            <p className="text-sm text-muted-foreground">
              {ligados.length ? `${ligados.length} computador(es) conectado(s) agora.` : lista.length ? 'Nenhum computador conectado agora. Abra o Pregão ao Vivo no seu computador.' : 'Instale o programa no computador que vai acompanhar as sessões (Windows).'}
            </p>
          </div>
        </div>
        <a href={LINK_DOWNLOAD} target="_blank" rel="noopener noreferrer"><Button><Download className="h-4 w-4" />Baixar para Windows</Button></a>
      </div>
      {lista.length > 0 && (
        <ul className="mt-4 divide-y rounded-md border text-sm">
          {lista.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="flex items-center gap-2"><span className={cn('h-2.5 w-2.5 rounded-full', conectado(c.sinal_em) ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />{c.nome}</span>
              <span className="text-xs text-muted-foreground">{conectado(c.sinal_em) ? 'conectado' : `último sinal ${formatarDataHora(c.sinal_em)}`}{c.versao ? ` · v${c.versao}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** Sessões de um processo (aba "Sessão ao vivo" do processo). */
export function SessaoDoProcesso({ processoId }: { processoId: string }) {
  const q = useSessoes(processoId)
  const sessoes = q.data ?? []
  return (
    <div className="space-y-4">
      {!sessoes.length ? (
        <Card className="p-5">
          <Vazio icone={Radio} titulo="Esta sessão ainda não está sendo acompanhada"
            texto="Abra o Pregão ao Vivo no computador, faça o login no portal e entre na sala de disputa deste pregão. O programa reconhece a compra pela UASG e pelo número e liga ao processo sozinho." />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {sessoes.map((s) => (
              <Badge key={s.id} cor={s.situacao === 'acompanhando' ? 'verde' : 'neutro'}>{PORTAIS[s.portal]?.nome ?? s.portal} · {s.titulo ?? s.chave} · {s.situacao}</Badge>
            ))}
          </div>
          <Card className="p-5"><LinhaDoTempo sessoes={sessoes} /></Card>
        </>
      )}
    </div>
  )
}
