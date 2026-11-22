import { useEffect, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CalendarClock, ExternalLink, Globe, Info, MapPin, Package, Search, SearchX, TriangleAlert } from 'lucide-react'
import MenuFiltros, { ChipFiltro, SecaoFiltro } from '@/components/MenuFiltros'
import { Badge, Button, Card, Input, Vazio } from '@/components/ui'
import BotaoInverterOrdem from '@/components/BotaoInverterOrdem'
import IconePortal from '@/components/IconePortal'
import CodigoComprasnet from '@/components/CodigoComprasnet'
import { codigoComprasnet, portalCompra, PORTAIS } from '@/lib/portais'
import { useRecursos } from '@/hooks/useModulos'
import { modalidadesLiberadas } from '@/lib/filtrosLiberacao'
import { RecursoLiberado } from '@/components/RecursoLiberado'
import { linkCompra, rotaOportunidade } from '@/lib/pncp'
import { formatarData, formatarMoeda } from '@/lib/format'
import { FILTROS_DESERTAS, nomeSituacao, PERIODOS_DESERTAS, pesquisarDesertas, type CompraDeserta, type FiltrosDesertas } from '@/lib/desertas'

const CHAVE='lf-desertas-busca'
function lerSalvo():{f:FiltrosDesertas;pagina:number}{
  try{
    const s=JSON.parse(sessionStorage.getItem(CHAVE)??'null')
    if(s&&typeof s.f==='object'&&s.f)return {f:{...FILTROS_DESERTAS,...s.f},pagina:Number.isInteger(s.pagina)&&s.pagina>0?s.pagina:1}
  }catch{/* armazenamento indisponível */}
  return {f:FILTROS_DESERTAS,pagina:1}
}
const UFS='AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')

