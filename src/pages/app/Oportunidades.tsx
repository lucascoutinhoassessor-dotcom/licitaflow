import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Radar, Search, SlidersHorizontal, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button, CabecalhoPagina, Campo, Card, Input, Select, Vazio } from '@/components/ui'
import { SeletorEmpresa, useEmpresaPadrao } from '@/components/Situacoes'
import { useOrg } from '@/providers/OrgProvider'
import { useLista, useSalvar } from '@/hooks/useDados'
import { consultarCatalogo, FonteLimitadaError, dadosProcesso, type CompraPNCP } from '@/lib/pncp'
import { buscarOportunidades, filtrosExtras, MODALIDADES, validarFiltros, type FiltrosOportunidades as Filtros, type ProgressoBusca } from '@/lib/filtrosOportunidades'
import FiltrosOportunidades from '@/components/FiltrosOportunidades'
import ItensEdital from '@/components/ItensEdital'
import { portalCompra, PORTAIS } from '@/lib/portais'
import { formatarData, formatarMoeda } from '@/lib/format'
import type { Processo } from '@/types/db'

function dataLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
export default function Oportunidades() {
  const { podeEditar }=useOrg(),padrao=useEmpresaPadrao()
  const [empresaId,setEmpresaId]=useState(padrao)
  useEffect(()=>setEmpresaId(padrao),[padrao])
  const [f,setF]=useState<Filtros>(()=>{
    const hoje=new Date(),inicio=new Date();inicio.setDate(inicio.getDate()-30)
    return {...filtrosExtras,inicio:dataLocal(inicio),fim:dataLocal(hoje),situacao:'abertas',modalidade:'6',uf:''}
  })
  const [consulta,setConsulta]=useState<Filtros|null>(null),[avancados,setAvancados]=useState(false)
  const [pagina,setPagina]=useState(1),[progresso,setProgresso]=useState<ProgressoBusca|null>(null)
  const client=useQueryClient(),navigate=useNavigate()
  const processos=useLista<Processo>('processos',{porEmpresa:false})
  const {salvar}=useSalvar('processos',['processo_eventos','prazos'])
  const chave=['oportunidades-completas',consulta]
  const q=useQuery({
    queryKey:chave,enabled:!!consulta,retry:false,staleTime:300_000,
    queryFn:({signal})=>buscarOportunidades(consulta!,1,signal,{
      progresso:setProgresso,
      obterPagina:(f,pagina,signalPai)=>client.fetchQuery({
        queryKey:['catalogo-publico',f.situacao,f.situacao==='abertas'?'':f.inicio,f.situacao==='abertas'?'':f.fim,f.uf,f.modalidade,pagina],
        queryFn:({signal})=>consultarCatalogo(f,pagina,signalPai?AbortSignal.any([signal,signalPai]):signal),
        staleTime:900_000,gcTime:1_800_000,retry:(n,erro)=>!(erro instanceof FonteLimitadaError)&&n<2,retryDelay:n=>Math.min(1000*2**n,4000),
      }),
    }),
  })
  const [agora,setAgora]=useState(Date.now())
  useEffect(()=>{
    if(!(q.error instanceof FonteLimitadaError))return
    setAgora(Date.now())
    const timer=window.setInterval(()=>setAgora(Date.now()),1000)
    return ()=>window.clearInterval(timer)
  },[q.error])
  const espera=q.error instanceof FonteLimitadaError?Math.max(0,Math.ceil((q.error.retomarEm-agora)/1000)):0
  const completa=!!q.data && !q.isFetching && !q.isError
  const lista=completa?q.data.data:(progresso?.data??[])
  const totalPaginas=Math.max(1,Math.ceil(lista.length/20)),visiveis=lista.slice((pagina-1)*20,pagina*20)
  const set=(k:keyof Filtros)=>(e:{target:{value:string}})=>setF(x=>({...x,[k]:e.target.value}))
  const extras=(f.portais.length!==PORTAIS.length?1:0)+(f.modalidades.length!==MODALIDADES.length?1:0)+[f.orgao,f.minimo,f.maximo,f.itemMinimo,f.itemMaximo,f.maxItens,f.naoDivulgado,f.exclusivo,f.excluirSrp].filter(Boolean).length
  function pesquisar(e:FormEvent) {
    e.preventDefault()
    try{validarFiltros(f)}catch(erro){toast.error((erro as Error).message);return}
    setPagina(1);setProgresso(null);setAvancados(false)
    if(consulta&&JSON.stringify(f)===JSON.stringify(consulta))void q.refetch()
    else setConsulta({...f})
  }
  async function importar(c:CompraPNCP) {
    if(!empresaId){toast.error('Selecione a empresa para importar.');return}
    try{const p=await salvar.mutateAsync({dados:dadosProcesso(c,empresaId)});toast.success('Oportunidade importada.');navigate(`/app/processos/${p.id}`)}catch{/* useSalvar apresenta o erro */}
  }
  return <>
    <CabecalhoPagina titulo="Oportunidades" descricao="Encontre editais e consulte seus itens." />
    <Card className="mb-5 p-4">
      <form onSubmit={pesquisar} className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" aria-label="Pesquisar oportunidades" placeholder="O que sua empresa vende? Ex.: microcomputador" value={f.busca} onChange={set('busca')} maxLength={128} /></div><Button type="submit" disabled={espera>0} carregando={q.isFetching}>Buscar oportunidades</Button></div>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><Select aria-label="Situação dos editais" value={f.situacao} onChange={set('situacao')}><option value="abertas">Recebendo propostas</option><option value="publicacoes">Por data de publicação</option></Select><Select aria-label="UF" value={f.uf} onChange={set('uf')}><option value="">Brasil inteiro</option>{'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').map(u=><option key={u}>{u}</option>)}</Select><Button type="button" variante="contorno" aria-expanded={avancados} aria-controls="mais-filtros" onClick={()=>setAvancados(v=>!v)}><SlidersHorizontal className="h-4 w-4" />Mais filtros{extras?` (${extras})`:''}<ChevronDown className={`h-4 w-4 transition-transform ${avancados?'rotate-180':''}`} /></Button></div>
        {f.situacao==='publicacoes'&&<div className="grid gap-3 sm:grid-cols-2"><Campo rotulo="Publicado desde" htmlFor="busca-inicio"><Input id="busca-inicio" type="date" required value={f.inicio} max={f.fim} onChange={set('inicio')} /></Campo><Campo rotulo="Publicado até" htmlFor="busca-fim"><Input id="busca-fim" type="date" required min={f.inicio} value={f.fim} onChange={set('fim')} /></Campo></div>}
        {avancados&&<div id="mais-filtros" className="border-t pt-3"><FiltrosOportunidades f={f} mudar={setF} compras={q.data?.compras??[]} /><Button className="mt-3 w-full sm:w-auto" type="submit" disabled={espera>0} carregando={q.isFetching}>Aplicar filtros e buscar</Button></div>}
      </form>
    </Card>
    {!consulta?<Vazio icone={Radar} titulo="Encontre sua próxima oportunidade" texto="Pesquise o produto ou serviço. Por padrão, a busca inclui o Brasil inteiro e editais recebendo propostas." />:<>
      <div role="status" aria-live="polite" className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{lista.length} {lista.length===1?'oportunidade encontrada':'oportunidades encontradas'}{completa?' · consulta concluída':q.isFetching?' · consultando todas as páginas':' · consulta incompleta'}</p>{q.isFetching?<Button tamanho="sm" variante="fantasma" onClick={()=>client.cancelQueries({queryKey:chave,exact:true})}>Pausar</Button>:!completa&&<Button tamanho="sm" variante="contorno" disabled={espera>0} onClick={()=>q.refetch()}>{espera>0?`Retomar em ${espera}s`:'Retomar consulta'}</Button>}</div>
        {q.isFetching&&<><div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Progresso da pesquisa" aria-valuemin={0} aria-valuemax={progresso?.totalPaginas||undefined} aria-valuenow={progresso?.totalPaginas?progresso.paginas:undefined}><div className="h-full bg-primary transition-all" style={{width:`${progresso?.totalPaginas?Math.min(100,progresso.paginas/progresso.totalPaginas*100):3}%`}} /></div><p className="text-xs text-muted-foreground">{progresso?.verificados??0} editais verificados. Os resultados aparecem enquanto a consulta avança; buscas nacionais podem levar alguns minutos.</p></>}
        {q.isError&&<p role="alert" className="text-sm text-destructive">{q.error.message} O total acima ainda é parcial.</p>}
      </div>
      {podeEditar&&lista.length>0&&<details className="mb-4 rounded-lg border bg-card p-3"><summary className="cursor-pointer text-sm">Empresa para importação</summary><div className="mt-3"><SeletorEmpresa id="busca-empresa" valor={empresaId} aoMudar={setEmpresaId} /></div></details>}
      {completa&&lista.length===0?<Vazio titulo="Nenhuma oportunidade encontrada" texto="Experimente outro termo ou amplie a UF, as modalidades e o período." />:<div className="space-y-3">{visiveis.map(c=>{
        const existente=processos.data?.find(p=>p.empresa_id===empresaId&&p.pncp_controle===c.numeroControlePNCP)
        return <Card key={c.numeroControlePNCP} className="p-4">
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{c.modalidadeNome} · {c.numeroCompra}</span><span>{c.unidadeOrgao.municipioNome}/{c.unidadeOrgao.ufSigla}</span>{c.srp===true&&<span className="rounded bg-primary/10 px-2 py-0.5 text-primary">SRP</span>}</div>
          <h2 className="line-clamp-2 break-words text-sm font-semibold sm:text-base">{c.objetoCompra}</h2>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{c.orgaoEntidade.razaoSocial} · {portalCompra(c)[1]}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm"><span>Propostas até {formatarData(c.dataEncerramentoProposta)}</span><span className="text-muted-foreground">{c.valorTotalEstimado?formatarMoeda(c.valorTotalEstimado):'Valor não divulgado'}</span></div>
          <div className="mt-3 flex flex-wrap items-center gap-3"><ItensEdital compra={c} />{existente?<Link className="text-sm text-primary hover:underline" to={`/app/processos/${existente.id}`}>Abrir processo</Link>:podeEditar&&<Button tamanho="sm" variante="fantasma" disabled={processos.isLoading||processos.isError||salvar.isPending} onClick={()=>importar(c)}>Importar</Button>}</div>
        </Card>
      })}</div>}
      {processos.isError&&<p role="alert" className="mt-3 text-sm text-destructive">Não foi possível verificar os processos já importados. <button className="underline" onClick={()=>processos.refetch()}>Tentar novamente</button></p>}
      {totalPaginas>1&&<div className="mt-5 flex items-center justify-between gap-2"><Button variante="contorno" disabled={pagina<=1} onClick={()=>setPagina(p=>p-1)}>Anterior</Button><span className="text-sm">{pagina} / {totalPaginas}</span><Button variante="contorno" disabled={pagina>=totalPaginas} onClick={()=>setPagina(p=>p+1)}>Próxima</Button></div>}
    </>}
  </>
}
