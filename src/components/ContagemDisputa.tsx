import { useSyncExternalStore } from 'react'
import { CalendarClock, Timer } from 'lucide-react'
import { dataHoraDisputa, tempoRestante } from '@/lib/format'

// Um único relógio para todos os contadores da tela (uma lista pode ter dezenas).
const ouvintes = new Set<() => void>()
let relogio: ReturnType<typeof setInterval> | undefined
let agora = Date.now()
function assinar(avisar: () => void) {
  ouvintes.add(avisar)
  if (!relogio) {
    agora = Date.now()
    relogio = setInterval(() => { agora = Date.now(); ouvintes.forEach((f) => f()) }, 1000)
  }
  return () => { ouvintes.delete(avisar); if (!ouvintes.size) { clearInterval(relogio); relogio = undefined } }
}
function useAgora() { return useSyncExternalStore(assinar, () => agora, () => agora) }

const doisDigitos = (n: number) => String(n).padStart(2, '0')

/** Contador regressivo (dias, horas, minutos) até o início da disputa. */
function Contador({ data }: { data: string }) {
  const resta = tempoRestante(data, new Date(useAgora()))
  if (!resta) return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">Disputa iniciada</span>
  const urgente = resta.dias === 0
  const rotulo = `Faltam ${resta.dias} dias, ${resta.horas} horas e ${resta.minutos} minutos para a disputa`
  return (
    <span role="timer" aria-label={rotulo} title={rotulo}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${urgente ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'}`}>
      <Timer className="h-3.5 w-3.5" aria-hidden />
      {resta.dias > 0 && <>{resta.dias}d </>}{doisDigitos(resta.horas)}h {doisDigitos(resta.minutos)}min
    </span>
  )
}

/** Quando o órgão não informa a hora, o PNCP grava meia-noite (00:00). */
function semHorario(data: string) {
  const d = new Date(data)
  return d.getHours() === 0 && d.getMinutes() === 0
}

/** Sem hora conhecida, a contagem é em dias (hoje, amanhã, em N dias), não em horas até a meia-noite. */
function ContadorDias({ data }: { data: string }) {
  const hoje = new Date(useAgora()); hoje.setHours(0, 0, 0, 0)
  const alvo = new Date(data); alvo.setHours(0, 0, 0, 0)
  const dias = Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000)
  if (dias < 0) return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">Disputa iniciada</span>
  const texto = dias === 0 ? 'Hoje' : dias === 1 ? 'Amanhã' : `Em ${dias} dias`
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${dias <= 1 ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'}`}>
      <Timer className="h-3.5 w-3.5" aria-hidden />{texto}
    </span>
  )
}

/** Data e hora da disputa com o contador ao lado. */
export default function ContagemDisputa({ data, prefixo = 'Disputa em', className = '' }: { data?: string | null; prefixo?: string; className?: string }) {
  if (!data || Number.isNaN(new Date(data).getTime())) return null
  const semHora = semHorario(data)
  return (
    <span className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-sm ${className}`}>
      <span className="flex items-center gap-1.5 font-semibold"><CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden />{prefixo} {semHora ? new Date(data).toLocaleDateString('pt-BR') : dataHoraDisputa(data)}</span>
      {semHora ? <ContadorDias data={data} /> : <Contador data={data} />}
      {semHora && <span className="text-xs text-muted-foreground" title="O órgão publicou só a data no PNCP. Confira o horário no edital ou no portal da disputa.">Horário não informado pelo órgão</span>}
    </span>
  )
}
