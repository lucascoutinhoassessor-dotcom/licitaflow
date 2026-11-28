import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { diaBrasilia, filtrosResumoHoje } from '@/lib/resumoEditais'
import BotaoInverterOrdem from '@/components/BotaoInverterOrdem'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Package, Radar, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, CabecalhoPagina, Campo, Card, Input, Select, Vazio } from '@/components/ui'
import { SeletorEmpresa, useEmpresaPadrao } from '@/components/Situacoes'
import { useOrg } from '@/providers/OrgProvider'
import { useLista, useSalvar } from '@/hooks/useDados'
import { dadosProcesso, rotaOportunidade, type CompraPNCP } from '@/lib/pncp'
import { comUfs, filtrosExtras, MODALIDADES, nomeModoDisputa, atualizarPeriodoRapido, PERIODOS_ABERTURA, PERIODOS_PUBLICACAO, periodoAbertura, periodoEntre, periodoPublicacao, periodoRapidoDe, resumoFiltros, ufsDe, validarFiltros, type FiltrosOportunidades as Filtros } from '@/lib/filtrosOportunidades'
import {buscaHistorica,pesquisarIndice,pesquisarOrgaos,type ResultadoIndice} from '@/lib/buscaIndice'
import CategoriasObjeto from '@/components/CategoriasObjeto'
import FiltrosOportunidades from '@/components/FiltrosOportunidades'
import MenuFiltros from '@/components/MenuFiltros'
import SeletorEstados from '@/components/SeletorEstados'
import OportunidadesDesertas from '@/components/OportunidadesDesertas'
import LocalizarEdital from '@/components/LocalizarEdital'
import AtalhosOportunidades, { type AcaoAtalho } from '@/components/AtalhosOportunidades'
import { RecursoLiberado } from '@/components/RecursoLiberado'
import { codigoComprasnet, comPortaisNovos, portalCompra, PORTAIS } from '@/lib/portais'
import IconePortal from '@/components/IconePortal'
import CodigoComprasnet from '@/components/CodigoComprasnet'
import { FiltroLiberado } from '@/components/FiltroLiberado'
import { useFiltrosLiberados, useRecursos } from '@/hooks/useModulos'
import { aplicarLiberacao, modalidadesLiberadas } from '@/lib/filtrosLiberacao'
import { formatarMoeda } from '@/lib/format'
import type { Processo } from '@/types/db'
import ContagemDisputa from '@/components/ContagemDisputa'

