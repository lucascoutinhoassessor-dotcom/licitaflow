import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowRight, ArrowUp, BarChart3, BookOpen, Building2, CalendarRange, Check, Gavel, ExternalLink, FileSearch, Landmark, MapPin, Package, Search, Table2, Tag, Wrench, X } from 'lucide-react'
import CartaoCompraPreco from '@/components/CartaoCompraPreco'
import MenuFiltros, { ChipFiltro, SecaoFiltro } from '@/components/MenuFiltros'
import { Button, CabecalhoPagina, Card, Carregando, Input, Modal, Select, Vazio } from '@/components/ui'
import { buscarCatalogo, linkPesquisaMarca, type ItemCatalogo } from '@/lib/precos'
import { analisarMercado, ESFERA_NOME, MODALIDADE_NOME, PODER_NOME, UF_NOME, type AnaliseMercado } from '@/lib/mercado'
import { ESTADOS_MAPA, MAPA_ALTURA, MAPA_LARGURA } from '@/lib/mapaBrasil'
import { formatarCnpj, formatarMoeda } from '@/lib/format'
import { normalizar } from '@/lib/portais'
import { cn } from '@/lib/utils'

const UFS = Object.keys(UF_NOME).sort()
const iso = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const mesesAtras = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() - n); return iso(d) }
const compacto = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })
const moedaCurta = (v: number) => (v >= 100_000 ? compacto.format(v) : formatarMoeda(v))
const numero = (n: number) => n.toLocaleString('pt-BR')
const PADRAO_CODIGOS = 4, MAX_CODIGOS = 6
const EXEMPLOS = ['papel A4', 'notebook', 'luva de procedimento', 'limpeza predial', 'gás de cozinha', 'pneu']
const CORES = ['#10b981', '#0ea5e9', '#f59e0b', '#8b5cf6', '#f43f5e', '#64748b']
const PERIODOS: [number, string][] = [[6, '6 meses'], [12, '1 ano'], [24, '2 anos'], [36, '3 anos']]

type Angulo = 'itens' | 'catalogo' | 'estados' | 'orgaos' | 'empresas' | 'marcas'

