import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Package, Search, Tag, Wrench } from 'lucide-react'
import { Badge, Button, CabecalhoPagina, Card, Carregando, Input, Select, Vazio } from '@/components/ui'
import { buscarCatalogo, historicoPrecos, type ItemCatalogo } from '@/lib/precos'
import { formatarData, formatarMoeda } from '@/lib/format'
import { normalizar } from '@/lib/portais'
import { cn } from '@/lib/utils'

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')
const iso = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

export default function HistoricoPrecos() {
  const [termo, setTermo] = useState(''), [tipo, setTipo] = useState<'' | 'M' | 'S'>('')
  const [pesquisa, setPesquisa] = useState<{ termo: string; tipo: '' | 'M' | 'S' } | null>(null)
  const [item, setItem] = useState<ItemCatalogo | null>(null)
  const umAno = new Date(); umAno.setFullYear(umAno.getFullYear() - 1)
  const [filtros, setFiltros] = useState({ uf: '', de: iso(umAno), ate: iso(new Date()) })
  const [refino, setRefino] = useState('')
  const catalogo = useQuery({ queryKey: ['catalogo', pesquisa], enabled: !!pesquisa, staleTime: 300_000, retry: 1, queryFn: ({ signal }) => buscarCatalogo(pesquisa!.termo, pesquisa!.tipo, signal) })
  const precos = useQuery({ queryKey: ['precos', item?.tipo, item?.codigo, filtros], enabled: !!item, staleTime: 300_000, retry: 1, queryFn: ({ signal }) => historicoPrecos(item!, filtros, signal) })

  function pesquisar(e: FormEvent) {
    e.preventDefault()
    if (!termo.trim()) return
    setItem(null); setRefino('')
    setPesquisa({ termo: termo.trim(), tipo })
  }
  const compras = (precos.data?.compras ?? []).filter((c) => !refino.trim() || normalizar(`${c.descricao} ${c.marca ?? ''} ${c.fornecedor ?? ''}`).includes(normalizar(refino.trim())))

  return <>
    <CabecalhoPagina titulo="Histórico de preços" descricao="Quanto o governo pagou por um produto ou serviço: preços homologados, marcas, fornecedores e órgãos." />
    <Card className="mb-5 p-4">
      <form onSubmit={pesquisar} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" aria-label="Produto ou serviço" placeholder="Ex.: papel A4, notebook, limpeza predial" value={termo} onChange={(e) => setTermo(e.target.value)} maxLength={120} /></div>
        <Select aria-label="Tipo" className="sm:w-44" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}><option value="">Materiais e serviços</option><option value="M">Materiais</option><option value="S">Serviços</option></Select>
        <Button type="submit" carregando={catalogo.isFetching}>Pesquisar</Button>
      </form>
    </Card>

    {!pesquisa ? <Vazio icone={Tag} titulo="Pesquise um produto ou serviço" texto="Escolha o item do catálogo do governo e veja os preços pagos nas compras públicas, com marca, fornecedor e órgão." />
      : catalogo.isLoading ? <Carregando texto="Pesquisando no catálogo…" />
      : catalogo.isError ? <Card className="p-4 text-sm">{(catalogo.error as Error).message}</Card>
      : <>
        <p className="mb-2 text-sm font-medium">{item ? 'Item escolhido' : 'Escolha o item do catálogo'}</p>
        {catalogo.data?.data.length === 0 && <Vazio titulo="Nada encontrado no catálogo" texto={catalogo.data.catalogo.itens < 1000 ? 'O catálogo do governo ainda está sendo carregado. Tente de novo em alguns minutos.' : 'Tente outra palavra (ex.: "papel" em vez de "folha").'} />}
        <div className="mb-5 flex flex-wrap gap-2">
          {(item ? [item] : catalogo.data?.data ?? []).map((c) => (
            <button key={`${c.tipo}${c.codigo}`} type="button" onClick={() => setItem(item ? null : c)}
              className={cn('flex max-w-full items-center gap-2 rounded-2xl border px-3.5 py-2 text-left text-sm transition', item ? 'border-primary bg-primary/10' : 'bg-card hover:border-primary/60')}>
              {c.tipo === 'M' ? <Package className="h-4 w-4 shrink-0 text-emerald-500" /> : <Wrench className="h-4 w-4 shrink-0 text-sky-500" />}
              <span className="min-w-0"><span className="block truncate font-semibold">{c.nome}</span><span className="block truncate text-xs text-muted-foreground">{c.tipo === 'M' ? 'Material' : 'Serviço'} · {c.classe || 'sem classe'} · cód. {c.codigo}</span></span>
              {item && <span className="ml-2 text-xs text-primary">trocar</span>}
            </button>
          ))}
        </div>

        {item && <>
          <Card className="mb-5 grid gap-3 p-4 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-end">
            <label className="text-sm"><span className="mb-1 block font-medium">UF do órgão</span><Select value={filtros.uf} onChange={(e) => setFiltros((f) => ({ ...f, uf: e.target.value }))}><option value="">Brasil inteiro</option>{UFS.map((u) => <option key={u}>{u}</option>)}</Select></label>
            <label className="text-sm"><span className="mb-1 block font-medium">Compras de</span><Input type="date" value={filtros.de} max={filtros.ate} onChange={(e) => setFiltros((f) => ({ ...f, de: e.target.value }))} /></label>
            <label className="text-sm"><span className="mb-1 block font-medium">Até</span><Input type="date" value={filtros.ate} min={filtros.de} onChange={(e) => setFiltros((f) => ({ ...f, ate: e.target.value }))} /></label>
            <span className="text-xs text-muted-foreground">Atualiza ao mudar.</span>
          </Card>

          {precos.isLoading ? <Carregando texto="Consultando o Painel de Preços…" /> : precos.isError ? <Card className="p-4 text-sm">{(precos.error as Error).message} <button className="font-semibold text-primary underline" onClick={() => precos.refetch()}>Tentar novamente</button></Card> : precos.data && <>
            {precos.data.total === 0 ? <Vazio titulo="Nenhuma compra no período" texto="Amplie o período ou tire o filtro de UF." /> : <>
              <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {precos.data.unidades.slice(0, 3).map((u) => (
                  <Card key={u.unidade} className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Por {u.unidade} · {u.n} {u.n === 1 ? 'compra' : 'compras'}</p>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatarMoeda(u.mediana)}</p>
                    <p className="text-xs text-muted-foreground">preço mediano (o do meio, que não se distorce com valores fora da curva)</p>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                      <div><dt className="text-xs text-muted-foreground">Mínimo</dt><dd className="font-semibold tabular-nums">{formatarMoeda(u.minimo)}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Média</dt><dd className="font-semibold tabular-nums">{formatarMoeda(u.media)}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Máximo</dt><dd className="font-semibold tabular-nums">{formatarMoeda(u.maximo)}</dd></div>
                    </dl>
                  </Card>
                ))}
              </div>
              {precos.data.marcas.length > 0 && <div className="mb-5"><p className="mb-2 text-sm font-medium">Marcas mais vendidas</p><div className="flex flex-wrap gap-2">{precos.data.marcas.map((m) => <Badge key={m.marca} cor="azul">{m.marca} · {m.n}</Badge>)}</div></div>}
              <Card className="p-4 sm:p-5">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="font-semibold">Compras ({compras.length}{precos.data.compras.length < precos.data.total ? ` das ${precos.data.compras.length} mais recentes` : ''})</h2>
                  <Input className="sm:w-72" placeholder="Filtrar por descrição, marca ou fornecedor" value={refino} onChange={(e) => setRefino(e.target.value)} />
                </div>
                <ul className="divide-y">
                  {compras.map((c, i) => (
                    <li key={`${c.idCompra}-${i}`} className="grid gap-1 py-3 text-sm sm:grid-cols-[1fr_auto] sm:gap-4">
                      <div className="min-w-0">
                        <p className="line-clamp-2 break-words font-medium">{/^\d{15,20}$/.test(c.idCompra) ? <Link className="text-sky-700 hover:underline dark:text-sky-300" to={`/app/compras/${c.idCompra}`}>{c.descricao || 'Sem descrição'}</Link> : (c.descricao || 'Sem descrição')}</p>
                        <p className="text-xs text-muted-foreground">{formatarData(c.data)} · {c.orgao ?? 'Órgão não informado'}{c.municipio ? ` · ${c.municipio}` : ''}{c.uf ? `/${c.uf}` : ''}</p>
                        <p className="text-xs text-muted-foreground">{c.fornecedor ? <>Vencedor: {c.cnpj && /^\d{14}$/.test(c.cnpj) ? <Link className="text-sky-700 hover:underline dark:text-sky-300" to={`/app/analise-empresas/${c.cnpj}`}>{c.fornecedor}</Link> : c.fornecedor}</> : 'Vencedor não informado'}{c.marca ? ` · Marca: ${c.marca}` : ''}</p>
                      </div>
                      <div className="text-left sm:text-right"><p className="text-base font-bold tabular-nums">{formatarMoeda(c.preco)}</p><p className="text-xs text-muted-foreground">por {c.unidade}{c.quantidade ? ` · qtd. ${c.quantidade.toLocaleString('pt-BR')}` : ''}</p>{/^\d{15,20}$/.test(c.idCompra) && <Link to={`/app/compras/${c.idCompra}`} className="mt-1 inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold hover:bg-muted">Ver compra, empresas e marcas</Link>}</div>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">Fonte: Painel de Preços do governo federal (dados abertos do Compras.gov.br), consultado na hora.{precos.data.incompleto ? ' Muitas compras no período: a análise considera as 2.000 mais recentes.' : ''}</p>
              </Card>
            </>}
          </>}
        </>}
      </>}
  </>
}
