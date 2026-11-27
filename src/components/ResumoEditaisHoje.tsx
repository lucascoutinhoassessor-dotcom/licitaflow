import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Clock3, Gavel, Info, Layers, MapPin, Package, RefreshCw, Sparkles, Target, Wrench } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'
import { diaBrasilia, type ResumoEditais } from '@/lib/resumoEditais'
import { formatarDataHora } from '@/lib/format'
import { cn } from '@/lib/utils'

const destino = (filtro = '') => `/app/oportunidades?publicadas=hoje${filtro ? `&${filtro}` : ''}`
const numero = (n: number | undefined) => n === undefined ? '—' : n.toLocaleString('pt-BR')
const compacto = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })
const foco = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

/**
 * Panorama do dia, exclusivo do painel autenticado (nunca na landing): o endpoint exige sessão.
 * `termos` = palavras-chave da empresa ativa (";"), para contar as licitações do dia que combinam com ela.
 */
export default function ResumoEditaisHoje({ termos = '', className }: { termos?: string; className?: string }) {
  const { user } = useAuth()
  const dia = diaBrasilia()
  const q = useQuery<ResumoEditais>({ queryKey: ['resumo-editais-hoje', user?.id, dia, termos], enabled: !!user,
    staleTime: 5 * 60_000, refetchInterval: 5 * 60_000, retry: 1, placeholderData: (anterior) => anterior,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.auth.getSession()
      if (error || !data.session) throw new Error('Entre na sua conta para consultar as oportunidades.')
      const r = await fetch(`/api/oportunidades?acao=turso-resumo-hoje${termos ? `&termos=${encodeURIComponent(termos)}` : ''}`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      })
      if (!r.ok) throw new Error('Não foi possível atualizar os indicadores.')
      return r.json()
    },
  })
  if (!user) return null
  const s = q.data?.data === dia ? q.data : undefined
  const cobertura = s?.editais ? Math.min(100, Math.round(s.editaisComItens / s.editais * 100)) : 0
  const pausado = !!s?.pausadoAte && Date.parse(s.pausadoAte) > Date.now()
  const antigo = !!s && (!s.atualizadoEm || Date.now() - Date.parse(s.atualizadoEm) > 30 * 60_000)
  const parcial = !!s && (!s.cargaCompleta || s.editaisComItens < s.editais)
  const status = q.isError && !s ? 'Atualização indisponível' : !s ? 'Carregando' : pausado ? 'Coleta pausada' : antigo ? 'Aguardando atualização' : parcial ? 'Ao vivo · em coleta' : 'Ao vivo'
  const alerta = (q.isError && !s) || antigo || pausado
  const perfil = s?.perfil && s.perfil.data === dia ? s.perfil : null

  const blocos = [
    { nome: 'Serviços', valor: s?.servicos, filtro: 'tipo=servicos', Icone: Wrench, cor: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/25 text-emerald-600 dark:text-emerald-300' },
    { nome: 'Materiais', valor: s?.materiais, filtro: 'tipo=materiais', Icone: Package, cor: 'from-sky-500/20 to-sky-500/5 border-sky-500/25 text-sky-600 dark:text-sky-300' },
    { nome: 'Até R$ 50 mil', valor: s?.ate50mil, filtro: 'faixa=ate50mil', Icone: null, cor: 'from-amber-500/20 to-amber-500/5 border-amber-500/25 text-amber-600 dark:text-amber-300' },
    { nome: 'R$ 50 mil a R$ 250 mil', valor: s?.ate250mil, filtro: 'faixa=ate250mil', Icone: null, cor: 'from-indigo-500/20 to-indigo-500/5 border-indigo-500/25 text-indigo-600 dark:text-indigo-300' },
    { nome: 'Acima de R$ 250 mil', valor: s?.acima250mil, filtro: 'faixa=acima250mil', Icone: null, cor: 'from-rose-500/20 to-rose-500/5 border-rose-500/25 text-rose-600 dark:text-rose-300' },
  ]
  const maxUf = Math.max(1, ...(s?.ufs ?? []).map(u => u.n))

  return <section aria-labelledby="resumo-editais-titulo" aria-busy={q.isFetching} className={cn('min-w-0 overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-sm', className)}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <h2 id="resumo-editais-titulo" className="text-lg font-semibold tracking-tight sm:text-xl">Hoje nas licitações</h2>
        <p className="text-sm text-muted-foreground">Publicações de {dia.split('-').reverse().join('/')} em todo o Brasil. Clique em um número para ver a lista.</p>
      </div>
      <div className="flex items-center gap-2">
        <span role="status" className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', alerta ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300')}>
          <span className={cn('h-1.5 w-1.5 rounded-full bg-current', !alerta && s && 'animate-pulse')} />{status}
        </span>
        <button type="button" disabled={q.isFetching} onClick={() => void q.refetch()} aria-label="Atualizar panorama de licitações" title="Atualizar" className={cn('inline-flex h-9 w-9 items-center justify-center rounded-full border hover:bg-muted disabled:opacity-50', foco)}><RefreshCw className={cn('h-4 w-4', q.isFetching && 'animate-spin')} /></button>
      </div>
    </div>

    <div className="grid gap-4 p-5 sm:p-6 md:grid-cols-2">
      {/* Total do dia */}
      <Link to={destino()} className={cn('group relative flex min-h-48 flex-col justify-between overflow-hidden rounded-2xl border border-sky-400/20 bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 p-5 text-white', foco)}>
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="flex items-center justify-between text-sm text-sky-200"><span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4" />Licitações publicadas hoje</span><ArrowUpRight className="h-5 w-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div>
        <p className={cn('mt-3 bg-gradient-to-r from-sky-300 to-emerald-300 bg-clip-text text-6xl font-bold tabular-nums tracking-tight text-transparent', q.isPending && 'animate-pulse')} data-testid="total-editais">{numero(s?.editais)}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
          {!!s?.valorTotal && <span>{compacto(s.valorTotal)} em valor estimado</span>}
          {s?.abremHoje !== undefined && <span className="inline-flex items-center gap-1"><Gavel className="h-3.5 w-3.5" />{numero(s.abremHoje)} sessões ainda hoje</span>}
        </div>
      </Link>

      <div className="flex min-w-0 flex-col gap-4">
        {/* Para a empresa ativa */}
        {termos ? (
          <Link to={destino(`busca=${encodeURIComponent(termos)}`)} className={cn('group flex items-center gap-4 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/15 to-teal-500/5 p-4 transition hover:border-emerald-500/50', foco)}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"><Target className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Para a sua empresa</p>
              <p className="text-2xl font-semibold tabular-nums">{perfil ? `${perfil.limitado ? '+' : ''}${numero(perfil.compativeis)}` : s ? '—' : '…'}<span className="ml-2 text-sm font-normal text-muted-foreground">combinam com suas palavras-chave</span></p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
          </Link>
        ) : (
          <Link to="/app/empresas" className={cn('group flex items-center gap-4 rounded-2xl border border-dashed p-4 transition hover:border-primary/50', foco)}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Target className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><p className="text-sm font-medium">Veja quantas combinam com você</p><p className="text-xs text-muted-foreground">Cadastre as palavras-chave do que sua empresa vende.</p></div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
          </Link>
        )}

        {/* Itens */}
        <div className="flex-1 rounded-2xl border bg-muted/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-medium"><Layers className="h-4 w-4 text-primary" />Itens publicados hoje</h3><span className="text-2xl font-semibold tabular-nums">{numero(s?.itens)}</span></div>
          <p className="mt-1 text-xs text-muted-foreground">{s ? s.editais === 0 ? 'Nenhuma licitação publicada hoje até agora.' : parcial ? `Detalhes de ${numero(s.editaisComItens)} de ${numero(s.editais)} licitações; o restante ainda está em coleta.` : `Soma dos itens das ${numero(s.editais)} licitações do dia.` : 'Consultando…'}</p>
          {!!s?.editais && parcial && <div role="progressbar" aria-label="Licitações com itens coletados" aria-valuenow={cobertura} aria-valuemin={0} aria-valuemax={100} className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary/10"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${cobertura}%` }} /></div>}
        </div>
      </div>
    </div>

    {/* Tipo e faixa de valor */}
    <div className="grid grid-cols-2 gap-3 px-5 sm:grid-cols-3 sm:px-6 lg:grid-cols-5">
      {blocos.map(b => {
        const parte = s?.editais && b.valor !== undefined ? Math.round(b.valor / s.editais * 100) : 0
        return <Link key={b.filtro} to={destino(b.filtro)} className={cn('group rounded-2xl border bg-gradient-to-br p-4 transition hover:-translate-y-0.5', b.cor, foco)}>
          <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider"><span className="inline-flex items-center gap-1.5">{b.Icone && <b.Icone className="h-3.5 w-3.5" />}{b.nome}</span><ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition group-hover:opacity-100" /></div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{numero(b.valor)}</p>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-foreground/10"><div className="h-full rounded-full bg-current" style={{ width: `${parte}%` }} /></div>
          <p className="mt-1 text-[11px] text-muted-foreground">{s?.editais ? `${parte}% do dia` : ' '}</p>
        </Link>
      })}
    </div>

    {/* Estados */}
    {!!s?.ufs?.length && <div className="px-5 pt-5 sm:px-6">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MapPin className="h-3.5 w-3.5" />Estados com mais publicações</h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{s.ufs.map(u => <Link key={u.uf} to={destino(`uf=${u.uf}`)} className={cn('group flex items-center gap-3 rounded-xl border px-3 py-2 transition hover:border-primary/40 hover:bg-muted/30', foco)}>
        <span className="w-7 text-sm font-semibold">{u.uf}</span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500" style={{ width: `${Math.round(u.n / maxUf * 100)}%` }} /></span>
        <span className="w-10 text-right text-sm tabular-nums text-muted-foreground group-hover:text-foreground">{numero(u.n)}</span>
      </Link>)}</div>
    </div>}

    {q.isError && <div role="alert" className="mx-5 mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm sm:mx-6">Não foi possível atualizar o panorama.{s ? ' Os últimos dados continuam visíveis.' : ' Tente novamente em alguns instantes.'} <button type="button" className="font-medium underline" onClick={() => void q.refetch()}>Tentar novamente</button></div>}

    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3 text-xs text-muted-foreground sm:px-6">
      <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{s?.atualizadoEm ? `Última coleta: ${formatarDataHora(s.atualizadoEm)} (Brasília)` : 'Atualiza sozinho a cada 5 minutos'}</span>
      <details className="max-w-full"><summary className="flex cursor-pointer list-none items-center gap-1.5 hover:text-foreground"><Info className="h-3.5 w-3.5" />Sobre os números</summary><p className="mt-2 max-w-xl leading-relaxed">Panorama nacional da base coletada. A coleta é contínua e os números do dia crescem ao longo das horas. Licitações mistas contam em materiais e em serviços. {s?.naoDivulgado ? `${numero(s.naoDivulgado)} licitações sem valor divulgado ficam fora das faixas.` : 'Valores não divulgados ficam fora das faixas.'} "Para a sua empresa" usa as palavras-chave da empresa ativa.</p></details>
    </div>
  </section>
}