export default function AnaliseMercado() {
  const [sp, setSp] = useSearchParams()
  const q = sp.get('q') ?? '', tipo = (sp.get('tipo') ?? '') as '' | 'M' | 'S'
  const hoje = iso(new Date())
  const de = sp.get('de') ?? mesesAtras(12), ate = sp.get('ate') ?? hoje
  const uf = sp.get('uf') ?? '', esfera = sp.get('esfera') ?? '', poder = sp.get('poder') ?? '', modalidade = sp.get('mod') ?? ''
  const [termo, setTermo] = useState(q), [tipoRascunho, setTipoRascunho] = useState(tipo)
  const [angulo, setAngulo] = useState<Angulo | null>(null)

  function mudar(m: Record<string, string | null>) {
    const n = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(m)) if (v) n.set(k, v); else n.delete(k)
    setSp(n)
  }
  function pesquisar(e: FormEvent) {
    e.preventDefault()
    if (termo.trim()) mudar({ q: termo.trim(), tipo: tipoRascunho || null, cod: null })
  }

  const catalogo = useQuery({ queryKey: ['catalogo', { termo: q, tipo }], enabled: !!q, staleTime: 300_000, retry: 1, queryFn: ({ signal }) => buscarCatalogo(q, tipo, signal) })
  // O catálogo devolve parecidos (ex.: "pneu" traz "LONA PNEU" antes de "PNEU BICICLETA"):
  // sobem os itens cujo nome é o termo ou começa por ele, e só esses entram na análise por padrão.
  const termoN = normalizar(q.trim()).replace(/\s+/g, ' '), primeira = termoN.split(' ')[0]
  const nivel = (c: ItemCatalogo) => { if (c.sinonimo) return 4; const n = normalizar(c.nome).replace(/\s+/g, ' '); return n === termoN ? 3 : n.startsWith(termoN) ? 2 : primeira && n.startsWith(primeira) ? 1 : 0 }
  const opcoes = useMemo(() => (catalogo.data?.data ?? []).map((c, i) => ({ c, i, n: nivel(c) })).sort((a, b) => b.n - a.n || a.i - b.i).map((x) => x.c), [catalogo.data, termoN]) // eslint-disable-line react-hooks/exhaustive-deps
  const melhorNivel = opcoes.length ? nivel(opcoes[0]) : 0
  const padrao = melhorNivel > 0 ? opcoes.filter((c) => nivel(c) === melhorNivel).slice(0, PADRAO_CODIGOS) : opcoes.slice(0, 1)
  const [todasOpcoes, setTodasOpcoes] = useState(false)
  const chave = (c: Pick<ItemCatalogo, 'tipo' | 'codigo'>) => `${c.tipo}${c.codigo}`
  const nomes = useMemo(() => Object.fromEntries(opcoes.map((c) => [chave(c), c])), [opcoes])
  const codigosUrl = (sp.get('cod') ?? '').split(',').filter((c) => /^[MS]\d+$/.test(c)).slice(0, MAX_CODIGOS)
  const selecionados = codigosUrl.length ? codigosUrl : padrao.map(chave)
  // Na lista ficam os escolhidos e, recolhida, as 6 primeiras opções.
  const visiveis = todasOpcoes ? opcoes : opcoes.filter((c, i) => i < 6 || selecionados.includes(chave(c)))
  function alternar(c: string) {
    const novo = selecionados.includes(c) ? selecionados.filter((x) => x !== c) : [...selecionados, c]
    if (novo.length && novo.length <= MAX_CODIGOS) mudar({ cod: novo.join(',') })
  }

  const filtros = { codigos: selecionados, de, ate, uf, esfera, poder, modalidade }
  const mercado = useQuery({ queryKey: ['mercado', filtros], enabled: selecionados.length > 0, staleTime: 300_000, retry: 1, queryFn: ({ signal }) => analisarMercado(filtros, signal) })
  const a = mercado.data
  const filtrosAtivos = [uf && `Estado: ${UF_NOME[uf]}`, esfera && `Esfera: ${ESFERA_NOME[esfera]}`, poder && `Poder: ${PODER_NOME[poder]}`, modalidade && `Modalidade: ${MODALIDADE_NOME[Number(modalidade)] ?? modalidade}`].filter(Boolean) as string[]

  return <>
    <CabecalhoPagina titulo="Análise de mercado" descricao="Quanto o governo compra de um produto ou serviço, onde, de quem e de quais marcas, a partir das compras homologadas." />

    <Card className="mb-4 p-4">
      <form onSubmit={pesquisar} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" aria-label="Produto ou serviço" placeholder="O que você vende? Ex.: papel A4, notebook, limpeza predial" value={termo} onChange={(e) => setTermo(e.target.value)} maxLength={120} /></div>
        <div className="flex gap-2">
          <Select aria-label="Tipo" className="min-w-0 flex-1 sm:w-44 sm:flex-none" value={tipoRascunho} onChange={(e) => setTipoRascunho(e.target.value as typeof tipo)}><option value="">Materiais e serviços</option><option value="M">Materiais</option><option value="S">Serviços</option></Select>
          <Button type="submit" carregando={catalogo.isFetching}>Analisar</Button>
        </div>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Período">
          {PERIODOS.map(([meses, rotulo]) => {
            const ativo = de === mesesAtras(meses) && ate === hoje
            return <button key={rotulo} type="button" aria-pressed={ativo} onClick={() => mudar({ de: mesesAtras(meses), ate: hoje })}
              className={cn('h-8 rounded-full border px-3 text-xs font-semibold sm:text-sm', ativo ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}>{rotulo}</button>
          })}
        </div>
        <MenuFiltros className="ml-auto" colunas={2} ativos={filtrosAtivos.length} aoLimpar={() => mudar({ uf: null, esfera: null, poder: null, mod: null })}>
          <SecaoFiltro icone={CalendarRange} cor="verde" titulo="Período personalizado" descricao="Até 3 anos; a análise atualiza ao mudar">
            <div className="grid grid-cols-2 gap-2 px-1">
              <label className="text-xs"><span className="mb-1 block font-medium">De</span><Input type="date" value={de} max={ate} onChange={(e) => e.target.value && mudar({ de: e.target.value })} /></label>
              <label className="text-xs"><span className="mb-1 block font-medium">Até</span><Input type="date" value={ate} min={de} max={hoje} onChange={(e) => e.target.value && mudar({ ate: e.target.value })} /></label>
            </div>
          </SecaoFiltro>
          <SecaoFiltro icone={MapPin} cor="azul" titulo="Estado do órgão" descricao={uf ? UF_NOME[uf] : 'Todos os estados'}>
            <div className="grid grid-cols-6 gap-1.5"><ChipFiltro ativo={!uf} onClick={() => mudar({ uf: null })} className="col-span-2 rounded-md">Todos</ChipFiltro>
              {UFS.map((u) => <ChipFiltro key={u} title={UF_NOME[u]} ativo={uf === u} onClick={() => mudar({ uf: uf === u ? null : u })} className="rounded-md px-1">{u}</ChipFiltro>)}</div>
          </SecaoFiltro>
          <SecaoFiltro icone={Landmark} cor="violeta" titulo="Esfera e poder" descricao="Quem fez a compra">
            <div className="grid grid-cols-3 gap-1.5">{Object.entries(ESFERA_NOME).map(([k, v]) => <ChipFiltro key={k} ativo={esfera === k} onClick={() => mudar({ esfera: esfera === k ? null : k })} className="rounded-md">{v}</ChipFiltro>)}</div>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">{Object.entries(PODER_NOME).map(([k, v]) => <ChipFiltro key={k} ativo={poder === k} onClick={() => mudar({ poder: poder === k ? null : k })} className="rounded-md">{v}</ChipFiltro>)}</div>
          </SecaoFiltro>
          <SecaoFiltro icone={Gavel} cor="ambar" titulo="Modalidade" descricao={modalidade ? MODALIDADE_NOME[Number(modalidade)] : 'Todas'}>
            <div className="grid grid-cols-2 gap-1.5">{[5, 6, 7, 20, 3].map((k) => <ChipFiltro key={k} ativo={modalidade === String(k)} onClick={() => mudar({ mod: modalidade === String(k) ? null : String(k) })} className="rounded-md">{MODALIDADE_NOME[k]}</ChipFiltro>)}</div>
          </SecaoFiltro>
        </MenuFiltros>
      </div>

      {filtrosAtivos.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold uppercase tracking-wide text-muted-foreground">Filtros aplicados</span>
        {filtrosAtivos.map((f) => <span key={f} className="rounded-full bg-muted px-2.5 py-1 font-medium">{f}</span>)}
        <button type="button" className="font-semibold text-rose-500 hover:underline" onClick={() => mudar({ uf: null, esfera: null, poder: null, mod: null })}>Limpar filtros</button>
      </div>}
    </Card>

    {!q ? <Card className="p-6 text-center sm:p-10">
      <BarChart3 className="mx-auto h-10 w-10 text-emerald-500" />
      <h2 className="mt-3 text-lg font-semibold">Pesquise um produto ou serviço</h2>
      <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">Veja o valor contratado pelo governo, os estados e os meses que mais compram, os principais órgãos, as empresas que mais vencem e as marcas mais vendidas.</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">{EXEMPLOS.map((x) => <button key={x} type="button" onClick={() => { setTermo(x); mudar({ q: x, cod: null }) }} className="rounded-full border bg-card px-3 py-1.5 text-sm hover:border-primary/60">{x}</button>)}</div>
    </Card>
      : catalogo.isLoading ? <Carregando texto="Pesquisando no catálogo do governo…" />
      : catalogo.isError ? <Card className="p-4 text-sm">{(catalogo.error as Error).message}</Card>
      : opcoes.length === 0 ? <Vazio titulo="Nada encontrado no catálogo" texto={(catalogo.data?.catalogo.itens ?? 0) < 1000 ? 'O catálogo do governo ainda está sendo carregado. Tente de novo em alguns minutos.' : 'Tente outra palavra (ex.: "papel" em vez de "folha").'} />
      : <>
        <div className="mb-4">
          <p className="mb-2 text-sm font-medium">Itens do catálogo na análise <span className="font-normal text-muted-foreground">({selecionados.length} de até {MAX_CODIGOS}; toque para incluir ou tirar)</span></p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
            {visiveis.map((c) => {
              const ativo = selecionados.includes(chave(c))
              return <button key={chave(c)} type="button" aria-pressed={ativo} onClick={() => alternar(chave(c))}
                className={cn('flex max-w-[16rem] shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-left text-sm transition sm:max-w-xs', ativo ? 'border-primary bg-primary/10' : 'bg-card text-muted-foreground hover:border-primary/60')}>
                {ativo ? <Check className="h-4 w-4 shrink-0 text-primary" /> : c.tipo === 'M' ? <Package className="h-4 w-4 shrink-0" /> : <Wrench className="h-4 w-4 shrink-0" />}
                <span className="min-w-0"><span className="block truncate font-semibold">{c.nome}</span><span className="block truncate text-xs text-muted-foreground">{c.tipo === 'M' ? 'Material' : 'Serviço'} · cód. {c.codigo}</span></span>
              </button>
            })}
            {opcoes.length > visiveis.length && <button type="button" onClick={() => setTodasOpcoes(true)} className="shrink-0 rounded-2xl border border-dashed px-3 py-2 text-sm font-semibold text-primary">Ver mais {opcoes.length - visiveis.length}</button>}
            {todasOpcoes && opcoes.length > 6 && <button type="button" onClick={() => setTodasOpcoes(false)} className="shrink-0 rounded-2xl px-3 py-2 text-sm font-semibold text-muted-foreground">Ver menos</button>}
          </div>
          {melhorNivel === 0 && !codigosUrl.length && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Nenhum item do catálogo tem exatamente esse nome. Confira se o item escolhido é o que você procura ou tente uma palavra mais simples (ex.: "papel" em vez de "folha A4").</p>}
        </div>

        {mercado.isLoading ? <Esqueleto /> : mercado.isError ? <Card className="p-4 text-sm">{(mercado.error as Error).message} <button className="font-semibold text-primary underline" onClick={() => mercado.refetch()}>Tentar novamente</button></Card>
          : a && (a.itens === 0 ? <Vazio titulo="Nenhuma compra homologada no período" texto="Amplie o período, tire filtros ou inclua outros itens do catálogo." />
            : <Resultado a={a} nomes={nomes} uf={uf} atualizando={mercado.isFetching} aoFiltrarUf={(u) => mudar({ uf: u })} aoAbrir={setAngulo} />)}

        {a && angulo && <PainelAngulo angulo={angulo} a={a} nomes={nomes} aoFechar={() => setAngulo(null)}
          aoFiltrarUf={(u) => { setAngulo(null); mudar({ uf: u }) }} aoSoCodigo={(c) => { setAngulo(null); mudar({ cod: c }) }} />}
      </>}
  </>
}