const CHAVE_BUSCA='lf-oportunidades-busca',CHAVE_ABA='lf-oportunidades-aba'
type Aba='abertas'|'desertas'|'localizar'
function lerAba():Aba{try{const a=sessionStorage.getItem(CHAVE_ABA);return a==='desertas'||a==='localizar'?a:'abertas'}catch{return 'abertas'}}
/** Abas da tela e o recurso (liberado pelo master) que cada uma exige. */
const ABAS:[Aba,string,`recurso-${string}`|null][]=[['abertas','Editais',null],['desertas','Itens sem vencedor','recurso-sem-vencedor'],['localizar','Localizar edital','recurso-localizar-edital']]
/** Período rápido escolhido (7, 15, 30 ou todo o período) é guardado junto: ao reabrir em outro dia, as datas andam com ele. */
type Rapido=number|null|undefined
const lerRapido=(v:unknown):Rapido=>v===null?null:typeof v==='number'&&Number.isInteger(v)?v:undefined
function lerBuscaSalva():{f:Partial<Filtros>;consulta:Partial<Filtros>|null;pagina:number;rapidoF:Rapido;rapidoC:Rapido}|null {
  try{
    const s=JSON.parse(sessionStorage.getItem(CHAVE_BUSCA)??'null')
    if(!s||typeof s.f!=='object'||!s.f)return null
    return {f:s.f,consulta:s.consulta&&typeof s.consulta==='object'?s.consulta:null,pagina:Number.isInteger(s.pagina)&&s.pagina>0?s.pagina:1,rapidoF:lerRapido(s.rapidoF),rapidoC:lerRapido(s.rapidoC)}
  }catch{return null}
}
// Guarda a última página de resultados desta aba: ao voltar para a lista, ela aparece na hora,
// sem uma nova consulta ao banco enquanto tiver menos de 5 minutos.
const CHAVE_RESULTADO='lf-oportunidades-resultado',VALIDADE_BUSCA=5*60_000
function lerResultadoSalvo(chave:string):{em:number;data:ResultadoIndice}|undefined{
  try{
    const s=JSON.parse(sessionStorage.getItem(CHAVE_RESULTADO)??'null')
    return s?.chave===chave&&Number.isFinite(s.em)&&s.data&&Array.isArray(s.data.data)?{em:s.em,data:s.data}:undefined
  }catch{return undefined}
}
export default function Oportunidades() {
  const [parametros]=useSearchParams()
  const { podeEditar }=useOrg(),padrao=useEmpresaPadrao()
  const [empresaId,setEmpresaId]=useState(padrao)
  useEffect(()=>setEmpresaId(padrao),[padrao])
  // Padrão: sessões dos próximos 15 dias, em dias úteis; a lista já abre carregada.
  // Ao voltar de uma oportunidade, recupera os filtros e a página da última busca desta aba.
  const [inicial]=useState(()=>{
    const padraoFiltros:Filtros={...filtrosExtras,...periodoPublicacao(30),situacao:'abertas',modalidade:'6',uf:'',...periodoAbertura(15)}
    const resumo=filtrosResumoHoje(parametros,diaBrasilia(new Date()))
    if(resumo){
      const hojeFiltros:Filtros={...padraoFiltros,...resumo}
      return {f:hojeFiltros,consulta:hojeFiltros,pagina:1}
    }
    const salvo=lerBuscaSalva()
    if(!salvo)return {f:padraoFiltros,consulta:padraoFiltros,pagina:1}
    const consultaSalva=salvo.consulta&&{...padraoFiltros,...salvo.consulta,portais:comPortaisNovos(salvo.consulta.portais??padraoFiltros.portais)},consulta=consultaSalva&&atualizarPeriodoRapido(consultaSalva,salvo.rapidoC)
    // Datas que andaram para hoje: a página guardada era de outro período.
    const pagina=consulta&&JSON.stringify(consulta)!==JSON.stringify(consultaSalva)?1:salvo.pagina
    return {f:atualizarPeriodoRapido({...padraoFiltros,...salvo.f,portais:comPortaisNovos(salvo.f.portais??padraoFiltros.portais)},salvo.rapidoF),consulta,pagina}
  })
  const [f,setF]=useState<Filtros>(inicial.f)
  const [consulta,setConsulta]=useState<Filtros|null>(inicial.consulta)
  const [pagina,setPagina]=useState(inicial.pagina)
  const [abaEscolhida,setAba]=useState<Aba>(()=>parametros.get('publicadas')==='hoje'?'abertas':lerAba()),[atalho,setAtalho]=useState<{portal:string;vez:number}>()
  const recursos=useRecursos()
  const abas=ABAS.filter(([,,r])=>!r||recursos.estado(r)==='liberado')
  // Aba que o master deixou de liberar volta para os editais abertos.
  const aba:Aba=abas.some(([id])=>id===abaEscolhida)?abaEscolhida:'abertas'
  function usarAtalho(a:AcaoAtalho){
    if(a.tipo==='localizar'){setAba('localizar');return}
    if(a.tipo==='proximas'){
      // Editais que ainda vão abrir: troca período e portal e já pesquisa. Num dia só (hoje/amanhã) mostra também fim de semana e feriado.
      const novo:Filtros={...f,situacao:'abertas',...periodoEntre(a.de,a.ate),portais:a.portal?[a.portal]:filtrosExtras.portais,diasUteis:a.de===a.ate?false:f.diasUteis,inverter:false}
      setAba('abertas');setAtalho(undefined);setF(novo);setPagina(1);setConsulta(novo);return
    }
    setAba('desertas');setAtalho(x=>({portal:a.portal,vez:(x?.vez??0)+1}))
  }
  useEffect(()=>{try{sessionStorage.setItem(CHAVE_ABA,aba)}catch{/* armazenamento indisponível */}},[aba])
  useEffect(()=>{try{sessionStorage.setItem(CHAVE_BUSCA,JSON.stringify({f,consulta,pagina,rapidoF:periodoRapidoDe(f),rapidoC:consulta?periodoRapidoDe(consulta):undefined}))}catch{/* armazenamento indisponível */}},[f,consulta,pagina])
  const navigate=useNavigate()
  const processos=useLista<Processo>('processos',{porEmpresa:false})
  const {salvar}=useSalvar('processos',['processo_eventos','prazos'])
  // Filtros que o master não liberou voltam ao padrão (ex.: valor guardado de uma busca anterior).
  const {estados}=useFiltrosLiberados()
  const efetiva=useMemo(()=>consulta&&aplicarLiberacao(consulta,estados),[consulta,estados])
  const chaveResultado=JSON.stringify([efetiva,pagina]),salvo=lerResultadoSalvo(chaveResultado)
  const q=useQuery({
    queryKey:['oportunidades-indexadas',efetiva,pagina],enabled:!!efetiva&&estados!==null&&aba==='abertas',retry:false,staleTime:VALIDADE_BUSCA,gcTime:30*60_000,
    initialData:salvo?.data,initialDataUpdatedAt:salvo?.em,
    queryFn:async({signal})=>{
      const r=await pesquisarIndice(efetiva!,pagina,signal)
      try{sessionStorage.setItem(CHAVE_RESULTADO,JSON.stringify({chave:chaveResultado,em:Date.now(),data:r}))}catch{/* armazenamento indisponível ou cheio */}
      return r
    },
  })
  // Órgãos da base rápida: só quando o usuário abre o seletor, e para a busca que está na tela (cada lista lê ~36 mil linhas do Turso).
  const [orgaosDe,setOrgaosDe]=useState<Filtros|null>(null)
  const orgaosQ=useQuery({
    queryKey:['oportunidades-orgaos',efetiva],enabled:!!efetiva&&orgaosDe===efetiva&&!!q.data?.orgaosSobDemanda,staleTime:30*60_000,gcTime:30*60_000,retry:0,
    queryFn:({signal})=>pesquisarOrgaos(efetiva!,signal),
  })
  const lista=q.data?.data??[],visiveis=lista
  const totalPaginas=Math.max(1,q.data?.totalPaginas??1)
  const catalogo=q.data?.catalogo
  const set=(k:keyof Filtros)=>(e:{target:{value:string}})=>setF(x=>({...x,[k]:e.target.value}))
  const fv=aplicarLiberacao(f,estados)
  const extras=(fv.portais.length!==PORTAIS.length?1:0)+(fv.modalidades.length!==modalidadesLiberadas(estados).length?1:0)+[fv.orgao,fv.minimo,fv.maximo,fv.itemMinimo,fv.itemMaximo,fv.maxItens,fv.naoDivulgado,fv.exclusivo,fv.excluirSrp,fv.excluir.trim(),fv.tipoItem,fv.modosDisputa.length].filter(Boolean).length
  function pesquisar(e?:FormEvent) {
    e?.preventDefault()
    try{validarFiltros(aplicarLiberacao(f,estados))}catch(erro){toast.error((erro as Error).message);return}
    setPagina(1)
    if(consulta&&JSON.stringify(f)===JSON.stringify(consulta)&&pagina===1)void q.refetch()
    else setConsulta({...f})
  }
  /** Período rápido: troca as datas do modo atual (próximos N dias na abertura, últimos N na publicação) e já pesquisa. */
  function escolherPeriodo(dias:number|null) {
    const novo:Filtros=fv.situacao==='publicacoes'?{...f,...periodoPublicacao(dias)}:{...f,situacao:'abertas',...periodoAbertura(dias)}
    setF(novo);setPagina(1);setConsulta(novo)
  }
  /** Tira um filtro aplicado e refaz a busca mantendo os demais. */
  function removerFiltro(remover:Partial<Filtros>) {
    if(!consulta)return
    const novo={...consulta,...remover}
    setF(x=>({...x,...remover}));setPagina(1);setConsulta(novo)
  }
  /** Encerrados nos últimos 30 dias (até ontem), os mais recentes primeiro. */
  function escolherEncerrados() {
    const novo={...f,situacao:'abertas' as const,...periodoEntre(-30,-1),inverter:true}
    setF(novo);setPagina(1);setConsulta(novo)
  }
  const encerradosAtual=(()=>{const p=periodoEntre(-30,-1);return p.aberturaDe===f.aberturaDe&&p.aberturaAte===f.aberturaAte})()
  // O botão aceso é o que bate exatamente com as datas da tela, inclusive quando o usuário digita as datas.
  const periodoAtual=periodoRapidoDe(fv)
  async function importar(c:CompraPNCP) {
    if(!empresaId){toast.error('Selecione a empresa para importar.');return}
    try{const p=await salvar.mutateAsync({dados:dadosProcesso(c,empresaId)});toast.success('Oportunidade importada.');navigate(`/app/processos/${p.id}`)}catch{/* useSalvar apresenta o erro */}
  }
  return <>
    <CabecalhoPagina titulo="Oportunidades" descricao="Encontre editais e consulte seus itens." acoes={<AtalhosOportunidades aoEscolher={usarAtalho} />} />
    {abas.length>1&&<div role="tablist" aria-label="Tipo de oportunidade" className="mb-4 flex w-full rounded-full border bg-card p-1 sm:inline-flex sm:w-auto">
      {abas.map(([id,rotulo])=><button key={id} type="button" role="tab" aria-selected={aba===id} onClick={()=>{setAba(id);setAtalho(undefined)}}
        className={`min-h-9 min-w-0 flex-1 rounded-full px-2 py-1 text-xs font-semibold leading-tight transition-colors sm:flex-none sm:px-4 sm:text-sm ${aba===id?'bg-primary text-primary-foreground':'text-muted-foreground hover:text-foreground'}`}>{rotulo}</button>)}
    </div>}
    {aba==='desertas'?<OportunidadesDesertas atalho={atalho} />:aba==='localizar'?<LocalizarEdital />:<>
    <Card className="mb-5 p-4">
      <form onSubmit={pesquisar} className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" aria-label="Pesquisar oportunidades" placeholder="O que sua empresa vende? Ex.: notebook; computador" value={f.busca} onChange={set('busca')} maxLength={300} /></div><Button type="submit" carregando={q.isFetching}>Buscar oportunidades</Button></div>
        <p className="text-xs text-muted-foreground">Busque pelo produto ou serviço. Use palavras juntas para combinar os termos ou separe por “;” para buscar alternativas. Os resultados respeitam os filtros selecionados.</p>
        <div className="flex flex-col gap-2 sm:flex-row"><FiltroLiberado id="filtro-publicacao" className="min-w-0 flex-1"><Select aria-label="Situação dos editais" value={fv.situacao} onChange={set('situacao')}><option value="abertas">Por data de abertura</option><option value="publicacoes">Por data de publicação</option></Select></FiltroLiberado><FiltroLiberado id="filtro-uf" className="min-w-0 flex-1"><SeletorEstados className="min-w-0" valor={ufsDe(fv)} aoMudar={ufs=>setF(x=>({...x,...comUfs(ufs)}))} aoAplicar={()=>pesquisar()} carregando={q.isFetching} /></FiltroLiberado><MenuFiltros ativos={extras} colunas={2} aoLimpar={()=>setF(x=>({...x,...filtrosExtras,busca:x.busca,aberturaDe:x.aberturaDe,aberturaAte:x.aberturaAte,diasUteis:x.diasUteis,inverter:x.inverter}))}
          rodape={fechar=><Button type="button" carregando={q.isFetching} onClick={()=>{fechar();pesquisar()}}>Aplicar e buscar</Button>}>
          <FiltrosOportunidades f={f} mudar={setF} compras={[]} orgaos={q.data?.orgaosSobDemanda?orgaosQ.data??[]:q.data?.orgaos??[]} aoAbrirOrgaos={()=>setOrgaosDe(efetiva)} carregandoOrgaos={orgaosQ.isFetching} />
        </MenuFiltros></div>
        {fv.situacao==='abertas'&&<>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período de abertura">
            {PERIODOS_ABERTURA.map(([d,rotulo])=><button key={rotulo} type="button" onClick={()=>escolherPeriodo(d)} aria-pressed={periodoAtual===d}
              className={`h-9 rounded-full border px-4 text-sm font-semibold transition-colors ${periodoAtual===d?'border-primary bg-primary text-primary-foreground':'bg-card text-muted-foreground hover:text-foreground'}`}>{rotulo}</button>)}
            <button type="button" onClick={escolherEncerrados} aria-pressed={encerradosAtual} title="Editais com abertura nos últimos 30 dias"
              className={`h-9 rounded-full border px-4 text-sm font-semibold transition-colors ${encerradosAtual?'border-primary bg-primary text-primary-foreground':'bg-card text-muted-foreground hover:text-foreground'}`}>Já encerrados</button>
            <FiltroLiberado id="filtro-dias-uteis"><button type="button" onClick={()=>{const novo={...f,diasUteis:!f.diasUteis};setF(novo);setPagina(1);setConsulta(novo)}} aria-pressed={f.diasUteis}
              className={`h-9 rounded-full border px-4 text-sm font-semibold transition-colors ${f.diasUteis?'border-emerald-500/60 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300':'bg-card text-muted-foreground hover:text-foreground'}`}>Só dias úteis</button></FiltroLiberado>
          </div>
          <div className="grid gap-3 sm:grid-cols-2"><Campo rotulo="Abertura a partir de" htmlFor="busca-abertura-de"><Input id="busca-abertura-de" type="date" value={f.aberturaDe} max={f.aberturaAte||undefined} onChange={set('aberturaDe')} /></Campo><Campo rotulo="Abertura até" htmlFor="busca-abertura-ate"><Input id="busca-abertura-ate" type="date" min={f.aberturaDe||undefined} value={f.aberturaAte} onChange={set('aberturaAte')} /></Campo></div>
          <p className="text-xs text-muted-foreground">Para ver editais já encerrados, escolha uma data passada. O histórico cobre os últimos 12 meses, sem dispensa e inexigibilidade.</p>
        </>}
        {fv.situacao==='publicacoes'&&<div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período de publicação">
          <span className="text-sm text-muted-foreground">Publicados nos últimos</span>
          {PERIODOS_PUBLICACAO.map(([d,rotulo])=><button key={rotulo} type="button" onClick={()=>escolherPeriodo(d)} aria-pressed={periodoAtual===d}
            className={`h-9 rounded-full border px-4 text-sm font-semibold transition-colors ${periodoAtual===d?'border-primary bg-primary text-primary-foreground':'bg-card text-muted-foreground hover:text-foreground'}`}>{rotulo}</button>)}
        </div>}
        {fv.situacao==='publicacoes'&&<div className="grid gap-3 sm:grid-cols-2"><Campo rotulo="Publicado desde" htmlFor="busca-inicio"><Input id="busca-inicio" type="date" required value={f.inicio} max={f.fim} onChange={set('inicio')} /></Campo><Campo rotulo="Publicado até" htmlFor="busca-fim"><Input id="busca-fim" type="date" required min={f.inicio} value={f.fim} onChange={set('fim')} /></Campo></div>}
      </form>
    </Card>
    {!consulta?<Vazio icone={Radar} titulo="Encontre sua próxima oportunidade" texto="Pesquise o produto ou serviço. Por padrão, a busca inclui o Brasil inteiro e editais recebendo propostas." />:<>
      {efetiva&&<div className="mb-2 flex flex-wrap items-center gap-1.5" aria-label="Filtros aplicados"><span className="mr-1 text-xs font-medium text-muted-foreground">Filtros aplicados:</span>{resumoFiltros(efetiva,modalidadesLiberadas(estados).length,PORTAIS.length).map(({rotulo,remover})=><span key={rotulo} className="inline-flex max-w-full items-center gap-1 rounded-full border border-emerald-500/60 bg-emerald-500/15 py-0.5 pl-2.5 pr-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
        <span className={`truncate ${remover?'':'pr-1.5'}`}>{rotulo}</span>
        {remover&&<button type="button" onClick={()=>removerFiltro(remover)} disabled={q.isFetching} aria-label={`Tirar o filtro ${rotulo}`} title="Tirar este filtro" className="grid h-5 w-5 shrink-0 place-items-center rounded-full transition-colors hover:bg-emerald-500/30 disabled:opacity-50"><X className="h-3.5 w-3.5" /></button>}
      </span>)}</div>}
      <div role="status" aria-live="polite" className="mb-4 space-y-2">
        {q.isFetching?<p className="text-sm text-muted-foreground">Pesquisando...</p>:q.isError?<div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive"><p>{q.error.message}</p><Button tamanho="sm" variante="contorno" onClick={()=>q.refetch()}>Tentar novamente</Button></div>:<div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{q.data?.totalLimitado?`Mais de ${(q.data.totalRegistros).toLocaleString('pt-BR')} oportunidades encontradas`:<>{(q.data?.totalRegistros??0).toLocaleString('pt-BR')} {(q.data?.totalRegistros??0)===1?'oportunidade encontrada':'oportunidades encontradas'}</>}</p>
          <BotaoInverterOrdem invertido={!!consulta.inverter} aoMudar={inverter=>{const novo={...consulta,inverter};setF(v=>({...v,inverter}));setPagina(1);setConsulta(novo)}}
            normal={consulta.situacao==='abertas'?'Mais próximas primeiro':'Mais recentes primeiro'} inverso={consulta.situacao==='abertas'?'Mais distantes primeiro':'Mais antigas primeiro'} /></div>}
        {catalogo?.ultima_coleta_em&&<p className="text-xs text-muted-foreground">Base atualizada em {new Date(catalogo.ultima_coleta_em).toLocaleString('pt-BR')}.</p>}
        {catalogo&&!catalogo.carga_inicial_concluida&&<p className="text-sm text-muted-foreground">A base está recebendo a carga inicial. {catalogo.editais_indexados.toLocaleString('pt-BR')} editais já estão disponíveis; a cobertura ainda é parcial.</p>}
        {q.data?.totalLimitado&&<p className="text-xs text-muted-foreground">Para ver todas, reduza o período ou use palavra-chave, UF ou órgão.</p>}
        {(q.data?.historico||(consulta&&buscaHistorica(consulta)))&&catalogo?.fonte==='turso'&&<p className="text-xs text-muted-foreground">Inclui editais encerrados (últimos 12 meses, sem dispensa e inexigibilidade; os itens só aparecem na página do edital).{catalogo.historico_ate==='pendente'?' O histórico começa a ser carregado hoje; por enquanto há só os encerrados dos últimos dias.':catalogo.historico_ate?` O histórico ainda está sendo carregado e vai, por enquanto, até editais publicados em ${new Date(`${catalogo.historico_ate}T12:00:00`).toLocaleDateString('pt-BR')}.`:''}</p>}
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
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">{c.dataEncerramentoProposta&&new Date(c.dataEncerramentoProposta).getTime()<Date.now()?<><span className="font-semibold">Disputa em {new Date(c.dataEncerramentoProposta).toLocaleDateString('pt-BR')}</span><Badge>Encerrado</Badge></>:<ContagemDisputa data={c.dataEncerramentoProposta} />}</div>
          <div className="mt-2 flex flex-wrap gap-2"><Badge className="gap-1.5"><IconePortal id={portalCompra(c)[0]} nome={portalCompra(c)[1]} />{portalCompra(c)[1]}</Badge><Badge>{c.unidadeOrgao.municipioNome}/{c.unidadeOrgao.ufSigla}</Badge><CodigoComprasnet compra={c} /></div>
          <div className="mt-3 flex flex-wrap items-center gap-3"><Link to={`${rotaOportunidade(c)}#itens`} state={{compra:c}} className="inline-flex h-8 items-center gap-2 rounded-full border border-input bg-card px-3.5 text-sm font-semibold hover:bg-muted"><Package className="h-4 w-4" />Ver itens</Link>{existente?<Link className="text-sm text-primary hover:underline" to={`/app/processos/${existente.id}`}>Abrir processo</Link>:podeEditar&&<RecursoLiberado id="recurso-importar-oportunidade"><Button tamanho="sm" disabled={processos.isLoading||processos.isError||salvar.isPending} onClick={()=>importar(c)}>Adicionar aos processos</Button></RecursoLiberado>}</div>
        </Card>
      })}</div>}
      {processos.isError&&<p role="alert" className="mt-3 text-sm text-destructive">Não foi possível verificar os processos já importados. <button className="underline" onClick={()=>processos.refetch()}>Tentar novamente</button></p>}
      {totalPaginas>1&&<div className="mt-5 flex items-center justify-between gap-2"><Button variante="contorno" disabled={pagina<=1} onClick={()=>setPagina(p=>p-1)}>Anterior</Button><span className="text-sm">{pagina} / {totalPaginas}</span><Button variante="contorno" disabled={pagina>=totalPaginas} onClick={()=>setPagina(p=>p+1)}>Próxima</Button></div>}
    </>}
    </>}
  </>
}
