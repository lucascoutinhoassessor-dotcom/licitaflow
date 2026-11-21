import { useEffect, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import BotaoInverterOrdem from '@/components/BotaoInverterOrdem'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarClock, Package, Radar, Search, SlidersHorizontal, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, CabecalhoPagina, Campo, Card, Input, Select, Vazio } from '@/components/ui'
import { SeletorEmpresa, useEmpresaPadrao } from '@/components/Situacoes'
import { useOrg } from '@/providers/OrgProvider'
import { useLista, useSalvar } from '@/hooks/useDados'
import { dadosProcesso, rotaOportunidade, type CompraPNCP } from '@/lib/pncp'
import { filtrosExtras, MODALIDADES, nomeModoDisputa, PERIODOS_ABERTURA, periodoAbertura, validarFiltros, type FiltrosOportunidades as Filtros } from '@/lib/filtrosOportunidades'
import {pesquisarIndice} from '@/lib/buscaIndice'
import CategoriasObjeto from '@/components/CategoriasObjeto'
import FiltrosOportunidades from '@/components/FiltrosOportunidades'
import { codigoComprasnet, portalCompra, PORTAIS } from '@/lib/portais'
import IconePortal from '@/components/IconePortal'
import CodigoComprasnet from '@/components/CodigoComprasnet'
import { formatarData, formatarMoeda, prazoRelativo } from '@/lib/format'
import type { Processo } from '@/types/db'

function dataLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
const CHAVE_BUSCA='lf-oportunidades-busca'
function lerBuscaSalva():{f:Partial<Filtros>;consulta:Partial<Filtros>|null;pagina:number}|null {
  try{
    const s=JSON.parse(sessionStorage.getItem(CHAVE_BUSCA)??'null')
    if(!s||typeof s.f!=='object'||!s.f)return null
    return {f:s.f,consulta:s.consulta&&typeof s.consulta==='object'?s.consulta:null,pagina:Number.isInteger(s.pagina)&&s.pagina>0?s.pagina:1}
  }catch{return null}
}
export default function Oportunidades() {
  const { podeEditar }=useOrg(),padrao=useEmpresaPadrao()
  const [empresaId,setEmpresaId]=useState(padrao)
  useEffect(()=>setEmpresaId(padrao),[padrao])
  // Padrão: sessões dos próximos 15 dias, em dias úteis; a lista já abre carregada.
  // Ao voltar de uma oportunidade, recupera os filtros e a página da última busca desta aba.
  const [inicial]=useState(()=>{
    const hoje=new Date(),inicio=new Date();inicio.setDate(inicio.getDate()-30)
    const padraoFiltros:Filtros={...filtrosExtras,inicio:dataLocal(inicio),fim:dataLocal(hoje),situacao:'abertas',modalidade:'6',uf:'',...periodoAbertura(15)}
    const salvo=lerBuscaSalva()
    return salvo?{f:{...padraoFiltros,...salvo.f},consulta:salvo.consulta&&{...padraoFiltros,...salvo.consulta},pagina:salvo.pagina}:{f:padraoFiltros,consulta:padraoFiltros,pagina:1}
  })
  const [f,setF]=useState<Filtros>(inicial.f)
  const [consulta,setConsulta]=useState<Filtros|null>(inicial.consulta),[avancados,setAvancados]=useState(false)
  const [pagina,setPagina]=useState(inicial.pagina)
  useEffect(()=>{try{sessionStorage.setItem(CHAVE_BUSCA,JSON.stringify({f,consulta,pagina}))}catch{/* armazenamento indisponível */}},[f,consulta,pagina])
  const navigate=useNavigate()
  const processos=useLista<Processo>('processos',{porEmpresa:false})
  const {salvar}=useSalvar('processos',['processo_eventos','prazos'])
  const q=useQuery({
    queryKey:['oportunidades-indexadas',consulta,pagina],enabled:!!consulta,retry:1,staleTime:30_000,
    queryFn:({signal})=>pesquisarIndice(consulta!,pagina,signal),
  })
  const lista=q.data?.data??[],visiveis=lista
  const totalPaginas=Math.max(1,q.data?.totalPaginas??1)
  const catalogo=q.data?.catalogo
  const set=(k:keyof Filtros)=>(e:{target:{value:string}})=>setF(x=>({...x,[k]:e.target.value}))
  const extras=(f.portais.length!==PORTAIS.length?1:0)+(f.modalidades.length!==MODALIDADES.length?1:0)+[f.orgao,f.minimo,f.maximo,f.itemMinimo,f.itemMaximo,f.maxItens,f.naoDivulgado,f.exclusivo,f.excluirSrp,f.excluir.trim(),f.tipoItem,f.modosDisputa.length].filter(Boolean).length
  function pesquisar(e:FormEvent) {
    e.preventDefault()
    try{validarFiltros(f)}catch(erro){toast.error((erro as Error).message);return}
    setPagina(1);setAvancados(false)
    if(consulta&&JSON.stringify(f)===JSON.stringify(consulta)&&pagina===1)void q.refetch()
    else setConsulta({...f})
  }
  /** Período rápido: troca as datas e já pesquisa. */
  function escolherPeriodo(dias:number|null) {
    const novo={...f,situacao:'abertas' as const,...periodoAbertura(dias)}
    setF(novo);setPagina(1);setConsulta(novo)
  }
  const periodoAtual=PERIODOS_ABERTURA.find(([d])=>{const p=periodoAbertura(d);return p.aberturaDe===f.aberturaDe&&p.aberturaAte===f.aberturaAte})?.[0]
  async function importar(c:CompraPNCP) {
    if(!empresaId){toast.error('Selecione a empresa para importar.');return}
    try{const p=await salvar.mutateAsync({dados:dadosProcesso(c,empresaId)});toast.success('Oportunidade importada.');navigate(`/app/processos/${p.id}`)}catch{/* useSalvar apresenta o erro */}
  }
  return <>
    <CabecalhoPagina titulo="Oportunidades" descricao="Encontre editais e consulte seus itens." />
    <Card className="mb-5 p-4">
      <form onSubmit={pesquisar} className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" aria-label="Pesquisar oportunidades" placeholder="O que sua empresa vende? Ex.: notebook; computador" value={f.busca} onChange={set('busca')} maxLength={300} /></div><Button type="submit" carregando={q.isFetching}>Buscar oportunidades</Button></div>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><Select aria-label="Situação dos editais" value={f.situacao} onChange={set('situacao')}><option value="abertas">Por data de abertura</option><option value="publicacoes">Por data de publicação</option></Select><Select aria-label="UF" value={f.uf} onChange={set('uf')}><option value="">Brasil inteiro</option>{'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').map(u=><option key={u}>{u}</option>)}</Select><Button type="button" variante="contorno" aria-expanded={avancados} aria-controls="mais-filtros" onClick={()=>setAvancados(v=>!v)}><SlidersHorizontal className="h-4 w-4" />Mais filtros{extras?` (${extras})`:''}<ChevronDown className={`h-4 w-4 transition-transform ${avancados?'rotate-180':''}`} /></Button></div>
        {f.situacao==='abertas'&&<>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período de abertura">
            {PERIODOS_ABERTURA.map(([d,rotulo])=><button key={rotulo} type="button" onClick={()=>escolherPeriodo(d)} aria-pressed={periodoAtual===d}
              className={`h-9 rounded-full border px-4 text-sm font-semibold transition-colors ${periodoAtual===d?'border-primary bg-primary text-primary-foreground':'bg-card text-muted-foreground hover:text-foreground'}`}>{rotulo}</button>)}
            <button type="button" onClick={()=>{const novo={...f,diasUteis:!f.diasUteis};setF(novo);setPagina(1);setConsulta(novo)}} aria-pressed={f.diasUteis}
              className={`h-9 rounded-full border px-4 text-sm font-semibold transition-colors ${f.diasUteis?'border-emerald-500/60 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300':'bg-card text-muted-foreground hover:text-foreground'}`}>Só dias úteis</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2"><Campo rotulo="Abertura a partir de" htmlFor="busca-abertura-de"><Input id="busca-abertura-de" type="date" value={f.aberturaDe} max={f.aberturaAte||undefined} onChange={set('aberturaDe')} /></Campo><Campo rotulo="Abertura até" htmlFor="busca-abertura-ate"><Input id="busca-abertura-ate" type="date" min={f.aberturaDe||undefined} value={f.aberturaAte} onChange={set('aberturaAte')} /></Campo></div>
        </>}
        {f.situacao==='publicacoes'&&<div className="grid gap-3 sm:grid-cols-2"><Campo rotulo="Publicado desde" htmlFor="busca-inicio"><Input id="busca-inicio" type="date" required value={f.inicio} max={f.fim} onChange={set('inicio')} /></Campo><Campo rotulo="Publicado até" htmlFor="busca-fim"><Input id="busca-fim" type="date" required min={f.inicio} value={f.fim} onChange={set('fim')} /></Campo></div>}
        {avancados&&<div id="mais-filtros" className="border-t pt-3"><FiltrosOportunidades f={f} mudar={setF} compras={[]} orgaos={q.data?.orgaos??[]} /><Button className="mt-3 w-full sm:w-auto" type="submit" carregando={q.isFetching}>Aplicar filtros e buscar</Button></div>}
      </form>
    </Card>
    {!consulta?<Vazio icone={Radar} titulo="Encontre sua próxima oportunidade" texto="Pesquise o produto ou serviço. Por padrão, a busca inclui o Brasil inteiro e editais recebendo propostas." />:<>
      <div role="status" aria-live="polite" className="mb-4 space-y-2">
        {q.isFetching?<p className="text-sm text-muted-foreground">Pesquisando...</p>:q.isError?<div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive"><p>{q.error.message}</p><Button tamanho="sm" variante="contorno" onClick={()=>q.refetch()}>Tentar novamente</Button></div>:<div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{q.data?.totalRegistros??0} {(q.data?.totalRegistros??0)===1?'oportunidade encontrada':'oportunidades encontradas'}</p>
          <BotaoInverterOrdem invertido={!!consulta.inverter} aoMudar={inverter=>{const novo={...consulta,inverter};setF(v=>({...v,inverter}));setPagina(1);setConsulta(novo)}}
            normal={consulta.situacao==='abertas'?'Mais próximas primeiro':'Mais recentes primeiro'} inverso={consulta.situacao==='abertas'?'Mais distantes primeiro':'Mais antigas primeiro'} /></div>}
        {catalogo?.ultima_coleta_em&&<p className="text-xs text-muted-foreground">Base atualizada em {new Date(catalogo.ultima_coleta_em).toLocaleString('pt-BR')}.</p>}
        {catalogo&&!catalogo.carga_inicial_concluida&&<p className="text-sm text-muted-foreground">A base está recebendo a carga inicial. {catalogo.editais_indexados.toLocaleString('pt-BR')} editais já estão disponíveis; a cobertura ainda é parcial.</p>}
        {catalogo?.aviso&&<p className="text-xs text-muted-foreground">{catalogo.aviso}</p>}
        {(q.data?.detalhesPendentes??0)>0&&<p className="text-sm text-muted-foreground">Os filtros por item consideram os detalhes já coletados. Há {q.data?.detalhesPendentes} editais com detalhes em atualização.</p>}
      </div>
      {podeEditar&&lista.length>0&&<details className="mb-4 rounded-lg border bg-card p-3"><summary className="cursor-pointer text-sm">Empresa para importação</summary><div className="mt-3"><SeletorEmpresa id="busca-empresa" valor={empresaId} aoMudar={setEmpresaId} /></div></details>}
      {!q.isFetching&&!q.isError&&lista.length===0?<Vazio titulo="Nenhuma oportunidade encontrada" texto={catalogo&&!catalogo.carga_inicial_concluida?"A carga inicial continua em segundo plano. A quantidade disponível ainda pode aumentar.":"Experimente outro termo ou amplie a UF, as modalidades e o período."} />:<div className="space-y-3">{visiveis.map(c=>{
        const existente=processos.data?.find(p=>p.empresa_id===empresaId&&p.pncp_controle===c.numeroControlePNCP)
        return <Card key={c.numeroControlePNCP} className="p-4">
          <h2 className="line-clamp-2 break-words text-sm font-semibold sm:text-base"><Link to={rotaOportunidade(c)} state={{compra:c}} className="text-sky-700 underline-offset-2 hover:underline dark:text-sky-300">{c.modalidadeNome} Nº {codigoComprasnet(c)?.numero??c.numeroCompra} – {c.orgaoEntidade.razaoSocial} / {c.unidadeOrgao.ufSigla}</Link></h2>
          <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">{c.objetoCompra}</p>
          <CategoriasObjeto objeto={c.objetoCompra} className="mt-2" />
          <div className="mt-2.5 flex flex-wrap items-center gap-2"><Badge cor="verde">{c.modalidadeNome}</Badge>{c.srp===true&&<Badge cor="azul">Registro de preço</Badge>}{nomeModoDisputa(c.modoDisputaId)&&<Badge>{nomeModoDisputa(c.modoDisputaId)}</Badge>}{c.materialOuServico&&<Badge title={c.tipoEstimado?'Deduzido pelo objeto do edital; confirme nos itens.':undefined}>{c.materialOuServico==='M'?'Material':c.materialOuServico==='S'?'Serviço':'Material e serviço'}{c.tipoEstimado?' (estimado)':''}</Badge>}<Badge>{c.valorTotalEstimado?formatarMoeda(c.valorTotalEstimado):'Valor não divulgado'}</Badge></div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"><span className="flex items-center gap-1.5 font-semibold"><CalendarClock className="h-4 w-4 text-muted-foreground" />Propostas até {formatarData(c.dataEncerramentoProposta)}</span>{prazoRelativo(c.dataEncerramentoProposta)&&<span className="text-xs text-muted-foreground">{prazoRelativo(c.dataEncerramentoProposta)}</span>}</div>
          <div className="mt-2 flex flex-wrap gap-2"><Badge className="gap-1.5"><IconePortal id={portalCompra(c)[0]} nome={portalCompra(c)[1]} />{portalCompra(c)[1]}</Badge><Badge>{c.unidadeOrgao.municipioNome}/{c.unidadeOrgao.ufSigla}</Badge><CodigoComprasnet compra={c} /></div>
          <div className="mt-3 flex flex-wrap items-center gap-3"><Link to={`${rotaOportunidade(c)}#itens`} state={{compra:c}} className="inline-flex h-8 items-center gap-2 rounded-full border border-input bg-card px-3.5 text-sm font-semibold hover:bg-muted"><Package className="h-4 w-4" />Ver itens</Link>{existente?<Link className="text-sm text-primary hover:underline" to={`/app/processos/${existente.id}`}>Abrir processo</Link>:podeEditar&&<Button tamanho="sm" disabled={processos.isLoading||processos.isError||salvar.isPending} onClick={()=>importar(c)}>Adicionar aos processos</Button>}</div>
        </Card>
      })}</div>}
      {processos.isError&&<p role="alert" className="mt-3 text-sm text-destructive">Não foi possível verificar os processos já importados. <button className="underline" onClick={()=>processos.refetch()}>Tentar novamente</button></p>}
      {totalPaginas>1&&<div className="mt-5 flex items-center justify-between gap-2"><Button variante="contorno" disabled={pagina<=1} onClick={()=>setPagina(p=>p-1)}>Anterior</Button><span className="text-sm">{pagina} / {totalPaginas}</span><Button variante="contorno" disabled={pagina>=totalPaginas} onClick={()=>setPagina(p=>p+1)}>Próxima</Button></div>}
    </>}
  </>
}
