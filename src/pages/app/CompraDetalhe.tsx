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
import { atasDaCompra, type AtasCompra } from '@/lib/atas'
import { concorrentesDoItem, type Concorrente, type SituacaoConcorrente } from '@/lib/concorrentesItem'
import { cn } from '@/lib/utils'

const SELO: Record<SituacaoConcorrente, { texto: string; cor: 'verde' | 'azul' | 'vermelho' | 'amarelo' | 'neutro' }> = {
  vencedora: { texto: 'Vencedora', cor: 'verde' }, classificada: { texto: 'Classificada', cor: 'azul' },
  desclassificacao: { texto: 'Desclassificada', cor: 'vermelho' }, inabilitacao: { texto: 'Inabilitada', cor: 'amarelo' },
  recusa: { texto: 'Proposta recusada', cor: 'vermelho' }, cancelado: { texto: 'Resultado cancelado', cor: 'neutro' },
  sem_proposta: { texto: 'Não enviou proposta', cor: 'neutro' }, participou: { texto: 'Participou', cor: 'neutro' },
}

function LinhaConcorrente({ c }: { c: Concorrente }) {
  const selo = SELO[c.situacao]
  return (
    <li className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border p-3', ['desclassificacao', 'inabilitacao', 'recusa', 'cancelado', 'sem_proposta'].includes(c.situacao) && 'border-dashed')}>
      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold', c.situacao === 'vencedora' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'bg-muted text-muted-foreground')} title={c.colocacao ? `${c.colocacao}º colocado` : 'Colocação não publicada'}>{c.colocacao ? `${c.colocacao}º` : '–'}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          {c.cnpj && /^\d{14}$/.test(c.cnpj) ? <Link className="font-semibold text-sky-700 hover:underline dark:text-sky-300" to={`/app/analise-empresas/${c.cnpj}`}>{c.nome ?? `CNPJ ${formatarCnpj(c.cnpj)}`}</Link> : <span className="font-semibold">{c.nome}</span>}
          <Badge cor={selo.cor}>{selo.texto}</Badge>
        </span>
        <span className="block text-xs text-muted-foreground">{c.cnpj ? `CNPJ ${formatarCnpj(c.cnpj)}` : 'CNPJ não informado na ata'}{c.porte ? ` · ${c.porte}` : ''}{c.meEpp ? ' · benefício ME/EPP' : ''}{c.fonte === 'ata' ? ' · lido na ata' : ''}</span>
        {c.motivo && <span className="mt-1 block text-xs text-muted-foreground">{c.situacao === 'cancelado' ? 'Motivo do cancelamento: ' : 'Motivo: '}{c.motivo.length > 220 ? `${c.motivo.slice(0, 217)}…` : c.motivo}</span>}
      </span>
      {(c.valorUnitario || c.valorTotal) && <span className="text-right"><span className="block font-bold tabular-nums">{c.valorUnitario ? formatarMoeda(c.valorUnitario) : '—'}</span><span className="text-xs text-muted-foreground">total {c.valorTotal ? formatarMoeda(c.valorTotal) : '—'}</span></span>}
    </li>
  )
}

function Item({ item, todos, atas, atasCarregando }: { item: ItemCompraFederal; todos: ItemCompraFederal[]; atas?: AtasCompra; atasCarregando: boolean }) {
  const [aberto, setAberto] = useState(false)
  const vencedor = item.resultados[0]
  const { lista, semItem } = concorrentesDoItem(item, todos, atas)
  const lidas = atas?.documentos.some((d) => d.lido) ?? false
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
          <h4 className="mb-2 mt-4 flex items-center gap-2 font-semibold"><Trophy className="h-4 w-4 text-amber-400" />Concorrentes {item.grupo ? `do item (grupo ${item.grupo})` : 'do item'}{lista.length > 0 && <span className="text-sm font-normal text-muted-foreground">· {lista.length}</span>}</h4>
          {lista.length === 0 ? <p className="text-muted-foreground">Resultado ainda não publicado.</p> : <ol className="space-y-2">{lista.map((c) => <LinhaConcorrente key={c.chave} c={c} />)}</ol>}
          {semItem.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold">Outras {semItem.length} empresas citadas na ata desta compra (a ata não diz o item)</summary>
              <ol className="mt-2 space-y-2">{semItem.map((c) => <LinhaConcorrente key={c.chave} c={c} />)}</ol>
            </details>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            {atasCarregando ? 'Procurando desclassificadas e inabilitadas nas atas da compra…'
              : lidas ? 'Vencedora, colocações e cancelamentos são os dados oficiais; desclassificadas, inabilitadas e demais participantes foram lidos na ata da sessão (confira na ata original).'
              : 'Os dados abertos publicam só as empresas homologadas (vencedora e cadastro de reserva) e os resultados cancelados. Desclassificadas, inabilitadas e as demais propostas ficam na ata da sessão, que esta compra não publicou em PDF com texto, ou na disputa no portal.'}
          </p>
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
  // Mesma consulta do quadro "Empresas que disputaram" (cache compartilhado): desclassificadas e inabilitadas por item.
  const controleAta = q.data?.controle && /^\d{14}-1-\d+\/\d{4}$/.test(q.data.controle) ? q.data.controle : null
  const atas = useQuery({ queryKey: ['atas-compra', controleAta], enabled: !!controleAta, staleTime: 3_600_000, retry: 1, queryFn: ({ signal }) => atasDaCompra(controleAta!, signal) })
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
        <div className="space-y-2">{c.itens.map((i) => <Item key={i.numero} item={i} todos={c.itens} atas={atas.data} atasCarregando={atas.isLoading && atas.fetchStatus !== 'idle'} />)}</div>
      </>}
    </>
  )
}

/** Resultados homologados por item: ordem 1 vence; 2, 3... são o cadastro de reserva do registro de preço. */
function colocacoesDa(c: CompraFederal): ColocacaoItem[] {
  return c.itens.flatMap((item) => item.resultados.filter((r) => r.cnpj).map((r) => ({ item: item.numero, cnpj: r.cnpj!, nome: r.fornecedor, ordem: r.ordem, valorUnitario: r.valorUnitario, valorTotal: r.valorTotal })))
}
