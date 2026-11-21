import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Award, Building2, CalendarRange, ExternalLink, FileText, MapPin, ShieldAlert, ShieldCheck, Tag, Target, Trophy, XCircle } from 'lucide-react'
import BotaoInverterOrdem from '@/components/BotaoInverterOrdem'
import { ListaOcorrencias } from '@/components/OcorrenciasAta'
import { atasDaEmpresa } from '@/lib/atas'
import { Badge, Button, Card, Carregando, Input, Vazio } from '@/components/ui'
import { analisarEmpresa, rotaPorControle } from '@/lib/analiseEmpresa'
import { linkContratosPNCP } from '@/lib/fornecedores'
import { formatarCnpj, formatarData, formatarMoeda } from '@/lib/format'
import { cn } from '@/lib/utils'

const iso = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
/** Preenche com zero os meses sem resultado, para o eixo do gráfico ficar contínuo. */
function mesesContinuos(porMes: { mes: string; itens: number; valor: number }[]) {
  if (!porMes.length) return []
  const por = new Map(porMes.map((m) => [m.mes, m])), saida: typeof porMes = []
  let [ano, mes] = porMes[0].mes.split('-').map(Number)
  const fim = porMes[porMes.length - 1].mes
  for (let k = 0; k < 120; k++) {
    const chave = `${ano}-${String(mes).padStart(2, '0')}`
    saida.push(por.get(chave) ?? { mes: chave, itens: 0, valor: 0 })
    if (chave >= fim) break
    if (++mes > 12) { mes = 1; ano++ }
  }
  return saida
}
function ultimosAnos(n: number) {
  const hoje = new Date(), inicio = new Date(); inicio.setFullYear(inicio.getFullYear() - n)
  return { de: iso(inicio), ate: iso(hoje) }
}

