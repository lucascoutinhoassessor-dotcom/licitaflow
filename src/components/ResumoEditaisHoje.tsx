import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Layers, Sparkles } from 'lucide-react'
import { formatarDataHora } from '@/lib/format'

interface Resumo {
  data:string;editais:number;itens:number;editaisComItens:number;servicos:number;materiais:number
  ate50mil:number;ate250mil:number;acima250mil:number;atualizadoEm:string|null;cargaCompleta:boolean;pausadoAte:string|null
}

/** Mesmo resumo na página pública e no painel, sem duplicar a consulta. */
export default function ResumoEditaisHoje() {
  const dia=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})
  const q=useQuery<Resumo>({queryKey:['resumo-editais-hoje',dia],staleTime:5*60_000,refetchInterval:5*60_000,retry:false,
    queryFn:async({signal})=>{
      const r=await fetch('/api/oportunidades?acao=turso-resumo-hoje',{signal:AbortSignal.any([signal,AbortSignal.timeout(15_000)])})
      if(!r.ok)throw new Error('Não foi possível atualizar os indicadores.')
      return r.json()
    },
  })
  const s=q.data?.data===dia?q.data:undefined
  const numero=(n:number|undefined)=>n===undefined?'—':n.toLocaleString('pt-BR')
  const link='/app/oportunidades?publicadas=hoje'
  return <section aria-label="Editais publicados hoje" className="my-6 rounded-3xl border border-sky-500/20 bg-slate-950 p-5 text-slate-200 sm:p-7">
    <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
      <Link to={link} className="group rounded-3xl border border-teal-400/40 bg-gradient-to-br from-blue-950 to-teal-950 p-6">
        <div className="flex items-center justify-between"><Sparkles className="h-7 w-7 text-cyan-200"/><ArrowUpRight className="h-5 w-5 text-slate-400"/></div>
        <p className="mt-4 text-5xl font-bold text-sky-300">{numero(s?.editais)}</p>
        <h2 className="mt-3 text-lg font-semibold">Licitações publicadas hoje</h2>
      </Link>
      <div className="rounded-3xl border border-emerald-500/50 bg-gradient-to-r from-emerald-950 to-cyan-950 p-6">
        <p className="flex items-center gap-3 text-sm uppercase tracking-wider text-slate-400"><Layers className="h-6 w-6 text-emerald-100"/>Itens publicados hoje</p>
        <p className="mt-3 text-4xl font-bold">{numero(s?.itens)}</p>
        <p className="mt-2 text-sm text-slate-400">Itens coletados de {numero(s?.editaisComItens)} das {numero(s?.editais)} licitações do dia.</p>
        <p className="mt-2 text-xs text-slate-400">{s&&s.editaisComItens<s.editais?'Contagem parcial: há itens em coleta.':'Cobertura referente à base coletada.'}</p>
      </div>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {([
        ['Serviços',s?.servicos,'from-emerald-900 to-teal-950'],['Materiais',s?.materiais,'from-sky-900 to-blue-950'],
        ['Até R$ 50 mil',s?.ate50mil,'from-amber-900 to-slate-800'],['De R$ 50 mil a R$ 250 mil',s?.ate250mil,'from-indigo-900 to-slate-800'],
        ['Acima de R$ 250 mil',s?.acima250mil,'from-rose-950 to-slate-800'],
      ] as const).map(([rotulo,n,cor])=><div key={rotulo} className={`rounded-2xl border border-white/10 bg-gradient-to-br p-4 ${cor}`}><p className="text-xs uppercase tracking-wide text-slate-400">{rotulo}</p><p className="mt-3 text-2xl font-bold">{numero(n)}</p></div>)}
    </div>
    <div aria-live="polite" className="mt-4 space-y-2 text-xs text-slate-400">
      {q.isPending?<p>Atualizando indicadores…</p>:q.isError?<p role="alert">Indicadores indisponíveis. <button className="text-sky-400 underline" onClick={()=>void q.refetch()}>Tentar novamente</button></p>:null}
      {s&&<><p>Última coleta: {s.atualizadoEm?formatarDataHora(s.atualizadoEm):'ainda não registrada'}. Dia de referência: {s.data.split('-').reverse().join('/')} (Brasília).</p>
        {(!s.cargaCompleta||!s.atualizadoEm||Date.now()-Date.parse(s.atualizadoEm)>30*60_000)&&<p>Base em atualização; os números podem estar incompletos.</p>}
        <p>Tipos podem ser estimados pelo objeto; editais mistos entram em materiais e serviços. Valores não divulgados ficam fora das faixas.</p></>}
    </div>
    <Link to={link} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-sky-400">Ver todas as oportunidades do dia<ArrowUpRight className="h-4 w-4"/></Link>
  </section>
}