/** Editais com itens desertos ou fracassados nas sessões recentes: chance de oferecer o produto ao órgão. */
export default function OportunidadesDesertas({atalho}:{atalho?:{portal:string;vez:number}}) {
  const [inicial]=useState(lerSalvo)
  const [f,setF]=useState<FiltrosDesertas>(inicial.f),[consulta,setConsulta]=useState<FiltrosDesertas>(inicial.f),[pagina,setPagina]=useState(inicial.pagina)
  useEffect(()=>{try{sessionStorage.setItem(CHAVE,JSON.stringify({f:consulta,pagina}))}catch{/* armazenamento indisponível */}},[consulta,pagina])
  const {estados,estado}=useRecursos(),porPortal=estado('recurso-sem-vencedor-portal')==='liberado'
  // Portal só entra na busca quando o master liberou o filtro de portal para o cliente.
  const efetiva=porPortal?consulta:{...consulta,portal:''},liberadas=modalidadesLiberadas(estados)
  const q=useQuery({queryKey:['oportunidades-desertas',efetiva,pagina,liberadas],enabled:estados!==null,retry:1,staleTime:5*60_000,queryFn:({signal})=>pesquisarDesertas(efetiva,pagina,signal,liberadas)})
  const aplicar=(novo:FiltrosDesertas)=>{setF(novo);setPagina(1);setConsulta(novo)}
  // Atalho do menu (ex.: "Sem vencedor no Portal de Compras Públicas"): troca o portal e pesquisa.
  useEffect(()=>{if(atalho)aplicar({...f,portal:atalho.portal})},[atalho?.vez]) // eslint-disable-line react-hooks/exhaustive-deps
  function pesquisar(e:FormEvent){e.preventDefault();if(JSON.stringify(f)===JSON.stringify(consulta)&&pagina===1)void q.refetch();else aplicar({...f})}
  const lista=q.data?.data??[],total=q.data?.totalRegistros??0,totalPaginas=Math.max(1,q.data?.totalPaginas??1)
  const ativos=(f.tipo?1:0)+(f.uf?1:0)+(porPortal&&f.portal?1:0)
  const chip=(ativo:boolean)=>`h-9 rounded-full border px-4 text-sm font-semibold transition-colors ${ativo?'border-primary bg-primary text-primary-foreground':'bg-card text-muted-foreground hover:text-foreground'}`
  return <>
    <Card className="mb-5 p-4">
      <form onSubmit={pesquisar} className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" aria-label="Pesquisar desertas" placeholder="O que sua empresa vende? Ex.: papel A4; toner" value={f.busca} onChange={e=>setF(x=>({...x,busca:e.target.value}))} maxLength={300} /></div><Button type="submit" carregando={q.isFetching}>Buscar desertas</Button></div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Sessões realizadas nos últimos">
            <span className="text-sm text-muted-foreground">Sessões nos últimos</span>
            {PERIODOS_DESERTAS.map(([d,rotulo])=><button key={d} type="button" aria-pressed={f.dias===d} onClick={()=>aplicar({...f,dias:d})} className={chip(f.dias===d)}>{rotulo}</button>)}
          </div>
          <MenuFiltros className="sm:ml-auto" colunas={2} ativos={ativos} aoLimpar={()=>aplicar({...f,tipo:'',uf:'',portal:''})}>
            <SecaoFiltro icone={TriangleAlert} cor="ambar" titulo="Situação dos itens" descricao="Deserto: ninguém propôs. Fracassado: nenhuma proposta aceita">
              <div className="grid grid-cols-3 gap-1.5">{([['','Os dois'],['4','Só desertos'],['5','Só fracassados']] as const).map(([id,rotulo])=>
                <ChipFiltro key={id} ativo={f.tipo===id} onClick={()=>aplicar({...f,tipo:id})} className="rounded-md">{rotulo}</ChipFiltro>)}</div>
            </SecaoFiltro>
            <SecaoFiltro icone={MapPin} cor="azul" titulo="Estado do órgão" descricao={f.uf?`Só ${f.uf}`:'Brasil inteiro'}>
              <div className="grid grid-cols-6 gap-1.5"><ChipFiltro ativo={!f.uf} onClick={()=>aplicar({...f,uf:''})} className="col-span-2 rounded-md">Todos</ChipFiltro>{UFS.map(u=>
                <ChipFiltro key={u} ativo={f.uf===u} onClick={()=>aplicar({...f,uf:u})} className="rounded-md px-1">{u}</ChipFiltro>)}</div>
            </SecaoFiltro>
            <RecursoLiberado id="recurso-sem-vencedor-portal"><SecaoFiltro icone={Globe} cor="verde" titulo="Portal" descricao="Onde a compra foi publicada">
              <div className="grid grid-cols-2 gap-1.5"><ChipFiltro ativo={!f.portal} onClick={()=>aplicar({...f,portal:''})} className="justify-start rounded-md">Todos os portais</ChipFiltro>{PORTAIS.map(([id,nome])=>
                <ChipFiltro key={id} title={nome} ativo={f.portal===id} onClick={()=>aplicar({...f,portal:id})} className="justify-start rounded-md text-left"><IconePortal id={id} nome={nome} /><span className="line-clamp-2 min-w-0 leading-tight">{nome}</span></ChipFiltro>)}</div>
            </SecaoFiltro></RecursoLiberado>
          </MenuFiltros>
        </div>
      </form>
    </Card>
    <div className="mb-4 flex gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <p><strong>Deserto</strong>: ninguém apresentou proposta. <strong>Fracassado</strong>: houve propostas, mas nenhuma foi aceita. O órgão costuma repetir a compra em nova licitação ou contratar direto por dispensa, mantidas as condições do edital (Lei 14.133/2021, art. 75, III, até 1 ano depois). Procure o setor de compras do órgão e acompanhe a republicação.</p>
    </div>
    <div role="status" aria-live="polite" className="mb-4 space-y-1">
      {q.isFetching?<p className="text-sm text-muted-foreground">Pesquisando...</p>:q.isError?<div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive"><p>{q.error.message}</p><Button tamanho="sm" variante="contorno" onClick={()=>q.refetch()}>Tentar novamente</Button></div>
        :<div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{total} {total===1?'edital com itens sem vencedor':'editais com itens sem vencedor'}</p>
          <BotaoInverterOrdem invertido={consulta.inverter} aoMudar={inverter=>aplicar({...consulta,inverter})} normal="Sessões mais recentes primeiro" inverso="Sessões mais antigas primeiro" /></div>}
      <p className="text-xs text-muted-foreground">Cada edital é conferido no PNCP 2, 7 e 20 dias depois da sessão. O resultado depende de o órgão registrar a situação dos itens.</p>
    </div>
    {!q.isFetching&&!q.isError&&lista.length===0?<Vazio icone={SearchX} titulo="Nenhuma deserta encontrada" texto="Experimente outro termo, outra UF ou um período maior. As verificações começam 2 dias depois de cada sessão." />
      :<div className="space-y-3">{lista.map(c=><CartaoDeserta key={c.numeroControlePNCP} c={c} />)}</div>}
    {totalPaginas>1&&<div className="mt-5 flex items-center justify-between gap-2"><Button variante="contorno" disabled={pagina<=1} onClick={()=>setPagina(p=>p-1)}>Anterior</Button><span className="text-sm">{pagina} / {totalPaginas}</span><Button variante="contorno" disabled={pagina>=totalPaginas} onClick={()=>setPagina(p=>p+1)}>Próxima</Button></div>}
  </>
}