export default function AnaliseEmpresaDetalhe() {
  const { cnpj = '' } = useParams()
  const navigate = useNavigate()
  const [periodo, setPeriodo] = useState(() => ultimosAnos(1))
  const [antigosPrimeiro, setAntigosPrimeiro] = useState(false)
  const [rascunho, setRascunho] = useState(periodo)
  const valido = /^\d{14}$/.test(cnpj)
  const q = useQuery({ queryKey: ['analise-empresa', cnpj, periodo], enabled: valido, retry: 1, staleTime: 300_000, queryFn: ({ signal }) => analisarEmpresa(cnpj, periodo.de, periodo.ate, signal) })
  if (!valido) return <Vazio titulo="CNPJ inválido" texto="Informe um CNPJ com 14 dígitos." acao={<Link to="/app/analise-empresas"><Button variante="contorno">Voltar</Button></Link>} />
  const a = q.data
  const meses = mesesContinuos(a?.porMes ?? [])
  const maxMes = Math.max(1, ...meses.map((m) => m.valor))
  const nomeMes = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
  const indicadores = a ? [
    { rotulo: 'Itens vencidos', valor: a.itensVencidos.toLocaleString('pt-BR'), icone: Trophy, cor: 'from-emerald-500/25 to-teal-400/10 text-emerald-400 ring-emerald-500/30' },
    { rotulo: 'Licitações vencidas', valor: a.editaisVencidos.toLocaleString('pt-BR'), icone: Award, cor: 'from-sky-500/25 to-blue-500/10 text-sky-400 ring-sky-500/30' },
    { rotulo: 'Valor homologado', valor: formatarMoeda(a.valorHomologado), icone: FileText, cor: 'from-amber-500/25 to-yellow-300/10 text-amber-400 ring-amber-500/30' },
    { rotulo: 'Itens com benefício ME/EPP', valor: a.itensComBeneficioMeEpp.toLocaleString('pt-BR'), icone: Building2, cor: 'from-violet-500/25 to-fuchsia-400/10 text-violet-400 ring-violet-500/30' },
  ] : []

  return (
    <>
      <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/app/analise-empresas'))} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar à pesquisa
      </button>

      <Card className="mb-5 p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-500">Empresa</p>
        <h1 className="mt-1 break-words text-xl font-bold sm:text-2xl">{a?.nome ?? formatarCnpj(cnpj)}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>CNPJ {formatarCnpj(cnpj)}</span>{a?.porte && <Badge>Porte: {a.porte}</Badge>}
          <a className="inline-flex items-center gap-1 text-primary hover:underline" href={linkContratosPNCP(cnpj)} target="_blank" rel="noopener noreferrer">Contratos no PNCP <ExternalLink className="h-3.5 w-3.5" /></a>
        </div>
        <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); setPeriodo(rascunho) }}>
          <label className="text-sm"><span className="mb-1 block font-medium">De</span><Input type="date" value={rascunho.de} max={rascunho.ate} onChange={(e) => setRascunho((p) => ({ ...p, de: e.target.value }))} /></label>
          <label className="text-sm"><span className="mb-1 block font-medium">Até</span><Input type="date" value={rascunho.ate} min={rascunho.de} onChange={(e) => setRascunho((p) => ({ ...p, ate: e.target.value }))} /></label>
          <Button type="submit" carregando={q.isFetching}>Atualizar</Button>
          <span className="text-xs text-muted-foreground">Período de até 6 anos.</span>
        </form>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Períodos rápidos">
          {[1, 3, 6].map((n) => {
            const p = ultimosAnos(n), ativo = periodo.de === p.de && periodo.ate === p.ate
            return <button key={n} type="button" aria-pressed={ativo} disabled={q.isFetching} onClick={() => { setRascunho(p); setPeriodo(p) }}
              className={`h-8 rounded-full border px-3.5 text-sm font-medium transition-colors disabled:opacity-60 ${ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card hover:bg-muted'}`}>
              {n === 1 ? 'Último ano' : `Últimos ${n} anos`}</button>
          })}
        </div>
      </Card>

      {q.isLoading ? <Carregando texto="Consultando resultados oficiais…" /> : q.isError ? (
        <Card className="p-5 text-sm"><p>{(q.error as Error).message}</p><Button className="mt-3" variante="contorno" onClick={() => q.refetch()}>Tentar novamente</Button></Card>
      ) : a && <>
        <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {indicadores.map((k) => (
            <Card key={k.rotulo} className="p-4 sm:p-5">
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ring-1', k.cor)}><k.icone className="h-5 w-5" /></span>
              <div className="mt-3 break-words text-xl font-bold tabular-nums text-sky-500 dark:text-sky-300 sm:text-2xl">{k.valor}</div>
              <div className="mt-1 text-sm font-medium">{k.rotulo}</div>
            </Card>
          ))}
        </div>
        {a.incompleto && <p className="mb-4 text-xs text-muted-foreground">A empresa tem muitos resultados no período; a análise considera até 12.000 resultados, priorizando os mais recentes. Reduza o período para ver tudo.</p>}

        <div className="mb-5 space-y-5">
          <Secao icone={<Target className="h-4 w-4 text-emerald-400" />} titulo="Pontos fortes (o que mais vende)"
            nota="Baseado nas maiores compras vencidas no período (catálogo do governo federal).">
            {!a.fortes?.length ? <p className="text-sm text-muted-foreground">Ainda sem itens detalhados para identificar.</p>
              : <ListaRanking linhas={a.fortes.slice(0, 10).map((f) => ({ chave: f.nome, nome: f.nome, valor: f.valor, texto: formatarMoeda(f.valor) }))} />}
          </Secao>

          <Secao icone={<Tag className="h-4 w-4 text-sky-400" />} titulo="Principais marcas com que venceu"
            nota="Marcas registradas no Painel de Preços do governo federal para os itens que a empresa venceu nas maiores compras do período.">
            {!a.marcas?.length ? <p className="text-sm text-muted-foreground">Marca não informada nas compras analisadas.</p>
              : <ListaRanking linhas={a.marcas.slice(0, 10).map((m) => ({ chave: m.marca, nome: m.marca, valor: m.n, texto: `${m.n.toLocaleString('pt-BR')} ${m.n === 1 ? 'item' : 'itens'}` }))} />}
          </Secao>

          <Secao icone={<Building2 className="h-4 w-4 text-amber-400" />} titulo="Principais órgãos compradores">
            {a.principaisOrgaos.length === 0 ? <p className="text-sm text-muted-foreground">Sem resultados no período.</p>
              : <ListaRanking linhas={a.principaisOrgaos.slice(0, 8).map((o) => ({ chave: o.cnpj, nome: `CNPJ ${formatarCnpj(o.cnpj)}`, detalhe: `${o.itens} ${o.itens === 1 ? 'item' : 'itens'}`, valor: o.valor, texto: formatarMoeda(o.valor) }))} />}
          </Secao>

          <Secao icone={<MapPin className="h-4 w-4 text-sky-400" />} titulo="Vendas por estado do órgão">
            {a.porUf.length === 0 ? <p className="text-sm text-muted-foreground">Sem resultados no período.</p>
              : <ListaRanking linhas={a.porUf.slice(0, 10).map((u) => ({ chave: u.uf, nome: u.uf, valor: u.valor, texto: formatarMoeda(u.valor) }))} total={a.porUf.reduce((t, u) => t + u.valor, 0)} />}
          </Secao>

          <Secao icone={<CalendarRange className="h-4 w-4 text-violet-400" />} titulo="Sazonalidade (valor vencido por mês)">
            {!meses.length ? <p className="text-sm text-muted-foreground">Sem resultados no período.</p> : (
              <div className={`flex h-44 items-end ${meses.length > 18 ? 'gap-px' : 'gap-1.5'}`} role="img" aria-label="Valor vencido por mês">
                {meses.map((m, i) => {
                  // Períodos longos: rótulo só na virada de cada ano, para caber.
                  const longo = meses.length > 18, rotulo = !longo ? nomeMes(m.mes) : (m.mes.endsWith('-01') || (i === 0 && m.mes.slice(5) <= '09')) ? m.mes.slice(0, 4) : ''
                  return (
                    <div key={m.mes} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${nomeMes(m.mes)}: ${formatarMoeda(m.valor)} em ${m.itens} ${m.itens === 1 ? 'item' : 'itens'}`}>
                      <div className={`w-full ${m.valor > 0 ? 'lf-degrade' : 'bg-muted'} ${longo ? 'rounded-t-sm' : 'rounded-t-md'}`} style={{ height: `${m.valor > 0 ? Math.max(4, (m.valor / maxMes) * 140) : 2}px` }} />
                      <span className={`text-[10px] text-muted-foreground ${longo ? 'overflow-visible whitespace-nowrap' : 'truncate'}`}>{rotulo || ' '}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </Secao>

          <Secao icone={a.sancoes?.length ? <ShieldAlert className="h-4 w-4 text-rose-400" /> : <ShieldCheck className="h-4 w-4 text-emerald-400" />} titulo="Penalidades (CEIS / CNEP)">
            {!a.sancoesDisponiveis ? <p className="text-sm text-muted-foreground">A consulta de sanções do Portal da Transparência ainda não foi ativada no LicitaFlow.</p>
              : a.sancoes === null ? <p className="text-sm text-muted-foreground">O Portal da Transparência não respondeu agora.</p>
              : a.sancoes.length === 0 ? <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Nenhuma sanção registrada.</p>
              : <ul className="space-y-2">{a.sancoes.map((s, i) => <li key={i} className="rounded-xl border border-rose-500/40 p-3 text-sm"><p className="font-semibold">{s.cadastro} · {s.tipo ?? 'Sanção'}</p><p className="text-xs text-muted-foreground">{s.orgao} · {s.inicio ?? '—'} a {s.fim ?? 'sem data final'}</p></li>)}</ul>}
          </Secao>
        </div>

        <DesclassificacoesEmpresa cnpj={cnpj} nome={a.nome ?? ''} compras={a.compras ?? [...new Set(a.ultimos.map((u) => u.controle))]} />

        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Últimos itens vencidos</h2>
            {a.ultimos.length > 1 && <BotaoInverterOrdem invertido={antigosPrimeiro} aoMudar={setAntigosPrimeiro} normal="Mais recentes primeiro" inverso="Mais antigos primeiro" />}
          </div>
          {a.ultimos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum item vencido no período (resultados da Lei 14.133 publicados no PNCP).</p> : <ul className="divide-y">
            {(antigosPrimeiro ? [...a.ultimos].reverse() : a.ultimos).map((r) => {
              const rota = rotaPorControle(r.controle)
              return <li key={`${r.controle}-${r.item}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                <span className="min-w-0 flex-1">{rota ? <Link to={rota} className="font-semibold text-sky-700 hover:underline dark:text-sky-300">{r.controle}</Link> : r.controle} · Item {r.item}</span>
                <span className="text-muted-foreground">{formatarData(r.data)} · {r.uf ?? '—'}</span>
                <span className="font-semibold tabular-nums">{r.valorTotal ? formatarMoeda(r.valorTotal) : 'Valor não informado'}</span>
                {r.marca && <Badge cor="azul">Marca: {r.marca}</Badge>}
                {r.meEpp && <Badge cor="verde">ME/EPP</Badge>}
                {r.idCompra && /^\d{17}$/.test(r.idCompra) && <Link to={`/app/compras/${r.idCompra}`} className="text-xs font-semibold text-primary hover:underline">Ver compra</Link>}
              </li>
            })}
          </ul>}
          <p className="mt-3 text-xs text-muted-foreground">Fonte: dados abertos do Compras.gov.br (resultados de itens publicados no PNCP), consultados na hora.</p>
        </Card>
      </>}
    </>
  )
}

