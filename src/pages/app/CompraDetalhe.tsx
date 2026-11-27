import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ChevronDown, ExternalLink, FileText, Tag, Trophy, Upload } from 'lucide-react'
import { Badge, Button, Card, Carregando, Vazio } from '@/components/ui'
import { abrirCompra, linkCompraComprasGov, type CompraFederal, type ItemCompraFederal } from '@/lib/compraFederal'
import { rotaPorControle } from '@/lib/analiseEmpresa'
import EmpresasDisputa from '@/components/EmpresasDisputa'
import type { ColocacaoItem } from '@/lib/resultadosEdital'
import { linkPesquisaMarca } from '@/lib/precos'
import { formatarCnpj, formatarData, formatarMoeda } from '@/lib/format'
import { atasDaCompra, atasEnviadas, enviarAta, juntarAtas, type AtaEnviada, type AtasCompra } from '@/lib/atas'
import { concorrentesDoItem } from '@/lib/concorrentesItem'
import { BotaoDisputaItem, DisputaComprasGov, LinhaConcorrente } from '@/components/ConcorrentesItem'
import { cn } from '@/lib/utils'

function Item({ item, todos, atas, atasCarregando }: { item: ItemCompraFederal; todos: ItemCompraFederal[]; atas?: AtasCompra; atasCarregando: boolean }) {
  const [aberto, setAberto] = useState(false)
  const vencedor = item.resultados[0]
  const { lista, semItem } = concorrentesDoItem(item, todos, atas)
  // Sem marca nos dados abertos, vale a marca da proposta vencedora trazida do Compras.gov.br.
  const marcaVencedora = item.marca ?? lista.find((c) => c.situacao === 'vencedora' && c.marca)?.marca ?? null
  const lidas = atas?.documentos.some((d) => d.lido) ?? false
  return (
    <article className={cn('lf-cartao overflow-hidden rounded-2xl border bg-card', aberto && 'border-primary/40')}>
      <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-semibold">{item.numero}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{item.resumo || item.descricao || 'Item sem descrição'}</span>
          <span className="block text-xs text-muted-foreground">
            {vencedor ? <>Vencedor: {vencedor.fornecedor} · {vencedor.valorUnitario ? formatarMoeda(vencedor.valorUnitario) : '—'}</> : item.situacao ?? 'Sem resultado'}
            {marcaVencedora && <> · Marca: {marcaVencedora}</>}
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
            <div><dt className="text-[11px] font-semibold uppercase text-muted-foreground">Marca vencedora</dt><dd className="mt-1 font-semibold">{marcaVencedora ?? 'Não informada'}</dd>
              {marcaVencedora && <a href={linkPesquisaMarca(marcaVencedora, item.resumo ?? item.descricao)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold hover:bg-muted">Pesquisar no Google</a>}</div>
          </dl>
          <p className="mt-3 whitespace-pre-wrap break-words text-muted-foreground">{item.descricao}</p>
          <div className="mt-2 flex flex-wrap gap-2">{[item.criterio, item.beneficio, item.situacao].filter(Boolean).map((t) => <Badge key={t}>{t}</Badge>)}</div>
          <h4 className="mb-2 mt-4 flex items-center gap-2 font-semibold"><Trophy className="h-4 w-4 text-amber-400" />Concorrentes {item.grupo ? `do item (grupo ${item.grupo})` : 'do item'}{lista.length > 0 && <span className="text-sm font-normal text-muted-foreground">· {lista.length}</span>}</h4>
          {lista.length === 0 ? <p className="text-muted-foreground">Resultado ainda não publicado.</p> : <ol className="space-y-2">{lista.map((c) => <LinhaConcorrente key={c.chave} c={c} />)}</ol>}
          <BotaoDisputaItem numero={item.numero} />
          {semItem.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold">Outras {semItem.length} empresas citadas na ata desta compra (a ata não diz o item)</summary>
              <ol className="mt-2 space-y-2">{semItem.map((c) => <LinhaConcorrente key={c.chave} c={c} />)}</ol>
            </details>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            {atasCarregando ? 'Procurando desclassificadas e inabilitadas nas atas da compra…'
              : lista.some((c) => c.fonte === 'portal') ? 'Todas as propostas vieram da página da compra no Compras.gov.br.' : lidas ? 'Vencedora, colocações e cancelamentos são os dados oficiais; as demais propostas, desclassificadas e inabilitadas foram lidas na ata (confira no arquivo original).'
              : 'Os dados abertos publicam só as empresas homologadas (vencedora e cadastro de reserva) e os resultados cancelados. Todas as propostas de cada item aparecem no quadro "Disputa completa" acima.'}
          </p>
        </div>
      )}
    </article>
  )
}

/**
 * Envio do termo de julgamento / ata da sessão baixado no portal da compra (que pede captcha).
 * A leitura fica guardada para a compra e aparece para todos os usuários.
 */
function EnviarAta({ idCompra, controle, enviadas }: { idCompra: string; controle: string | null; enviadas: AtaEnviada[] }) {
  const qc = useQueryClient()
  const entrada = useRef<HTMLInputElement>(null)
  const envio = useMutation({
    mutationFn: (arquivo: File) => enviarAta(idCompra, controle, arquivo),
    onSuccess: (nova) => qc.setQueryData<AtaEnviada[]>(['atas-enviadas', idCompra], (atual = []) => [nova, ...atual.filter((a) => a.hash !== nova.hash)]),
  })
  const ultima = envio.data
  const empresasLidas = (a: AtaEnviada) => new Set([...(a.resultado.itens ?? []).flatMap((i) => i.empresas.map((e) => e.cnpj)), ...(a.resultado.participantes ?? []).map((p) => p.cnpj)]).size
  return (
    <Card className="mb-4 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-semibold"><Upload className="h-4 w-4 text-sky-400" />Todas as propostas, desclassificadas e inabilitadas</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">Baixe o <b>termo de julgamento</b> ou a <b>ata da sessão</b> em PDF em "Ver disputa no portal" e envie aqui. A plataforma lê o arquivo e mostra todas as empresas em cada item, para todos os usuários.</span>
        </span>
        <input ref={entrada} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) envio.mutate(f) }} />
        <Button tamanho="sm" variante="contorno" disabled={envio.isPending} onClick={() => entrada.current?.click()}><Upload className="h-4 w-4" />{envio.isPending ? 'Lendo o arquivo…' : 'Enviar ata (PDF)'}</Button>
      </div>
      {envio.isError && <p className="mt-2 text-red-600 dark:text-red-400">{(envio.error as Error).message}</p>}
      {ultima && <p className="mt-2 text-emerald-600 dark:text-emerald-300">Arquivo lido: {empresasLidas(ultima)} empresas em {ultima.resultado.itens?.length ?? 0} itens/grupos. Abra um item para ver os concorrentes.</p>}
      {enviadas.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Atas já enviadas: {enviadas.map((a, i) => <span key={a.hash}>{i > 0 && ', '}{a.arquivo} ({formatarData(a.created_at)})</span>)}. A leitura é automática: confira no arquivo original.
        </p>
      )}
    </Card>
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
  const enviadas = useQuery({ queryKey: ['atas-enviadas', idCompra], enabled: valido, staleTime: 300_000, retry: 1, queryFn: ({ signal }) => atasEnviadas(idCompra, signal) })
  const atasJuntas = juntarAtas(atas.data, enviadas.data)
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
        <EmpresasDisputa controle={c.controle} colocacoes={colocacoesDa(c)} portal={(enviadas.data ?? []).flatMap((a) => a.resultado.itens ?? []).filter((i) => i.fonte === 'portal')} />
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Tag className="h-5 w-5 text-sky-400" />Itens, vencedores e marcas</h2>
        <DisputaComprasGov idCompra={idCompra} itens={c.itens.map((i) => i.numero)} guardados={enviadas.isSuccess ? (enviadas.data ?? []).flatMap((a) => a.resultado.itens ?? []).filter((i) => i.fonte === 'portal').length : null} className="mb-4" />
        <EnviarAta idCompra={idCompra} controle={c.controle} enviadas={enviadas.data ?? []} />
        <div className="space-y-2">{c.itens.map((i) => <Item key={i.numero} item={i} todos={c.itens} atas={atasJuntas} atasCarregando={(atas.isLoading && atas.fetchStatus !== 'idle') || enviadas.isLoading} />)}</div>
      </>}
    </>
  )
}

/** Resultados homologados por item: ordem 1 vence; 2, 3... são o cadastro de reserva do registro de preço. */
function colocacoesDa(c: CompraFederal): ColocacaoItem[] {
  return c.itens.flatMap((item) => item.resultados.filter((r) => r.cnpj).map((r) => ({ item: item.numero, cnpj: r.cnpj!, nome: r.fornecedor, ordem: r.ordem, valorUnitario: r.valorUnitario, valorTotal: r.valorTotal })))
}