function Esqueleto() {
  return <div aria-busy="true" aria-label="Consultando as compras">
    <p className="mb-3 text-sm text-muted-foreground">Consultando as compras… pode levar alguns segundos.</p>
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="h-72 animate-pulse rounded-2xl bg-muted lg:col-span-3" /><div className="h-72 animate-pulse rounded-2xl bg-muted lg:col-span-2" />
    </div>
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted" />)}</div>
  </div>
}

function Resultado({ a, nomes, uf, atualizando, aoFiltrarUf, aoAbrir }: { a: AnaliseMercado; nomes: Record<string, ItemCatalogo>; uf: string; atualizando: boolean; aoFiltrarUf: (u: string) => void; aoAbrir: (x: Angulo) => void }) {
  const angulos: { id: Angulo; titulo: string; valor: number; legenda: string; icone: typeof Tag; cor: string }[] = [
    { id: 'itens', titulo: 'Correspondências', valor: a.itens, legenda: 'itens homologados', icone: FileSearch, cor: 'text-sky-500' },
    { id: 'catalogo', titulo: 'Catálogo', valor: a.catalogo.length, legenda: 'itens do catálogo', icone: BookOpen, cor: 'text-sky-500' },
    { id: 'estados', titulo: 'Estados', valor: a.porUf.length, legenda: 'estados com compras', icone: MapPin, cor: 'text-emerald-500' },
    { id: 'orgaos', titulo: 'Órgãos', valor: a.totalOrgaos, legenda: 'órgãos compradores', icone: Landmark, cor: 'text-emerald-500' },
    { id: 'empresas', titulo: 'Empresas', valor: a.totalEmpresas, legenda: 'empresas vencedoras', icone: Building2, cor: 'text-amber-500' },
    { id: 'marcas', titulo: 'Marcas', valor: a.totalMarcas, legenda: 'marcas vendidas', icone: Tag, cor: 'text-amber-500' },
  ]
  return <div className={cn('transition-opacity', atualizando && 'opacity-60')}>
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="p-4 sm:p-5 lg:col-span-3">
        <h2 className="mb-1 flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4 text-emerald-500" />Valor contratado por estado</h2>
        <p className="mb-3 text-xs text-muted-foreground">Toque em um estado para ver os detalhes.</p>
        <MapaEstados porUf={a.porUf} ufFiltrada={uf} aoFiltrar={aoFiltrarUf} />
      </Card>
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Card className="border-emerald-500/40 bg-emerald-500/5 p-5 text-center">
          <p className="break-words text-3xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 sm:text-4xl">{formatarMoeda(a.valorTotal)}</p>
          <p className="mt-1 font-semibold">Valor total contratado</p>
          <p className="mt-1 text-xs text-muted-foreground">{numero(a.itens)} itens homologados em {numero(a.compras)} compras</p>
        </Card>
        <Card className="flex-1 p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><BarChart3 className="h-4 w-4 text-violet-500" />Valor por mês</h2>
          <BarrasMes porMes={a.porMes} ate={a.ate} />
        </Card>
      </div>
    </div>

    <div className="my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"><span className="h-px flex-1 bg-border" />Ângulos de análise<span className="h-px flex-1 bg-border" /></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {angulos.map((g) => <button key={g.id} type="button" onClick={() => aoAbrir(g.id)} className="lf-cartao group rounded-2xl border bg-card p-4 text-center transition hover:border-primary/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        <g.icone className={cn('mx-auto h-5 w-5', g.cor)} />
        <p className="mt-2 text-sm font-semibold">{g.titulo}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{numero(g.valor)}</p>
        <p className="text-xs text-muted-foreground">{g.legenda}</p>
        <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary group-hover:underline">Analisar <ArrowRight className="h-3.5 w-3.5" /></p>
      </button>)}
    </div>

    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <Card className="p-4 sm:p-5">
        <h2 className="mb-3 font-semibold">Preço praticado</h2>
        <ul className="space-y-3">{a.unidades.slice(0, 3).map((u) => <li key={u.unidade}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Por {u.unidade} · {numero(u.n)} {u.n === 1 ? 'compra' : 'compras'}</p>
          <p className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatarMoeda(u.mediana)} <span className="text-xs font-normal text-muted-foreground">mediana</span></p>
          <p className="text-xs text-muted-foreground">mín. {formatarMoeda(u.minimo)} · máx. {formatarMoeda(u.maximo)}</p>
        </li>)}</ul>
        <p className="mt-3 text-xs text-muted-foreground">Itens diferentes juntos podem variar muito; escolha um só item do catálogo para comparar preços.</p>
      </Card>
      <Rosca titulo="Valores por esfera" partes={a.esferas.map((x) => ({ rotulo: ESFERA_NOME[x.id] ?? x.id, valor: x.valor }))} />
      <Rosca titulo="Valores por poder" partes={a.poderes.map((x) => ({ rotulo: PODER_NOME[x.id] ?? x.id, valor: x.valor }))} />
      <Rosca titulo="Valores por modalidade" partes={a.modalidades.map((x) => ({ rotulo: MODALIDADE_NOME[x.id] ?? `Modalidade ${x.id}`, valor: x.valor }))} />
    </div>

    <p className="mt-5 text-xs text-muted-foreground">
      Compras homologadas, com o vencedor de cada item.
      {a.incompleto ? ` Há muitas compras no período: a análise considera até ${numero(a.limitePorItem ?? 1000)} compras por item do catálogo, então os totais reais são maiores. Reduza o período ou escolha menos itens para ver mais.` : ''}
      {a.descartadas ? ` ${numero(a.descartadas)} ${a.descartadas === 1 ? 'compra com preço fora do padrão foi descartada' : 'compras com preço fora do padrão foram descartadas'} (mais de 50 vezes acima ou abaixo da mediana, quase sempre erro de digitação).` : ''}
      {' '}Itens do catálogo: {a.catalogo.map((c) => nomes[c.codigo]?.nome ?? c.codigo).join(', ')}.
    </p>
  </div>
}