/** Lê as atas (PNCP) das compras em que a empresa venceu algo e mostra onde ela foi desclassificada ou inabilitada. */
function DesclassificacoesEmpresa({ cnpj, nome, compras }: { cnpj: string; nome: string; compras: string[] }) {
  const lista = compras.filter((c) => /^\d{14}-1-\d+\/\d{4}$/.test(c)).slice(0, 15)
  const q = useQuery({ queryKey: ['atas-empresa', cnpj, lista], enabled: lista.length > 0, staleTime: 3_600_000, retry: 1, queryFn: ({ signal }) => atasDaEmpresa(cnpj, nome, lista, signal) })
  return (
    <Card className="mb-5 p-5">
      <h2 className="mb-2 flex items-center gap-2 font-semibold"><XCircle className="h-4 w-4 text-rose-400" />Desclassificações, inabilitações e motivos</h2>
      {!lista.length ? <p className="text-sm text-muted-foreground">Sem compras no período para ler as atas.</p>
        : q.isLoading ? <Carregando texto={`Lendo as atas de ${lista.length} compras no PNCP…`} />
        : q.isError ? <p className="text-sm">{(q.error as Error).message} <button className="font-semibold text-primary underline" onClick={() => q.refetch()}>Tentar novamente</button></p>
        : q.data && (
          <>
            <p className="mb-3 text-xs text-muted-foreground">{q.data.comprasConsultadas} compras consultadas · {q.data.comAta} com ata da sessão publicada no PNCP.</p>
            {q.data.ocorrencias.length === 0
              ? <p className="text-sm text-muted-foreground">Nenhuma desclassificação ou inabilitação desta empresa encontrada nas atas lidas.</p>
              : <ListaOcorrencias ocorrencias={q.data.ocorrencias} mostrarCompra />}
          </>
        )}
      <p className="mt-3 text-xs text-muted-foreground">Lemos as atas das compras mais recentes em que a empresa venceu algum item. Compras do governo federal (Compras.gov.br) quase nunca publicam a ata no PNCP, e lá a consulta é protegida por captcha. Por isso, a cobertura é maior em estados e municípios. Confira sempre o trecho na ata original.</p>
    </Card>
  )
}

