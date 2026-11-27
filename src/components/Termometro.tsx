import { Link } from 'react-router-dom'
import { Gauge } from 'lucide-react'
import { FEDERAL, INDICADORES, classificar, classificarFederal, diasTexto, medirFederal, pctTexto, posicaoFederal, type AlvoCapag, type CapagEnte, type UgFederal } from '@/lib/termometro'
import { notaDe, useCapag, useFederal, usePosicaoFederal, useTermometroLiberado } from '@/hooks/useTermometro'
import { cn } from '@/lib/utils'
import { Badge, Card } from '@/components/ui'

const COR_PONTO = { verde: 'bg-emerald-500', amarelo: 'bg-amber-500', vermelho: 'bg-red-500', neutro: 'bg-muted-foreground', azul: 'bg-sky-500' }
const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`)
const ugDe = (alvo: AlvoCapag) => (alvo?.tipo === 'federal' ? alvo.ug ?? null : null)

/** Selo compacto (listas): bolinha colorida + rótulo; o detalhe vai no texto de ajuda. */
export function SeloTermometro({ ente, alvo, className, peloNome, federal }: { ente?: CapagEnte | null; alvo: AlvoCapag; className?: string; peloNome?: boolean; federal?: UgFederal | null }) {
  if (!alvo) return null
  if (alvo.tipo !== 'federal' && ente === undefined) return null
  const medida = federal ? medirFederal(federal) : null
  const c = alvo.tipo === 'federal' ? (federal ? classificarFederal(medida) : FEDERAL) : classificar(ente?.nota)
  const ajuda = `${c.texto}${ente ? ` Nota CAPAG ${ente.nota ?? '—'} de ${ente.nome}/${ente.uf}${ente.posicao ? ` (posição ${ente.posicao})` : ''}.` : ''}${medida?.base === 'orgao' ? ' Medido pelo órgão inteiro.' : ''}${peloNome ? ' Ligado pelo nome do órgão.' : ''}`
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', className)} title={ajuda}>
      <span className={cn('h-2 w-2 rounded-full', COR_PONTO[c.cor])} />
      <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
      {c.rotulo}{ente?.nota && alvo.tipo !== 'federal' ? ` (${ente.nota})` : ''}{medida ? ` (${diasTexto(medida.media)})` : ''}
    </span>
  )
}

/** Selo que busca a própria nota (para usar fora de listas). */
export function SeloTermometroAuto({ alvo, className, peloNome }: { alvo: AlvoCapag; className?: string; peloNome?: boolean }) {
  const liberado = useTermometroLiberado()
  const q = useCapag([alvo], liberado)
  const f = useFederal([ugDe(alvo)], liberado)
  if (!liberado) return null
  const ug = ugDe(alvo)
  if (ug && f.isLoading) return null
  return <SeloTermometro alvo={alvo} ente={alvo?.tipo === 'federal' ? null : q.data ? notaDe(q.data, alvo) : undefined} federal={ug ? f.data?.find((x) => x.ug === ug) ?? null : null} className={className} peloNome={peloNome} />
}

/** Cartão completo: selo, explicação, os três indicadores e a fonte. Órgão federal com UG: prazos de pagamento. */
export function CartaoTermometro({ alvo, peloNome, className }: { alvo: AlvoCapag; peloNome?: boolean; className?: string }) {
  const liberado = useTermometroLiberado()
  const q = useCapag([alvo], liberado)
  const ug = ugDe(alvo)
  const f = useFederal([ug], liberado)
  if (!liberado || !alvo) return null
  if (ug) {
    if (f.isLoading) return null
    const u = f.data?.find((x) => x.ug === ug)
    if (u) return <CartaoFederal u={u} className={className} />
  }
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
        {alvo.tipo === 'federal'
          ? 'Sem dados de pagamento desta unidade no Portal da Transparência.'
          : <>Fonte: nota CAPAG (Capacidade de Pagamento) do Tesouro Nacional{ente?.posicao ? `, posição ${ente.posicao}` : ''}. Ela mede a saúde financeira do ente, não a pontualidade de cada pagamento.</>}{' '}
        <Link to="/app/agentes/termometro" className="text-primary hover:underline">Consultar outro órgão</Link>
      </p>
    </Card>
  )
}

/** Cartão federal: prazos medidos entre liquidação e pagamento (e desde o fim do mês do serviço, quando há). */
export function CartaoFederal({ u, className }: { u: UgFederal; className?: string }) {
  const posicao = usePosicaoFederal()
  const m = medirFederal(u)
  const c = classificarFederal(m)
  const blocos = m ? [
    { nome: 'Liquidação → pagamento', valor: `${diasTexto(m.media)} em média`, ajuda: 'Dias entre o órgão atestar a nota (liquidação) e a ordem bancária ao fornecedor.', destaque: true },
    { nome: 'Pagos em até 15 dias', valor: pctTexto(m.pctAte15), ajuda: 'Parte dos pagamentos feitos em até 15 dias depois da liquidação.' },
    m.mediaServico != null
      ? { nome: 'Fim do mês do serviço → pagamento', valor: `${diasTexto(m.mediaServico)} em média`, ajuda: `Só nos contratos geridos pelo Contratos.gov.br, que informam o mês do serviço (${m.nc} pagamentos). ${pctTexto(m.pctServico60 ?? 0)} passaram de 60 dias.` }
      : { nome: 'Mais de 30 dias', valor: pctTexto(m.pctAcima30), ajuda: 'Parte dos pagamentos feitos mais de 30 dias depois da liquidação.' },
  ] : []
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Gauge className="h-5 w-5 text-primary" />Termômetro de Pagamento</h2>
        <Badge cor={c.cor === 'azul' ? 'azul' : c.cor}>{c.rotulo}</Badge>
      </div>
      <p className="mt-2 text-sm">{c.texto}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Unidade federal {u.nome} (UG {u.ug}){u.orgao ? ` · ${u.orgao}` : ''}.
        {m?.base === 'orgao' ? ' Esta unidade teve poucos pagamentos; os números são do órgão inteiro.' : ''}
      </p>
      {m && (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {blocos.map((b) => (
            <div key={b.nome} className={cn('rounded-lg border p-3', b.destaque && 'border-primary/40')} title={b.ajuda}>
              <p className="text-xs text-muted-foreground">{b.nome}</p>
              <p className="mt-0.5 text-sm font-semibold">{b.valor}</p>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Fonte: Portal da Transparência (CGU), {m ? `${m.n.toLocaleString('pt-BR')} pagamentos a fornecedores` : 'pagamentos a fornecedores'} nos últimos 3 meses
        {posicaoFederal(posicao.data) ? `, dados até ${posicaoFederal(posicao.data)}` : ''}. Mede o prazo depois que o órgão atesta a nota; a demora até o ateste não aparece nesses dados.{' '}
        <Link to="/app/agentes/termometro" className="text-primary hover:underline">Consultar outro órgão</Link>
      </p>
    </Card>
  )
}
