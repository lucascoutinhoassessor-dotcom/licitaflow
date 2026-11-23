import { Link } from 'react-router-dom'
import { Gauge } from 'lucide-react'
import { FEDERAL, INDICADORES, classificar, type AlvoCapag, type CapagEnte } from '@/lib/termometro'
import { notaDe, useCapag, useTermometroLiberado } from '@/hooks/useTermometro'
import { cn } from '@/lib/utils'
import { Badge, Card } from '@/components/ui'

const COR_PONTO = { verde: 'bg-emerald-500', amarelo: 'bg-amber-500', vermelho: 'bg-red-500', neutro: 'bg-muted-foreground', azul: 'bg-sky-500' }
const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`)

/** Selo compacto (listas): bolinha colorida + rótulo; o detalhe vai no texto de ajuda. */
export function SeloTermometro({ ente, alvo, className, peloNome }: { ente?: CapagEnte | null; alvo: AlvoCapag; className?: string; peloNome?: boolean }) {
  if (!alvo) return null
  if (alvo.tipo !== 'federal' && ente === undefined) return null
  const c = alvo.tipo === 'federal' ? FEDERAL : classificar(ente?.nota)
  const ajuda = `${c.texto}${ente ? ` Nota CAPAG ${ente.nota ?? '—'} de ${ente.nome}/${ente.uf}${ente.posicao ? ` (posição ${ente.posicao})` : ''}.` : ''}${peloNome ? ' Ligado pelo nome do órgão.' : ''}`
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', className)} title={ajuda}>
      <span className={cn('h-2 w-2 rounded-full', COR_PONTO[c.cor])} />
      <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
      {c.rotulo}{ente?.nota && alvo.tipo !== 'federal' ? ` (${ente.nota})` : ''}
    </span>
  )
}

/** Selo que busca a própria nota (para usar fora de listas). */
export function SeloTermometroAuto({ alvo, className, peloNome }: { alvo: AlvoCapag; className?: string; peloNome?: boolean }) {
  const liberado = useTermometroLiberado()
  const q = useCapag([alvo], liberado)
  if (!liberado) return null
  return <SeloTermometro alvo={alvo} ente={alvo?.tipo === 'federal' ? null : q.data ? notaDe(q.data, alvo) : undefined} className={className} peloNome={peloNome} />
}

/** Cartão completo: selo, explicação, os três indicadores e a fonte. */
export function CartaoTermometro({ alvo, peloNome, className }: { alvo: AlvoCapag; peloNome?: boolean; className?: string }) {
  const liberado = useTermometroLiberado()
  const q = useCapag([alvo], liberado)
  if (!liberado || !alvo) return null
  const ente = alvo.tipo === 'federal' ? null : q.data ? notaDe(q.data, alvo) : undefined
  if (ente === undefined && alvo.tipo !== 'federal') return null
  const c = alvo.tipo === 'federal' ? FEDERAL : classificar(ente?.nota)
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Gauge className="h-5 w-5 text-primary" />Termômetro de Pagamento</h2>
        <Badge cor={c.cor === 'azul' ? 'azul' : c.cor}>{c.rotulo}{ente?.nota ? ` · CAPAG ${ente.nota}` : ''}</Badge>
      </div>
      <p className="mt-2 text-sm">{c.texto}</p>
      {ente && (
        <>
          <p className="mt-1 text-xs text-muted-foreground">{ente.esfera === 'M' ? 'Município' : 'Estado'} de {ente.nome}/{ente.uf}{peloNome ? ' (ligado pelo nome do órgão)' : ''}.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {INDICADORES.map((i) => {
              const n = ente[`nota${i.campo}` as 'nota1'], v = ente[`indicador${i.campo}` as 'indicador1']
              return (
                <div key={i.campo} className={cn('rounded-lg border p-3', i.campo === 3 && 'border-primary/40')} title={i.ajuda}>
                  <p className="text-xs text-muted-foreground">{i.nome}{i.campo === 3 ? ' · pagar em dia' : ''}</p>
                  <p className="mt-0.5 text-sm"><span className="font-semibold">Nota {n ?? '—'}</span> <span className="text-xs text-muted-foreground">({pct(v)})</span></p>
                </div>
              )
            })}
          </div>
        </>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Fonte: nota CAPAG (Capacidade de Pagamento) do Tesouro Nacional{ente?.posicao ? `, posição ${ente.posicao}` : ''}. Ela mede a saúde financeira do ente, não a pontualidade de cada pagamento.{' '}
        <Link to="/app/agentes/termometro" className="text-primary hover:underline">Consultar outro órgão</Link>
      </p>
    </Card>
  )
}