function CartaoDeserta({c}:{c:CompraDeserta}) {
  const [todos,setTodos]=useState(false)
  const itens=todos?c.itensDesertos:c.itensDesertos.slice(0,3)
  return <Card className="p-4">
    <h2 className="line-clamp-2 break-words text-sm font-semibold sm:text-base"><Link to={rotaOportunidade(c)} state={{compra:c}} className="text-sky-700 underline-offset-2 hover:underline dark:text-sky-300">{c.modalidadeNome} Nº {codigoComprasnet(c)?.numero??c.numeroCompra} – {c.orgaoEntidade.razaoSocial} / {c.unidadeOrgao.ufSigla}</Link></h2>
    <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">{c.objetoCompra}</p>
    <div className="mt-2.5 flex flex-wrap items-center gap-2">
      {c.desertos>0&&<Badge cor="amarelo">{c.desertos} {c.desertos===1?'item deserto':'itens desertos'}</Badge>}
      {c.fracassados>0&&<Badge cor="vermelho">{c.fracassados} {c.fracassados===1?'item fracassado':'itens fracassados'}</Badge>}
      {c.valorDesertos?<Badge>Estimado nesses itens: {formatarMoeda(c.valorDesertos)}</Badge>:null}
      <Badge cor="verde">{c.modalidadeNome}</Badge>
    </div>
    <div className="mt-2.5 flex items-center gap-1.5 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-muted-foreground" />Sessão em {formatarData(c.dataEncerramentoProposta)}</div>
    <ul className="mt-3 divide-y rounded-lg border text-sm">
      {itens.map(i=><li key={i.numeroItem} className="flex flex-col gap-1 p-2.5 sm:flex-row sm:items-start sm:gap-3">
        <span className={`w-fit shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${i.situacao===4?'bg-amber-500/15 text-amber-800 dark:text-amber-200':'bg-red-500/15 text-red-700 dark:text-red-300'}`}>Item {i.numeroItem} · {nomeSituacao(i.situacao)}</span>
        <span title={i.descricao||undefined} className="line-clamp-3 min-w-0 flex-1 break-words sm:line-clamp-none">{i.descricao||'Sem descrição'}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{i.quantidade!=null&&`${i.quantidade.toLocaleString('pt-BR')} ${i.unidadeMedida??''}`}{i.orcamentoSigiloso?' · valor sigiloso':i.valorUnitarioEstimado?` · ${formatarMoeda(i.valorUnitarioEstimado)} un.`:''}{i.tipoBeneficio===1?' · exclusivo ME/EPP':''}</span>
      </li>)}
    </ul>
    {c.itensDesertos.length>3&&<button type="button" className="mt-2 text-sm text-primary hover:underline" onClick={()=>setTodos(v=>!v)}>{todos?'Mostrar menos':`Ver mais ${c.itensDesertos.length-3} itens`}</button>}
    {c.desertos+c.fracassados>c.itensDesertos.length&&todos&&<p className="mt-1 text-xs text-muted-foreground">Mostrando os {c.itensDesertos.length} primeiros. Veja todos na página do edital.</p>}
    <div className="mt-3 flex flex-wrap items-center gap-2"><Badge className="gap-1.5"><IconePortal id={portalCompra(c)[0]} nome={portalCompra(c)[1]} />{portalCompra(c)[1]}</Badge><Badge>{c.unidadeOrgao.municipioNome}/{c.unidadeOrgao.ufSigla}</Badge><CodigoComprasnet compra={c} /></div>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <Link to={`${rotaOportunidade(c)}#itens`} state={{compra:c}} className="inline-flex h-8 items-center gap-2 rounded-full border border-input bg-card px-3.5 text-sm font-semibold hover:bg-muted"><Package className="h-4 w-4" />Ver edital e itens</Link>
      <a href={linkCompra(c)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><ExternalLink className="h-4 w-4" />Abrir no PNCP</a>
    </div>
  </Card>
}