/** Cartão de seção em largura total, para as informações ficarem uma embaixo da outra. */
function Secao({ icone, titulo, nota, children }: { icone: ReactNode; titulo: string; nota?: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">{icone}{titulo}</h2>
      {children}
      {nota && <p className="mt-3 text-xs text-muted-foreground">{nota}</p>}
    </Card>
  )
}

/** Lista numerada: nome à esquerda, valor à direita e barra de proporção embaixo. */
function ListaRanking({ linhas, total }: { linhas: { chave: string; nome: string; detalhe?: string; valor: number; texto: string }[]; total?: number }) {
  const max = Math.max(1, ...linhas.map((l) => l.valor))
  return (
    <ol className="divide-y">
      {linhas.map((l, i) => (
        <li key={l.chave} className="py-2.5 first:pt-0 last:pb-0">
          <div className="flex items-baseline gap-3 text-sm">
            <span className="w-5 shrink-0 tabular-nums text-muted-foreground">{i + 1}</span>
            <span className="min-w-0 flex-1 break-words font-medium">{l.nome}{l.detalhe && <span className="ml-2 text-xs font-normal text-muted-foreground">{l.detalhe}</span>}</span>
            {total ? <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{Math.round((l.valor / total) * 100)}%</span> : null}
            <span className="shrink-0 font-semibold tabular-nums">{l.texto}</span>
          </div>
          <div className="ml-8 mt-1.5 h-1.5 rounded-full bg-muted"><div className="lf-degrade h-1.5 rounded-full" style={{ width: `${(l.valor / max) * 100}%` }} /></div>
        </li>
      ))}
    </ol>
  )
}
