import { useState, type FormEvent } from 'react'
import { useQuery,useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/providers/AuthProvider'
import { supabase,mensagemErro } from '@/lib/supabase'
import { formatarDataHora } from '@/lib/format'
import { Aviso,Badge,Button,CabecalhoPagina,Campo,Card,Carregando,Input,Modal,Select,Textarea } from '@/components/ui'

interface Comunicado {id:string;titulo:string;texto:string;org_id:string|null;ativo:boolean;expira_em:string|null;created_at:string}
export default function Avisos({master=false}:{master?:boolean}) {
  const {user}=useAuth()
  const qc=useQueryClient()
  const [novo,setNovo]=useState(false)
  const [ocupado,setOcupado]=useState(false)
  const [f,setF]=useState({titulo:'',texto:'',org:'',expira:''})
  const q=useQuery({queryKey:['plataforma-avisos',master,user?.id],queryFn:async()=>{
    const {data,error}=await supabase.from('plataforma_avisos').select('*').order('created_at',{ascending:false}).limit(100)
    if(error)throw error;return data as Comunicado[]
  }})
  const ids=(q.data ?? []).map(a=>a.id)
  const leituras=useQuery({queryKey:['aviso-leituras',user?.id,ids],enabled:!master && ids.length>0,queryFn:async()=>{
    const {data,error}=await supabase.from('aviso_leituras').select('aviso_id').eq('user_id',user!.id).in('aviso_id',ids)
    if(error)throw error;return (data ?? []).map(r=>r.aviso_id)
  }})
  const orgs=useQuery({queryKey:['admin-orgs'],enabled:master,queryFn:async()=>{
    const {data,error}=await supabase.rpc('admin_organizacoes');if(error)throw error;return data as {id:string;nome:string}[]
  }})
  async function publicar(e:FormEvent){
    e.preventDefault()
    if(!confirm(f.org?'Publicar este aviso para a organização selecionada?':'Publicar este aviso para todos os clientes?'))return
    setOcupado(true)
    try{const {error}=await supabase.rpc('admin_publicar_aviso',{p_titulo:f.titulo,p_texto:f.texto,p_org:f.org||null,p_expira_em:f.expira?new Date(f.expira).toISOString():null});if(error)throw error;await qc.invalidateQueries({queryKey:['plataforma-avisos']});setNovo(false);setF({titulo:'',texto:'',org:'',expira:''});toast.success('Aviso publicado no painel dos clientes.')}
    catch(e){toast.error(mensagemErro(e))}finally{setOcupado(false)}
  }
  async function arquivar(id:string){
    if(!confirm('Arquivar o aviso? Ele deixará de aparecer para os clientes.'))return
    setOcupado(true)
    try{const {error}=await supabase.rpc('admin_arquivar_aviso',{p_aviso:id});if(error)throw error;await qc.invalidateQueries({queryKey:['plataforma-avisos']});toast.success('Aviso arquivado.')}
    catch(e){toast.error(mensagemErro(e))}finally{setOcupado(false)}
  }
  async function marcar(id:string){
    setOcupado(true)
    try{const {error}=await supabase.from('aviso_leituras').upsert({aviso_id:id,user_id:user!.id},{onConflict:'aviso_id,user_id',ignoreDuplicates:true});if(error)throw error;await qc.invalidateQueries({queryKey:['aviso-leituras']})}
    catch(e){toast.error(mensagemErro(e))}finally{setOcupado(false)}
  }
  return <><CabecalhoPagina titulo={master?'Avisos aos clientes':'Avisos do LicitaFlow'} descricao="Comunicados no painel, com histórico recente de até 100 avisos. Não há envio de e-mail ou push nesta etapa." acoes={<><Button variante="contorno" onClick={()=>q.refetch()}>Atualizar</Button>{master && <Button onClick={()=>setNovo(true)}>Publicar aviso</Button>}</>}/>
    {q.isLoading && <Carregando/>}{q.isError && <Aviso>Não foi possível consultar os avisos. Tente atualizar a página.</Aviso>}{leituras.isError && <Aviso>Não foi possível consultar seus registros de leitura.</Aviso>}
    <div className="space-y-4">{q.data?.map(a=>{
      const expirado=!!a.expira_em && new Date(a.expira_em)<new Date()
      const lido=leituras.data?.includes(a.id)
      return <Card key={a.id} className="space-y-3 p-5"><div className="flex flex-wrap items-center gap-2"><h2 className="min-w-0 flex-1 font-semibold">{a.titulo}</h2>{master?<Badge cor={a.ativo&&!expirado?'verde':'neutro'}>{!a.ativo?'Arquivado':expirado?'Expirado':'Publicado'}</Badge>:<Badge cor={lido?'neutro':'azul'}>{lido?'Lido':'Não lido'}</Badge>}</div><p className="whitespace-pre-wrap text-sm">{a.texto}</p><p className="text-xs text-muted-foreground">{formatarDataHora(a.created_at)}{master?` · ${a.org_id?orgs.data?.find(o=>o.id===a.org_id)?.nome ?? 'Organização selecionada':'Todos os clientes'}`:''}{a.expira_em?` · expira ${formatarDataHora(a.expira_em)}`:''}</p>{master && a.ativo && <Button tamanho="sm" variante="contorno" disabled={ocupado} onClick={()=>arquivar(a.id)}>Arquivar</Button>}{!master && !lido && <Button tamanho="sm" variante="contorno" disabled={ocupado||leituras.isError} onClick={()=>marcar(a.id)}>Marcar como lido</Button>}</Card>
    })}</div>{!q.isLoading && !q.isError && !q.data?.length && <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum aviso disponível.</Card>}
    <Modal aberto={novo} aoFechar={()=>{if(!ocupado)setNovo(false)}} titulo="Publicar aviso"><form onSubmit={publicar} className="space-y-4">
      <Campo rotulo="Destinatários" htmlFor="av-org"><Select id="av-org" value={f.org} onChange={e=>setF({...f,org:e.target.value})}><option value="">Todos os clientes</option>{orgs.data?.map(o=><option key={o.id} value={o.id}>{o.nome}</option>)}</Select></Campo>
      {orgs.isError && <Aviso>Não foi possível carregar as organizações. Tente novamente antes de publicar.</Aviso>}
      <Campo rotulo="Título" htmlFor="av-titulo"><Input id="av-titulo" required minLength={3} maxLength={160} value={f.titulo} onChange={e=>setF({...f,titulo:e.target.value})}/></Campo>
      <Campo rotulo="Comunicado" htmlFor="av-texto"><Textarea id="av-texto" required minLength={3} maxLength={5000} rows={6} value={f.texto} onChange={e=>setF({...f,texto:e.target.value})}/></Campo>
      <Campo rotulo="Expiração (opcional)" htmlFor="av-expira"><Input id="av-expira" type="datetime-local" value={f.expira} onChange={e=>setF({...f,expira:e.target.value})}/></Campo>
      <Button type="submit" carregando={ocupado} disabled={orgs.isError}>Publicar no painel</Button>
    </form></Modal>
  </>
}
