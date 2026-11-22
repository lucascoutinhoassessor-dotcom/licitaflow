import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ChevronDown, ExternalLink, FileText, Tag, Trophy } from 'lucide-react'
import { Badge, Button, Card, Carregando, Vazio } from '@/components/ui'
import { abrirCompra, linkCompraComprasGov, type CompraFederal, type ItemCompraFederal } from '@/lib/compraFederal'
import { rotaPorControle } from '@/lib/analiseEmpresa'
import EmpresasDisputa from '@/components/EmpresasDisputa'
import type { ColocacaoItem } from '@/lib/resultadosEdital'
import { linkPesquisaMarca } from '@/lib/precos'
import { formatarCnpj, formatarData, formatarMoeda } from '@/lib/format'
import { cn } from '@/lib/utils'

function Item({ item }: { item: ItemCompraFederal }) {
  const [aberto, setAberto] = useState(false)
  const vencedor = item.resultados[0]
  return (
    <article className={cn('lf-cartao overflow-hidden rounded-2xl border bg-card', aberto && 'border-primary/40')}>
      <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-semibold">{item.numero}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{item.resumo || item.descricao || 'Item sem descrição'}</span>
          <span className="block text-xs text-muted-foreground">
            {vencedor ? <>Vencedor: {vencedor.fornecedor} · {vencedor.valorUnitario ? formatarMoeda(vencedor.valorUnitario) : '—'}</> : item.situacao ?? 'Sem resultado'}
            {item.marca && <> · Marca: {item.marca}</>}
          </span>
        </span>
        <ChevronDown className={cn('h-5 w-5 shrink-0 text-muted-foreground transition-transform', aberto && 'rotate-180')} />
      </button>
      {aberto && (
        <div className="border-t px-4 pb-4 pt-3 text-sm">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><dt className="text-[11px] font-semibold uppercase text-muted-foreground">Tipo</dt><dd className="mt-1 font-semibold">{item.tipo ?? '—'}</dd></div>
            <div><dt className="text-[11px] font-semibold uppercase text-muted-foreground">Quantidade</dt><dd className="mt-1 font-semibold">{item.quantidade?.toLocaleString('pt-BR') ?? '—'} {item.unidade ?? ''}</dd></div>
            <div><dt className="text-[11px] font-semibold uppercase text-muted-foreground">Estimado (unit.)</dt><dd className="mt-1 font-semibold">{item.sigiloso ? 'Sigiloso' : item.valorEstimado ? formatarMoeda(item.valorEstimado) : '—'}</dd></div>
            <div><dt className="text-[11px] font-semibold uppercase text-muted-foreground">Marca vencedora</dt><dd className="mt-1 font-semibold">{item.marca ?? 'Não informada'}</dd>
              {item.marca && <a href={linkPesquisaMarca(item.marca, item.resumo ?? item.descricao)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold hover:bg-muted">Pesquisar no Google</a>}</div>
          </dl>
          <p className="mt-3 whitespace-pre-wrap break-words text-muted-foreground">{item.descricao}</p>
          <div className="mt-2 flex flex-wrap gap-2">{[item.criterio, item.beneficio, item.situacao].filter(Boolean).map((t) => <Badge key={t}>{t}</Badge>)}</div>
          <h4 className="mb-2 mt-4 flex items-center gap-2 font-semibold"><Trophy className="h-4 w-4 text-amber-400" />Empresas e colocações</h4>
          {item.resultados.length === 0 ? <p className="text-muted-foreground">Resultado ainda não publicado.</p> : (
            <ol className="space-y-2">
              {item.resultados.map((r, i) => (
                <li key={`${r.cnpj}-${i}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border p-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-600 dark:text-emerald-300">{r.ordem ?? i + 1}º</span>
                  <span className="min-w-0 flex-1">{r.cnpj && /^\d{14}$/.test(r.cnpj) ? <Link className="font-semibold text-sky-700 hover:underline dark:text-sky-300" to={`/app/analise-empresas/${r.cnpj}`}>{r.fornecedor}</Link> : <span className="font-semibold">{r.fornecedor}</span>}
                    <span className="block text-xs text-muted-foreground">{r.cnpj ? `CNPJ ${formatarCnpj(r.cnpj)}` : ''}{r.porte ? ` · ${r.porte}` : ''}{r.meEpp ? ' · benefício ME/EPP' : ''}</span></span>
                  <span className="text-right"><span className="block font-bold tabular-nums">{r.valorUnitario ? formatarMoeda(r.valorUnitario) : '—'}</span><span className="text-xs text-muted-foreground">total {r.valorTotal ? formatarMoeda(r.valorTotal) : '—'}</span></span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </article>
  )
}

export default function CompraDetalhe() {
  const { idCompra = '' } = useParams()
  const navigate = useNavigate()
  const valido = /^\d{15,20}$/.test(idCompra)
  const q = useQuery({ queryKey: ['compra-federal', idCompra], enabled: valido, retry: 1, staleTime: 600_000, queryFn: ({ signal }) => abrirCompra(idCompra, signal) })
  if (!valido) return <Vazio titulo="Compra não encontrada" texto="O código desta compra está incompleto." />
  const c: CompraFederal | undefined = q.data
  const rota = c?.controle ? rotaPorControle(c.controle) : null
  return (
    <>
      <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/app/historico-precos'))} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>
      {q.isLoading ? <Carregando texto="Consultando a compra…" /> : q.isError ? (
        <Card className="p-5 text-sm">{(q.error as Error).message} <button className="font-semibold text-primary underline" onClick={() => q.refetch()}>Tentar novamente</button></Card>
      ) : c && <>
        <Card className="mb-5 p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-500">{c.modalidade}{c.numero ? ` Nº ${c.numero}` : ''}{c.ano ? `/${c.ano}` : ''}</p>
          <h1 className="mt-1 text-lg font-bold sm:text-2xl">{c.orgao}</h1>
          <p className="text-sm text-muted-foreground">{c.unidade}{c.uf ? ` · ${c.uf}` : ''}</p>
          <p className="mt-3 whitespace-pre-wrap break-words">{c.objeto}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {c.valorEstimado && <Badge cor="azul">Estimado {formatarMoeda(c.valorEstimado)}</Badge>}
            {c.valorHomologado && <Badge cor="verde">Homologado {formatarMoeda(c.valorHomologado)}</Badge>}
            {c.srp && <Badge cor="amarelo">Registro de preço</Badge>}
            {c.situacao && <Badge>{c.situacao}</Badge>}
            {c.abertura && <Badge>Abertura {formatarData(c.abertura)}</Badge>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {rota && <Link to={rota}><Button tamanho="sm"><FileText className="h-4 w-4" />Acessar a oportunidade</Button></Link>}
            <a href={linkCompraComprasGov(idCompra)} target="_blank" rel="noopener noreferrer"><Button variante="contorno" tamanho="sm"><ExternalLink className="h-4 w-4" />Ver disputa no portal</Button></a>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Lances, propostas desclassificadas e motivos ficam na página oficial da compra, no portal da disputa, que exige acesso próprio.</p>
        </Card>
        <EmpresasDisputa controle={c.controle} colocacoes={colocacoesDa(c)} />
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Tag className="h-5 w-5 text-sky-400" />Itens, vencedores e marcas</h2>
        <div className="space-y-2">{c.itens.map((i) => <Item key={i.numero} item={i} />)}</div>
      </>}
    </>
  )
}

/** Resultados homologados por item: ordem 1 vence; 2, 3... são o cadastro de reserva do registro de preço. */
function colocacoesDa(c: CompraFederal): ColocacaoItem[] {
  return c.itens.flatMap((item) => item.resultados.filter((r) => r.cnpj).map((r) => ({ item: item.numero, cnpj: r.cnpj!, nome: r.fornecedor, ordem: r.ordem, valorUnitario: r.valorUnitario, valorTotal: r.valorTotal })))
}
