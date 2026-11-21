import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Award, Building2, CalendarRange, ExternalLink, FileText, MapPin, ShieldAlert, ShieldCheck, Tag, Target, Trophy, XCircle } from 'lucide-react'
import { Badge, Button, Card, Carregando, Input, Vazio } from '@/components/ui'
import { analisarEmpresa, rotaPorControle } from '@/lib/analiseEmpresa'
import { linkContratosPNCP } from '@/lib/fornecedores'
import { formatarCnpj, formatarData, formatarMoeda } from '@/lib/format'
import { cn } from '@/lib/utils'

const iso = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

export default function AnaliseEmpresaDetalhe() {
  const { cnpj = '' } = useParams()
  const navigate = useNavigate()
  const hoje = new Date(), umAno = new Date(); umAno.setFullYear(umAno.getFullYear() - 1)
  const [periodo, setPeriodo] = useState({ de: iso(umAno), ate: iso(hoje) })
  const [rascunho, setRascunho] = useState(periodo)
  const valido = /^\d{14}$/.test(cnpj)
  const q = useQuery({ queryKey: ['analise-empresa', cnpj, periodo], enabled: valido, retry: 1, staleTime: 300_000, queryFn: ({ signal }) => analisarEmpresa(cnpj, periodo.de, periodo.ate, signal) })
  if (!valido) return <Vazio titulo="CNPJ inválido" texto="Informe um CNPJ com 14 dígitos." acao={<Link to="/app/analise-empresas"><Button variante="contorno">Voltar</Button></Link>} />
  const a = q.data
  const maxUf = Math.max(1, ...(a?.porUf.map((u) => u.valor) ?? [1]))
  const maxMes = Math.max(1, ...(a?.porMes?.map((m) => m.valor) ?? [1]))
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
          <span className="text-xs text-muted-foreground">Período de até 1 ano.</span>
        </form>
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
        {a.incompleto && <p className="mb-4 text-xs text-muted-foreground">A empresa tem muitos resultados no período; a análise considera os 3.000 mais recentes. Reduza o período para ver tudo.</p>}

        <div className="mb-5 grid gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4 text-sky-400" />Vendas por estado do órgão</h2>
            {a.porUf.length === 0 ? <p className="text-sm text-muted-foreground">Sem resultados no período.</p> : <ul className="space-y-2.5">
              {a.porUf.slice(0, 10).map((u) => <li key={u.uf}>
                <div className="flex justify-between text-sm"><span className="font-medium">{u.uf}</span><span className="tabular-nums text-muted-foreground">{formatarMoeda(u.valor)}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="lf-degrade h-1.5 rounded-full" style={{ width: `${(u.valor / maxUf) * 100}%` }} /></div>
              </li>)}
            </ul>}
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold">{a.sancoes?.length ? <ShieldAlert className="h-4 w-4 text-rose-400" /> : <ShieldCheck className="h-4 w-4 text-emerald-400" />}Penalidades (CEIS / CNEP)</h2>
            {!a.sancoesDisponiveis ? <p className="text-sm text-muted-foreground">A consulta de sanções do Portal da Transparência ainda não foi ativada no LicitaFlow.</p>
              : a.sancoes === null ? <p className="text-sm text-muted-foreground">O Portal da Transparência não respondeu agora.</p>
              : a.sancoes.length === 0 ? <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Nenhuma sanção registrada.</p>
              : <ul className="space-y-2">{a.sancoes.map((s, i) => <li key={i} className="rounded-xl border border-rose-500/40 p-3 text-sm"><p className="font-semibold">{s.cadastro} · {s.tipo ?? 'Sanção'}</p><p className="text-xs text-muted-foreground">{s.orgao} · {s.inicio ?? '—'} a {s.fim ?? 'sem data final'}</p></li>)}</ul>}
            <h3 className="mb-2 mt-5 text-sm font-semibold">Principais órgãos compradores</h3>
            {a.principaisOrgaos.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : <ul className="space-y-1.5 text-sm">
              {a.principaisOrgaos.slice(0, 5).map((o) => <li key={o.cnpj} className="flex justify-between gap-3"><span>CNPJ {formatarCnpj(o.cnpj)} · {o.itens} {o.itens === 1 ? 'item' : 'itens'}</span><span className="tabular-nums text-muted-foreground">{formatarMoeda(o.valor)}</span></li>)}
            </ul>}
          </Card>
        </div>

        <div className="mb-5 grid gap-5 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><CalendarRange className="h-4 w-4 text-violet-400" />Sazonalidade (valor vencido por mês)</h2>
            {!a.porMes?.length ? <p className="text-sm text-muted-foreground">Sem resultados no período.</p> : (
              <div className="flex h-44 items-end gap-1.5" role="img" aria-label="Valor vencido por mês">
                {a.porMes.map((m) => (
                  <div key={m.mes} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${nomeMes(m.mes)}: ${formatarMoeda(m.valor)} em ${m.itens} ${m.itens === 1 ? 'item' : 'itens'}`}>
                    <div className="lf-degrade w-full rounded-t-md" style={{ height: `${Math.max(4, (m.valor / maxMes) * 140)}px` }} />
                    <span className="truncate text-[10px] text-muted-foreground">{nomeMes(m.mes)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><Target className="h-4 w-4 text-emerald-400" />Pontos fortes</h2>
            {!a.fortes?.length ? <p className="text-sm text-muted-foreground">Ainda sem itens detalhados para identificar.</p> : <ul className="space-y-2 text-sm">
              {a.fortes.slice(0, 6).map((f) => <li key={f.nome} className="flex justify-between gap-3"><span className="min-w-0 truncate font-medium">{f.nome}</span><span className="shrink-0 tabular-nums text-muted-foreground">{formatarMoeda(f.valor)}</span></li>)}
            </ul>}
            <h3 className="mb-2 mt-5 flex items-center gap-2 text-sm font-semibold"><Tag className="h-4 w-4 text-sky-400" />Marcas com que venceu</h3>
            {!a.marcas?.length ? <p className="text-sm text-muted-foreground">Marca não informada nas compras analisadas.</p> : <div className="flex flex-wrap gap-2">{a.marcas.map((m) => <Badge key={m.marca} cor="azul">{m.marca} · {m.n}</Badge>)}</div>}
            <p className="mt-3 text-xs text-muted-foreground">Baseado nas maiores compras vencidas no período (catálogo e Painel de Preços do governo federal).</p>
          </Card>
        </div>

        <Card className="mb-5 p-5">
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><XCircle className="h-4 w-4 text-rose-400" />Desclassificações e motivos</h2>
          <p className="text-sm text-muted-foreground">As propostas desclassificadas, inabilitações e seus motivos não são publicadas nos dados abertos do governo: ficam na ata de cada compra no Compras.gov.br, que exige acesso próprio. Abra uma compra abaixo e use "Ver disputa no Compras.gov" para consultar a ata.</p>
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Últimos itens vencidos</h2>
          {a.ultimos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum item vencido no período (resultados da Lei 14.133 publicados no PNCP).</p> : <ul className="divide-y">
            {a.ultimos.map((r) => {
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
