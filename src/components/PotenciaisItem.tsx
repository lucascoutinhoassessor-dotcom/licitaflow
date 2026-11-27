import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Building2, ExternalLink, Search, Tag } from 'lucide-react'
import { Button, Carregando, Input } from '@/components/ui'
import { buscarCatalogo, historicoPrecos, linkPesquisaMarca, type CompraPreco, type ItemCatalogo } from '@/lib/precos'
import { formatarCnpj } from '@/lib/format'
import { potenciaisDoHistorico, termoDoItem } from '@/lib/potenciaisItem'
import type { ItemCompra } from '@/lib/filtrosOportunidades'

function Fontes({ fontes }: { fontes: CompraPreco[] }) {
  return <details className="mt-2 text-xs">
    <summary className="cursor-pointer font-medium text-primary">Conferir {fontes.length} {fontes.length === 1 ? 'compra de referência' : 'compras de referência'}</summary>
    <ul className="mt-2 space-y-2">{fontes.map((f) => <li key={`${f.idCompra}-${f.numeroItem}`}>
      <Link className="inline-flex items-center gap-1 font-medium text-primary hover:underline" to={`/app/compras/${encodeURIComponent(f.idCompra)}`}><ExternalLink className="h-3 w-3" />{f.orgao || `Compra ${f.idCompra}`} · item {f.numeroItem ?? 'não informado'}</Link>
      <p className="text-muted-foreground">{f.data?.slice(0, 10)}{f.uf ? ` · ${f.uf}` : ''} · {f.descricao || f.detalhe || 'Descrição não informada'}</p>
    </li>)}</ul>
  </details>
}

