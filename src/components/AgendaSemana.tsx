import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Gavel, Plus } from 'lucide-react'
import { TIPOS_PRAZO } from '@/lib/dominio'
import { cn } from '@/lib/utils'
import type { Prazo, Processo } from '@/types/db'

export interface EventoAgenda { id: string; titulo: string; rotulo: string; quando: Date; link: string; sessao: boolean }

const chaveDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const inicioDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const somarDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const hora = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** Prazos em aberto + sessões dos processos ativos (sem duplicar quando já há um prazo de sessão do mesmo processo). */
export function eventosAgenda(prazos: Prazo[], processos: Processo[]): EventoAgenda[] {
  const comSessao = new Set(prazos.filter(p => p.tipo === 'sessao' && p.processo_id).map(p => p.processo_id))
  const lista: EventoAgenda[] = prazos.map(p => ({
    id: `p-${p.id}`, titulo: p.titulo, rotulo: TIPOS_PRAZO[p.tipo] ?? 'Prazo', quando: new Date(p.data_hora),
    link: p.processo_id ? `/app/processos/${p.processo_id}` : '/app/prazos', sessao: p.tipo === 'sessao',
  }))
  for (const pr of processos) {
    if (!pr.data_abertura || pr.arquivado_em || comSessao.has(pr.id)) continue
    lista.push({ id: `s-${pr.id}`, titulo: pr.numero ? `${pr.numero} · ${pr.objeto}` : pr.objeto, rotulo: 'Sessão pública', quando: new Date(pr.data_abertura), link: `/app/processos/${pr.id}`, sessao: true })
  }
  return lista.filter(e => !Number.isNaN(e.quando.getTime())).sort((a, b) => a.quando.getTime() - b.quando.getTime())
}

/** Agenda da semana: faixa de 7 dias navegável, marcadores por dia e lista do dia escolhido. */
export default function AgendaSemana({ prazos, processos, carregando, className }: { prazos: Prazo[]; processos: Processo[]; carregando?: boolean; className?: string }) {
  const hoje = inicioDia(new Date())
  const [semana, setSemana] = useState(0)
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const eventos = useMemo(() => eventosAgenda(prazos, processos), [prazos, processos])
  const porDia = useMemo(() => {
    const m = new Map<string, EventoAgenda[]>()
    for (const e of eventos) { const k = chaveDia(e.quando); m.set(k, [...(m.get(k) ?? []), e]) }
    return m
  }, [eventos])
  const agora = Date.now()
  const atrasados = eventos.filter(e => e.quando.getTime() < agora && !e.sessao).length
  const inicio = somarDias(hoje, semana * 7)
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i))
  const diaAtivo = escolhido && dias.some(d => chaveDia(d) === escolhido) ? escolhido : chaveDia(dias[0])
  const doDia = (porDia.get(diaAtivo) ?? [])
  const proximo = doDia.length ? null : eventos.find(e => e.quando >= somarDias(new Date(`${diaAtivo}T00:00:00`), 1))
  const daSemana = dias.reduce((n, d) => n + (porDia.get(chaveDia(d))?.length ?? 0), 0)
  const titulo = new Date(`${diaAtivo}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })

  return <section aria-labelledby="agenda-titulo" className={cn('flex min-w-0 flex-col overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-sm', className)}>
    <div className="flex items-center justify-between gap-2 border-b px-5 py-4">
      <div><h2 id="agenda-titulo" className="flex items-center gap-2 text-lg font-semibold tracking-tight"><CalendarDays className="h-5 w-5 text-primary" />Agenda</h2>
        <p className="text-xs text-muted-foreground">{carregando ? 'Carregando…' : `${daSemana} compromisso${daSemana === 1 ? '' : 's'} ${semana === 0 ? 'nos próximos 7 dias' : 'nesta semana'}`}</p></div>
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Semana anterior" disabled={semana <= 0} onClick={() => { setSemana(s => s - 1); setEscolhido(null) }} className="inline-flex h-8 w-8 items-center justify-center rounded-full border hover:bg-muted disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
        <button type="button" aria-label="Próxima semana" disabled={semana >= 8} onClick={() => { setSemana(s => s + 1); setEscolhido(null) }} className="inline-flex h-8 w-8 items-center justify-center rounded-full border hover:bg-muted disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>

    {atrasados > 0 && <Link to="/app/prazos" className="mx-5 mt-4 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-700 dark:text-rose-300"><AlertTriangle className="h-4 w-4" />{atrasados} prazo{atrasados === 1 ? '' : 's'} vencido{atrasados === 1 ? '' : 's'} sem conclusão</Link>}

    <div role="tablist" aria-label="Dias da semana" className="grid grid-cols-7 gap-1 px-4 pt-4">
      {dias.map(d => {
        const k = chaveDia(d), lista = porDia.get(k) ?? [], ativo = k === diaAtivo, eHoje = k === chaveDia(hoje)
        return <button key={k} type="button" role="tab" aria-selected={ativo} aria-label={`${d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric' })}: ${lista.length} compromisso(s)`} onClick={() => setEscolhido(k)}
          className={cn('flex flex-col items-center rounded-xl py-2 text-xs transition', ativo ? 'bg-primary text-primary-foreground shadow' : 'hover:bg-muted', !ativo && eHoje && 'ring-1 ring-primary/50')}>
          <span className={cn('uppercase', ativo ? 'opacity-90' : 'text-muted-foreground')}>{SEMANA[d.getDay()]}</span>
          <span className="text-base font-semibold tabular-nums">{d.getDate()}</span>
          <span className="mt-1 flex h-1.5 gap-0.5">{lista.slice(0, 3).map(e => <span key={e.id} className={cn('h-1.5 w-1.5 rounded-full', ativo ? 'bg-primary-foreground' : e.sessao ? 'bg-amber-500' : 'bg-sky-500')} />)}</span>
        </button>
      })}
    </div>

    <div className="flex-1 px-5 py-4">
      <p className="mb-2 text-xs font-semibold capitalize text-muted-foreground">{titulo}</p>
      {doDia.length ? <ul className="space-y-2">{doDia.map(e => <li key={e.id}>
        <Link to={e.link} className="group flex gap-3 rounded-xl border p-3 transition hover:border-primary/40 hover:bg-muted/30">
          <span className={cn('w-1 shrink-0 rounded-full', e.sessao ? 'bg-amber-500' : e.quando.getTime() < agora ? 'bg-rose-500' : 'bg-sky-500')} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="font-semibold tabular-nums text-foreground">{hora(e.quando)}</span>{e.sessao && <Gavel className="h-3 w-3 text-amber-500" />}{e.rotulo}</span>
            <span className="mt-0.5 line-clamp-2 block text-sm group-hover:text-primary">{e.titulo}</span>
          </span>
        </Link></li>)}</ul>
        : <div className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          Nada marcado para este dia.
          {proximo && <Link to={proximo.link} className="mt-2 block text-xs text-primary hover:underline">Próximo: {proximo.quando.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às {hora(proximo.quando)} · {proximo.rotulo}</Link>}
        </div>}
    </div>

    <div className="flex items-center justify-between gap-2 border-t bg-muted/20 px-5 py-3 text-xs">
      <span className="flex items-center gap-3 text-muted-foreground"><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />Sessões</span><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500" />Prazos</span></span>
      <Link to="/app/prazos" className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><Plus className="h-3.5 w-3.5" />Ver e criar prazos</Link>
    </div>
  </section>
}
