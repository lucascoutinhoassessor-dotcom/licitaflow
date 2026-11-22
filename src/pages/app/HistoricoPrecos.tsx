import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CalendarRange, MapPin, Package, Search, Tag, Wrench } from 'lucide-react'
import MenuFiltros, { ChipFiltro, SecaoFiltro } from '@/components/MenuFiltros'
import BotaoInverterOrdem from '@/components/BotaoInverterOrdem'
import { Badge, Button, CabecalhoPagina, Card, Carregando, Input, Select, Vazio } from '@/components/ui'
import { buscarCatalogo, historicoPrecos, type ItemCatalogo } from '@/lib/precos'
import { formatarData, formatarMoeda } from '@/lib/format'
import { normalizar } from '@/lib/portais'
import CartaoCompraPreco from '@/components/CartaoCompraPreco'
import { cn } from '@/lib/utils'

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')
const iso = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
/** Data de N anos atrás (o Painel de Preços é consultado em até 6 anos). */
const anosAtras = (n: number) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); return iso(d) }
const limiteAntigo = anosAtras(6)

export default function HistoricoPrecos() {
  const [termo, setTermo] = useState(''), [tipo, setTipo] = useState<'' | 'M' | 'S'>('')
  const [pesquisa, setPesquisa] = useState<{ termo: string; tipo: '' | 'M' | 'S' } | null>(null)
  const [item, setItem] = useState<ItemCatalogo | null>(null)
  const umAno = new Date(); umAno.setFullYear(umAno.getFullYear() - 1)
  const [filtros, setFiltros] = useState({ uf: '', de: iso(umAno), ate: iso(new Date()) })
  const [refino, setRefino] = useState(''), [antigasPrimeiro, setAntigasPrimeiro] = useState(false)
  const catalogo = useQuery({ queryKey: ['catalogo', pesquisa], enabled: !!pesquisa, staleTime: 300_000, retry: 1, queryFn: ({ signal }) => buscarCatalogo(pesquisa!.termo, pesquisa!.tipo, signal) })
  const precos = useQuery({ queryKey: ['precos', item?.tipo, item?.codigo, filtros], enabled: !!item, staleTime: 300_000, retry: 1, queryFn: ({ signal }) => historicoPrecos(item!, filtros, signal) })

  function pesquisar(e: FormEvent) {
    e.preventDefault()
    if (!termo.trim()) return
    setItem(null); setRefino('')
    setPesquisa({ termo: termo.trim(), tipo })
  }
  const filtradas = (precos.data?.compras ?? []).filter((c) => !refino.trim() || normalizar(`${c.descricao} ${c.marca ?? ''} ${c.fornecedor ?? ''}`).includes(normalizar(refino.trim())))
  // A fonte entrega das mais recentes para as mais antigas; o botão inverte.
  const compras = antigasPrimeiro ? [...filtradas].reverse() : filtradas

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
          <Card className="mb-5 flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Período rápido">
              {[[1, '1 ano'], [2, '2 anos'], [6, '6 anos']].map(([anos, rotulo]) => {
                const de = anosAtras(anos as number)
                const ativo = filtros.de === de && filtros.ate === iso(new Date())
                return <button key={rotulo} type="button" aria-pressed={ativo} onClick={() => setFiltros((f) => ({ ...f, de, ate: iso(new Date()) }))}
                  className={cn('h-9 rounded-full border px-4 text-sm font-semibold', ativo ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}>{rotulo}</button>
              })}
            </div>
            <span className="text-xs text-muted-foreground">Atualiza ao mudar.</span>
            <MenuFiltros className="sm:ml-auto" colunas={2} ativos={filtros.uf ? 1 : 0} aoLimpar={() => setFiltros((f) => ({ ...f, uf: '' }))}>
              <SecaoFiltro icone={MapPin} cor="azul" titulo="Estado do órgão" descricao={filtros.uf ? `Só ${filtros.uf}` : 'Brasil inteiro'}>
                <div className="grid grid-cols-6 gap-1.5"><ChipFiltro ativo={!filtros.uf} onClick={() => setFiltros((f) => ({ ...f, uf: '' }))} className="col-span-2 rounded-md">Todos</ChipFiltro>
                  {UFS.map((u) => <ChipFiltro key={u} ativo={filtros.uf === u} onClick={() => setFiltros((f) => ({ ...f, uf: f.uf === u ? '' : u }))} className="rounded-md px-1">{u}</ChipFiltro>)}</div>
              </SecaoFiltro>
              <SecaoFiltro icone={CalendarRange} cor="verde" titulo="Período personalizado" descricao="Compras dos últimos 6 anos">
                <div className="grid grid-cols-2 gap-2 px-1">
                  <label className="text-xs"><span className="mb-1 block font-medium">Compras de</span><Input type="date" value={filtros.de} min={limiteAntigo} max={filtros.ate} onChange={(e) => setFiltros((f) => ({ ...f, de: e.target.value < limiteAntigo ? limiteAntigo : e.target.value }))} /></label>
                  <label className="text-xs"><span className="mb-1 block font-medium">Até</span><Input type="date" value={filtros.ate} min={filtros.de} onChange={(e) => setFiltros((f) => ({ ...f, ate: e.target.value }))} /></label>
                </div>
              </SecaoFiltro>
            </MenuFiltros>
          </Card>

          {precos.isLoading ? <Carregando texto="Consultando os preços…" /> : precos.isError ? <Card className="p-4 text-sm">{(precos.error as Error).message} <button className="font-semibold text-primary underline" onClick={() => precos.refetch()}>Tentar novamente</button></Card> : precos.data && <>
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
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <BotaoInverterOrdem invertido={antigasPrimeiro} aoMudar={setAntigasPrimeiro} normal="Mais recentes primeiro" inverso="Mais antigas primeiro" />
                    <Input className="sm:w-72" placeholder="Filtrar por descrição, marca ou fornecedor" value={refino} onChange={(e) => setRefino(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-3">{compras.map((c, i) => <CartaoCompraPreco key={`${c.idCompra}-${c.numeroItem}-${i}`} compra={c} />)}</div>
                <p className="mt-3 text-xs text-muted-foreground">Dados oficiais de compras públicas, consultados na hora.{precos.data.incompleto ? ' Muitas compras no período: a análise considera as 2.000 mais recentes.' : ''}</p>
              </Card>
            </>}
          </>}
        </>}
      </>}
  </>
}