function MapaEstados({ porUf, ufFiltrada, aoFiltrar }: { porUf: AnaliseMercado['porUf']; ufFiltrada: string; aoFiltrar: (u: string) => void }) {
  const [destaque, setDestaque] = useState<string | null>(null)
  const dados = Object.fromEntries(porUf.map((u) => [u.uf, u]))
  const max = Math.max(1, ...porUf.map((u) => u.valor))
  const total = porUf.reduce((s, u) => s + u.valor, 0) || 1
  const atual = destaque ? dados[destaque] : null
  return <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem] lg:grid-cols-[minmax(0,1fr)_13rem]">
    <svg viewBox={`0 0 ${MAPA_LARGURA} ${MAPA_ALTURA}`} className="mx-auto w-full max-w-md" role="img" aria-label="Mapa do Brasil com o valor contratado por estado">
      {ESTADOS_MAPA.map((e) => {
        const d = dados[e.uf]
        const intensidade = d ? 0.18 + 0.82 * Math.sqrt(d.valor / max) : 0
        return <path key={e.uf} d={e.d} onClick={() => setDestaque(e.uf)} onMouseEnter={() => setDestaque(e.uf)}
          className={cn('cursor-pointer stroke-card transition-[fill-opacity]', d ? 'fill-emerald-500' : 'fill-muted', (destaque === e.uf || ufFiltrada === e.uf) && 'stroke-foreground')}
          style={{ fillOpacity: d ? intensidade : 1, strokeWidth: destaque === e.uf || ufFiltrada === e.uf ? 2.5 : 1 }}>
          <title>{`${UF_NOME[e.uf]}: ${d ? `${formatarMoeda(d.valor)} em ${numero(d.itens)} itens` : 'sem compras'}`}</title>
        </path>
      })}
    </svg>
    <div className="min-w-0">
      {atual || destaque ? <div className="rounded-xl bg-muted/60 p-3 text-sm">
        <p className="font-semibold">{UF_NOME[destaque!]}</p>
        {atual ? <>
          <p className="mt-1 text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatarMoeda(atual.valor)}</p>
          <p className="text-xs text-muted-foreground">{numero(atual.itens)} itens · {((atual.valor / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do total</p>
          {ufFiltrada !== destaque && <button type="button" onClick={() => aoFiltrar(destaque!)} className="mt-2 text-xs font-semibold text-primary hover:underline">Analisar só este estado</button>}
        </> : <p className="mt-1 text-xs text-muted-foreground">Sem compras no período.</p>}
      </div> : null}
      <p className="mb-1.5 mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Maiores compradores</p>
      <ol className="space-y-1.5 text-sm">
        {porUf.slice(0, 5).map((u) => <li key={u.uf}><button type="button" onClick={() => setDestaque(u.uf)} className="w-full text-left">
          <span className="flex justify-between gap-2"><span className="font-medium">{u.uf}</span><span className="tabular-nums text-muted-foreground">{moedaCurta(u.valor)}</span></span>
          <span className="mt-1 block h-1.5 rounded-full bg-muted"><span className="block h-1.5 rounded-full bg-emerald-500" style={{ width: `${(u.valor / max) * 100}%` }} /></span>
        </button></li>)}
      </ol>
    </div>
  </div>
}

function BarrasMes({ porMes, ate }: { porMes: AnaliseMercado['porMes']; ate: string }) {
  if (!porMes.length) return <p className="text-sm text-muted-foreground">Sem datas de resultado no período.</p>
  // Preenche os meses sem compras para o eixo não pular meses.
  const meses: { mes: string; valor: number; itens: number }[] = []
  const dados = Object.fromEntries(porMes.map((m) => [m.mes, m]))
  const [ai, mi] = porMes[0].mes.split('-').map(Number), [af, mf] = porMes[porMes.length - 1].mes.split('-').map(Number)
  for (let y = ai, m = mi; y < af || (y === af && m <= mf); m === 12 ? (y++, m = 1) : m++) {
    const k = `${y}-${String(m).padStart(2, '0')}`
    meses.push(dados[k] ?? { mes: k, valor: 0, itens: 0 })
  }
  const max = Math.max(1, ...meses.map((m) => m.valor))
  const fim = new Date(`${ate}T12:00:00`), limite = new Date(fim.getFullYear(), fim.getMonth() - 1, 1)
  const consolidando = (mes: string) => new Date(`${mes}-01T12:00:00`) >= limite
  const rotulo = (mes: string) => new Date(`${mes}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  const passo = meses.length > 18 ? 3 : meses.length > 12 ? 2 : 1
  return <>
    <div className="flex h-44 items-end gap-[3px]" role="img" aria-label="Valor contratado por mês">
      {meses.map((m, i) => <div key={m.mes} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${new Date(`${m.mes}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}: ${formatarMoeda(m.valor)} · ${m.itens} itens`}>
        <div className={cn('w-full rounded-t-sm', consolidando(m.mes) ? 'bg-emerald-500/40' : 'bg-emerald-500')} style={{ height: `${m.valor ? Math.max(3, (m.valor / max) * 100) : 0}%` }} />
        <span className={cn('mt-1 h-3 truncate text-center text-[10px] leading-3 text-muted-foreground', i % passo && 'invisible')}>{rotulo(m.mes)}</span>
      </div>)}
    </div>
    <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm bg-emerald-500/40" />Meses em consolidação: os valores tendem a crescer à medida que as compras são homologadas.</p>
  </>
}

function Rosca({ titulo, partes }: { titulo: string; partes: { rotulo: string; valor: number }[] }) {
  const total = partes.reduce((s, p) => s + p.valor, 0)
  const R = 15.915 // circunferência 100
  let acumulado = 0
  return <Card className="p-4 sm:p-5">
    <h2 className="mb-3 font-semibold">{titulo}</h2>
    {!total ? <p className="text-sm text-muted-foreground">Sem dados.</p> : <div className="flex items-center gap-4">
      <svg viewBox="0 0 42 42" className="h-28 w-28 shrink-0 -rotate-90" role="img" aria-label={titulo}>
        <circle cx="21" cy="21" r={R} fill="none" className="stroke-muted" strokeWidth="7" />
        {partes.map((p, i) => {
          const pct = (p.valor / total) * 100
          const el = <circle key={p.rotulo} cx="21" cy="21" r={R} fill="none" stroke={CORES[i % CORES.length]} strokeWidth="7" strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={-acumulado} />
          acumulado += pct
          return el
        })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">{partes.slice(0, 6).map((p, i) => <li key={p.rotulo} className="flex items-start gap-2">
        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CORES[i % CORES.length] }} />
        <span className="min-w-0"><span className="block truncate font-medium">{p.rotulo} <span className="text-muted-foreground">{Math.round((p.valor / total) * 100)}%</span></span><span className="block whitespace-nowrap text-xs tabular-nums text-muted-foreground">{moedaCurta(p.valor)}</span></span>
      </li>)}</ul>
    </div>}
  </Card>
}

interface Soma { itens: number; valor: number }
interface Coluna<T> { id: string; rotulo: string; valor: (x: T) => number | string; render?: (x: T) => ReactNode; numerica?: boolean }

function Tabela<T extends Soma>({ linhas, colunas, rotuloGrafico, chave }: { linhas: T[]; colunas: Coluna<T>[]; rotuloGrafico: (x: T) => string; chave: (x: T) => string }) {
  const [ordem, setOrdem] = useState<{ id: string; desc: boolean }>({ id: 'valor', desc: true })
  const [pagina, setPagina] = useState(0), [modo, setModo] = useState<'tabela' | 'grafico'>('tabela')
  const col = colunas.find((c) => c.id === ordem.id) ?? colunas[0]
  const ordenadas = [...linhas].sort((a, b) => { const x = col.valor(a), y = col.valor(b); const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR'); return ordem.desc ? -r : r })
  const POR = 10, paginas = Math.max(1, Math.ceil(ordenadas.length / POR))
  const visiveis = ordenadas.slice(pagina * POR, pagina * POR + POR)
  const valorCol = colunas.find((c) => c.id === 'valor')!
  const max = Math.max(1, ...ordenadas.slice(0, 10).map((x) => Number(valorCol.valor(x))))
  return <>
    <div className="mb-3 inline-flex rounded-full border p-0.5 text-sm" role="group" aria-label="Exibição">
      {([['tabela', 'Tabela', Table2], ['grafico', 'Gráfico', BarChart3]] as const).map(([id, r, Icone]) => <button key={id} type="button" aria-pressed={modo === id} onClick={() => setModo(id)}
        className={cn('inline-flex h-8 items-center gap-1.5 rounded-full px-3 font-medium', modo === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}><Icone className="h-4 w-4" />{r}</button>)}
    </div>
    {modo === 'grafico' ? <ol className="space-y-3">
      {[...linhas].sort((a, b) => Number(valorCol.valor(b)) - Number(valorCol.valor(a))).slice(0, 10).map((x) => <li key={chave(x)} className="text-sm">
        <div className="flex justify-between gap-3"><span className="min-w-0 truncate font-medium">{rotuloGrafico(x)}</span><span className="shrink-0 tabular-nums text-muted-foreground">{moedaCurta(Number(valorCol.valor(x)))}</span></div>
        <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${(Number(valorCol.valor(x)) / max) * 100}%` }} /></div>
      </li>)}
      <li className="text-xs text-muted-foreground">Os 10 maiores por valor contratado.</li>
    </ol> : <>
      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            {colunas.map((c) => <th key={c.id} className={cn('whitespace-nowrap px-2 py-2 font-semibold first:pl-4 last:pr-4 sm:px-3', c.numerica && 'text-right')} aria-sort={ordem.id === c.id ? (ordem.desc ? 'descending' : 'ascending') : 'none'}>
              <button type="button" onClick={() => { setPagina(0); setOrdem((o) => ({ id: c.id, desc: o.id === c.id ? !o.desc : !!c.numerica })) }} className={cn('inline-flex items-center gap-1 uppercase', ordem.id === c.id && 'text-foreground')}>
                {c.rotulo}{ordem.id === c.id && (ordem.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
              </button>
            </th>)}
          </tr></thead>
          <tbody>{visiveis.map((x) => <tr key={chave(x)} className="border-b last:border-0">
            {colunas.map((c) => <td key={c.id} className={cn('px-2 py-2.5 align-top first:pl-4 last:pr-4 sm:px-3', c.numerica && 'whitespace-nowrap text-right tabular-nums')}>{c.render ? c.render(x) : c.numerica && c.id === 'valor' ? formatarMoeda(Number(c.valor(x))) : c.numerica ? numero(Number(c.valor(x))) : c.valor(x)}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
      {paginas > 1 && <div className="mt-3 flex items-center justify-between gap-2 text-sm">
        <span className="text-xs text-muted-foreground">{pagina * POR + 1}–{Math.min(ordenadas.length, pagina * POR + POR)} de {numero(ordenadas.length)}</span>
        <div className="flex gap-1">
          <Button variante="contorno" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
          <Button variante="contorno" disabled={pagina >= paginas - 1} onClick={() => setPagina((p) => p + 1)}>Próxima</Button>
        </div>
      </div>}
    </>}
  </>
}

function PainelAngulo({ angulo, a, nomes, aoFechar, aoFiltrarUf, aoSoCodigo }: { angulo: Angulo; a: AnaliseMercado; nomes: Record<string, ItemCatalogo>; aoFechar: () => void; aoFiltrarUf: (u: string) => void; aoSoCodigo: (c: string) => void }) {
  const itens: Coluna<Soma> = { id: 'itens', rotulo: 'Vitórias', valor: (x) => x.itens, numerica: true }
  const valor: Coluna<Soma> = { id: 'valor', rotulo: 'Valor', valor: (x) => x.valor, numerica: true }
  const limite = (n: number, total: number) => total > n ? <p className="mt-3 text-xs text-muted-foreground">Mostrando os {numero(n)} maiores de {numero(total)}.</p> : null
  const titulos: Record<Angulo, string> = { itens: 'Itens homologados', catalogo: 'Itens do catálogo', estados: 'Compras por estado', orgaos: 'Principais órgãos compradores', empresas: 'Empresas que mais vencem', marcas: 'Principais marcas' }
  return <Modal aberto largo titulo={titulos[angulo]} aoFechar={aoFechar}>
    {angulo === 'itens' ? <ListaItens a={a} />
      : angulo === 'catalogo' ? <Tabela<AnaliseMercado['catalogo'][number]> linhas={a.catalogo} chave={(x) => x.codigo} rotuloGrafico={(x) => nomes[x.codigo]?.nome ?? x.codigo} colunas={[
        { id: 'nome', rotulo: 'Item do catálogo', valor: (x) => nomes[x.codigo]?.nome ?? x.codigo, render: (x) => <button type="button" onClick={() => aoSoCodigo(x.codigo)} className="text-left font-medium text-sky-700 hover:underline dark:text-sky-300" title="Analisar só este item">{nomes[x.codigo]?.nome ?? x.codigo}<span className="block text-xs font-normal text-muted-foreground">{x.codigo[0] === 'M' ? 'Material' : 'Serviço'} · cód. {x.codigo.slice(1)}</span></button> },
        { ...itens, rotulo: 'Itens' }, valor,
      ]} />
      : angulo === 'estados' ? <Tabela<AnaliseMercado['porUf'][number]> linhas={a.porUf} chave={(x) => x.uf} rotuloGrafico={(x) => UF_NOME[x.uf]} colunas={[
        { id: 'uf', rotulo: 'Estado', valor: (x) => x.uf, render: (x) => <button type="button" onClick={() => aoFiltrarUf(x.uf)} className="text-left font-medium text-sky-700 hover:underline dark:text-sky-300" title="Analisar só este estado">{x.uf} <span className="text-xs font-normal text-muted-foreground">{UF_NOME[x.uf]}</span></button> },
        { ...itens, rotulo: 'Itens' }, valor,
      ]} />
      : angulo === 'orgaos' ? <><Tabela<AnaliseMercado['orgaos'][number]> linhas={a.orgaos} chave={(x) => `${x.uasg}|${x.nome}`} rotuloGrafico={(x) => x.nome} colunas={[
        { id: 'nome', rotulo: 'Órgão', valor: (x) => x.nome, render: (x) => <span className="block min-w-[8rem] break-words"><span className="font-medium">{x.nome}</span>{(x.unidade || x.uf) && <span className="block text-xs text-muted-foreground">{[x.unidade !== x.nome && x.unidade, x.uasg && `UASG ${x.uasg}`, x.uf].filter(Boolean).join(' · ')}</span>}</span> },
        { ...itens, rotulo: 'Itens' }, valor,
      ]} />{limite(a.orgaos.length, a.totalOrgaos)}</>
      : angulo === 'empresas' ? <><Tabela<AnaliseMercado['empresas'][number]> linhas={a.empresas} chave={(x) => x.cnpj} rotuloGrafico={(x) => x.nome ?? formatarCnpj(x.cnpj)} colunas={[
        { id: 'nome', rotulo: 'Razão social', valor: (x) => x.nome ?? x.cnpj, render: (x) => <Link to={`/app/analise-empresas/${x.cnpj}`} className="block min-w-[8rem] break-words text-sky-700 hover:underline dark:text-sky-300"><span className="font-medium">{x.nome ?? 'Empresa'}</span><span className="block text-xs text-muted-foreground">{x.cnpj.length === 14 ? formatarCnpj(x.cnpj) : x.cnpj}</span></Link> },
        itens, valor,
      ]} />{limite(a.empresas.length, a.totalEmpresas)}<p className="mt-2 text-xs text-muted-foreground">Toque na empresa para abrir a análise completa dela.</p></>
      : <><Tabela<AnaliseMercado['marcas'][number]> linhas={a.marcas} chave={(x) => x.marca} rotuloGrafico={(x) => x.marca} colunas={[
        { id: 'marca', rotulo: 'Marca', valor: (x) => x.marca, render: (x) => <a href={linkPesquisaMarca(x.marca)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-sky-700 hover:underline dark:text-sky-300">{x.marca}<ExternalLink className="h-3 w-3" /></a> },
        itens, valor,
      ]} />{limite(a.marcas.length, a.totalMarcas)}</>}
  </Modal>
}

function ListaItens({ a }: { a: AnaliseMercado }) {
  const [filtro, setFiltro] = useState(''), [qtd, setQtd] = useState(20)
  const f = normalizar(filtro.trim())
  const lista = a.recentes.filter((c) => !f || normalizar(`${c.descricao} ${c.marca ?? ''} ${c.fornecedor ?? ''} ${c.orgao ?? ''}`).includes(f))
  return <>
    <div className="relative mb-3"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
      <Input className="pl-9" placeholder="Filtrar por descrição, marca, fornecedor ou órgão" value={filtro} onChange={(e) => { setFiltro(e.target.value); setQtd(20) }} />
      {filtro && <button type="button" aria-label="Limpar" onClick={() => setFiltro('')} className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}</div>
    <p className="mb-3 text-xs text-muted-foreground">{numero(lista.length)} {lista.length === 1 ? 'item' : 'itens'}{a.recentes.length < a.itens ? ` entre os ${numero(a.recentes.length)} mais recentes de ${numero(a.itens)}` : ''}.</p>
    <div className="space-y-3">{lista.slice(0, qtd).map((c, i) => <CartaoCompraPreco key={`${c.idCompra}-${c.numeroItem}-${i}`} compra={c} />)}</div>
    {qtd < lista.length && <Button className="mt-3 w-full" variante="contorno" onClick={() => setQtd((n) => n + 20)}>Mostrar mais</Button>}
  </>
}