export default function PotenciaisItem({ item, tipoEdital }: { item: ItemCompra; tipoEdital?: string }) {
  const tipo = item.materialOuServico ?? tipoEdital
  const tipoCatalogo = tipo === 'M' || tipo === 'S' ? tipo : ''
  const [termo, setTermo] = useState(() => termoDoItem(item.descricao))
  const [pesquisa, setPesquisa] = useState(termo)
  const [selecionado, setSelecionado] = useState<ItemCatalogo | null>(null)
  const [verTodos, setVerTodos] = useState(false)
  const catalogo = useQuery({ queryKey: ['catalogo', { termo: pesquisa, tipo: tipoCatalogo }], enabled: pesquisa.length >= 3, staleTime: 300_000, retry: 1, queryFn: ({ signal }) => buscarCatalogo(pesquisa, tipoCatalogo, signal) })
  const historico = useQuery({ queryKey: ['potenciais-item', selecionado?.tipo, selecionado?.codigo], enabled: !!selecionado, staleTime: 600_000, retry: 1, queryFn: ({ signal }) => historicoPrecos(selecionado!, { uf: '', de: '', ate: '' }, signal) })
  const dados = potenciaisDoHistorico(historico.data?.compras ?? [])
  const erro = !selecionado && catalogo.isError ? catalogo : selecionado && historico.isError ? historico : null

  return <section className="mt-4 rounded-xl border border-sky-500/25 bg-sky-500/5 p-4" aria-label={`Potenciais concorrentes e marcas do item ${item.numeroItem}`}>
    <h4 className="flex items-center gap-2 font-semibold"><Building2 className="h-4 w-4 text-sky-500" />Potenciais concorrentes e marcas</h4>
    <p className="mt-1 text-xs text-muted-foreground">Selecione o produto ou serviço correspondente para encontrar empresas e marcas em compras públicas semelhantes. O histórico indica possibilidades; confira as especificações do edital para confirmar a aderência. A participação nesta oportunidade não está confirmada.</p>
    <form className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center" onSubmit={(e) => { e.preventDefault(); setSelecionado(null); setPesquisa(termo.trim()); setVerTodos(false) }}>
      <Input aria-label={`Pesquisar produto ou serviço do item ${item.numeroItem}`} value={termo} maxLength={100} placeholder="Pesquisar produto ou serviço no catálogo" onChange={(e) => setTermo(e.target.value)} />
      <Button type="submit" variante="contorno" tamanho="sm" disabled={termo.trim().length < 3}><Search className="h-4 w-4" />Pesquisar</Button>
    </form>
    {catalogo.isFetching && <Carregando texto="Buscando produtos e serviços correspondentes…" />}
    {erro && <p role="alert" className="mt-3 text-sm">{(erro.error as Error).message} <button type="button" className="font-semibold text-primary underline" onClick={() => erro.refetch()}>Tentar novamente</button></p>}
    {!selecionado && catalogo.isSuccess && <div className="mt-3 space-y-2">
      {!catalogo.data.data.length && <p className="text-sm text-muted-foreground">Nenhum produto ou serviço encontrado. Tente um nome mais curto ou outro termo.</p>}
      {(verTodos ? catalogo.data.data : catalogo.data.data.slice(0, 6)).map((c) => <button key={`${c.tipo}${c.codigo}`} type="button" onClick={() => setSelecionado(c)} className="block w-full rounded-lg border bg-card p-2 text-left text-sm hover:border-primary">
        <span className="font-semibold">{c.nome}</span><span className="block text-xs text-muted-foreground">{c.tipo === 'M' ? 'Material' : 'Serviço'} · {c.codigo} · {c.classe}</span>
      </button>)}
      {!verTodos && catalogo.data.data.length > 6 && <button type="button" className="text-sm font-semibold text-primary underline" onClick={() => setVerTodos(true)}>Ver todos os resultados ({catalogo.data.data.length})</button>}
    </div>}
    {selecionado && <p className="mt-3 text-sm"><span className="font-semibold">Referência: {selecionado.nome}</span> · {selecionado.codigo} <button type="button" className="ml-2 text-primary underline" onClick={() => setSelecionado(null)}>Trocar referência</button></p>}
    {historico.isFetching && <Carregando texto="Consultando concorrentes e marcas no histórico…" />}
    {selecionado && historico.isSuccess && <>
      <p className="mt-2 text-xs text-muted-foreground">Fonte: Compras.gov.br · {historico.data.compras.length} registros de compras analisados, em todos os estados.{historico.data.incompleto || historico.data.total > historico.data.compras.length ? ' A consulta contém uma amostra do histórico disponível.' : ''}</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div><h5 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Building2 className="h-4 w-4" />Potenciais concorrentes ({dados.empresas.length})</h5>
          {!dados.empresas.length && <p className="text-sm text-muted-foreground">Nenhuma empresa com CNPJ informado encontrada nas compras consultadas.</p>}
          <ul className="max-h-96 space-y-2 overflow-y-auto">{dados.empresas.map((e) => <li key={e.cnpj} className="rounded-lg border bg-card p-3 text-sm">
            <Link to={`/app/analise-empresas/${e.cnpj}`} className="font-semibold text-primary hover:underline">{e.nome}</Link>
            <p className="text-xs text-muted-foreground">CNPJ {formatarCnpj(e.cnpj)}</p>
            {!!e.marcas.size && <p className="mt-1 text-xs">Marcas: {[...e.marcas].join(', ')}</p>}
            <Fontes fontes={e.fontes} />
          </li>)}</ul>
        </div>
        <div><h5 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Tag className="h-4 w-4" />Possíveis marcas ({dados.marcas.length})</h5>
          {!dados.marcas.length && <p className="text-sm text-muted-foreground">{selecionado.tipo === 'S' ? 'O histórico deste serviço não informa marcas.' : 'Nenhuma marca identificada nas compras consultadas.'}</p>}
          <ul className="max-h-96 space-y-2 overflow-y-auto">{dados.marcas.map((m) => <li key={m.nome} className="rounded-lg border bg-card p-3 text-sm">
            <span className="font-semibold">{m.nome}</span>
            <a className="ml-2 inline-flex items-center gap-1 text-xs text-primary hover:underline" href={linkPesquisaMarca(m.nome, item.descricao)} target="_blank" rel="noopener noreferrer">Pesquisar produto<ExternalLink className="h-3 w-3" /></a>
            <Fontes fontes={m.fontes} />
          </li>)}</ul>
        </div>
      </div>
    </>}
  </section>
}
