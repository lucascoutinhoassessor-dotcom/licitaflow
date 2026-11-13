import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { Bell, CalendarClock, FileCheck2, Gavel, Radar, Sparkles } from 'lucide-react'

/** Número que conta de 0 até o valor quando aparece. */
function Contador({ valor, prefixo = '', sufixo = '' }: { valor: number; prefixo?: string; sufixo?: string }) {
  const mv = useMotionValue(0)
  const texto = useTransform(mv, (v) => `${prefixo}${Math.round(v).toLocaleString('pt-BR')}${sufixo}`)
  useEffect(() => {
    const c = animate(mv, valor, { duration: 1.6, ease: 'easeOut', delay: 0.4 })
    return c.stop
  }, [mv, valor])
  return <motion.span>{texto}</motion.span>
}

// Exemplos ilustrativos do produto (não são dados reais de clientes).
const ALERTAS = [
  { icone: Radar, cor: 'text-emerald-400', titulo: 'Nova dispensa eletrônica', texto: 'Material de escritório · 94% de aderência' },
  { icone: CalendarClock, cor: 'text-amber-400', titulo: 'Sessão amanhã, 09:00', texto: 'Pregão eletrônico 90012/2026' },
  { icone: FileCheck2, cor: 'text-sky-400', titulo: 'Certidão vence em 5 dias', texto: 'CND Federal · renove agora' },
  { icone: Sparkles, cor: 'text-violet-400', titulo: 'Edital analisado pela IA', texto: '12 documentos exigidos · 2 riscos' },
]

const FUNIL = [
  { etapa: 'Captação', n: 18, w: '100%' },
  { etapa: 'Análise', n: 11, w: '72%' },
  { etapa: 'Disputa', n: 6, w: '46%' },
  { etapa: 'Ganhos', n: 4, w: '30%' },
]

export function HeroMockup() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % ALERTAS.length), 2600)
    return () => clearInterval(t)
  }, [])
  const alerta = ALERTAS[i]

  return (
    <div className="relative mx-auto w-full max-w-xl" aria-hidden="true">
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-blue-600/30 via-cyan-400/10 to-emerald-400/30 blur-2xl" />

      <motion.div
        initial={{ opacity: 0, y: 40, rotateX: 12 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 shadow-2xl shadow-blue-950/50 backdrop-blur-xl"
        style={{ transformPerspective: 1200 }}
      >
        <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          <span className="ml-3 text-xs text-slate-400">app.licitaflow · Painel</span>
        </div>

        <div className="grid grid-cols-3 gap-2 p-3 sm:gap-3 sm:p-4">
          {[
            { r: 'Em disputa', v: 6, ic: Gavel },
            { r: 'Em jogo (R$ mil)', v: 2380, ic: Sparkles },
            { r: 'Prazos na semana', v: 9, ic: CalendarClock },
          ].map((k) => (
            <div key={k.r} className="min-w-0 rounded-xl border border-white/5 bg-white/[0.03] p-2.5 sm:p-3">
              <div className="flex items-center gap-1.5 truncate text-[10px] text-slate-400 sm:text-[11px]">
                <k.ic className="h-3.5 w-3.5" /> {k.r}
              </div>
              <div className="mt-1 truncate text-sm font-semibold text-white tabular-nums sm:text-lg">
                <Contador valor={k.v} />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-5 gap-2 px-3 pb-3 sm:gap-3 sm:px-4 sm:pb-4">
          <div className="col-span-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 sm:p-4">
            <div className="text-xs font-medium text-slate-300">Funil de processos</div>
            <div className="mt-3 space-y-2.5">
              {FUNIL.map((f, idx) => (
                <div key={f.etapa}>
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>{f.etapa}</span>
                    <span className="tabular-nums">{f.n}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-white/5">
                    <motion.div
                      className="h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-emerald-400"
                      initial={{ width: 0 }}
                      animate={{ width: f.w }}
                      transition={{ duration: 1.2, delay: 0.6 + idx * 0.15, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative col-span-2 flex items-center justify-center overflow-hidden rounded-xl border border-white/5 bg-white/[0.03] p-3 sm:p-4">
            <div className="relative h-20 w-20 sm:h-28 sm:w-28">
              {[1, 0.7, 0.4].map((s) => (
                <div key={s} className="absolute inset-0 m-auto rounded-full border border-emerald-400/20" style={{ width: `${s * 100}%`, height: `${s * 100}%` }} />
              ))}
              <div className="absolute inset-0 animate-[spin_3s_linear_infinite] rounded-full bg-[conic-gradient(from_0deg,rgba(52,211,153,0.45),transparent_25%)]" />
              {[
                [18, 30],
                [70, 22],
                [60, 72],
              ].map(([x, y], k) => (
                <span key={k} className="absolute h-2 w-2 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.9)]" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${k * 0.5}s` }} />
              ))}
            </div>
            <span className="absolute bottom-2 text-[10px] uppercase tracking-widest text-emerald-300/80">Radar PNCP</span>
          </div>
        </div>
      </motion.div>

      <div className="absolute -bottom-10 left-2 right-2 sm:-left-10 sm:right-auto sm:w-72">
        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.35 }}
            className="flex items-start gap-3 rounded-xl border border-white/10 bg-slate-900/95 p-3 shadow-xl backdrop-blur"
          >
            <div className="rounded-lg bg-white/5 p-2">
              <alerta.icone className={`h-4 w-4 ${alerta.cor}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                <Bell className="h-3 w-3 text-slate-400" /> {alerta.titulo}
              </div>
              <div className="truncate text-[11px] text-slate-400">{alerta.texto}</div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
