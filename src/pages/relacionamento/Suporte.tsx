import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/providers/AuthProvider'
import { supabase,mensagemErro } from '@/lib/supabase'
import { formatarDataHora } from '@/lib/format'
import { STATUS_CHAMADO,PRIORIDADE_CHAMADO } from '@/lib/relacionamento'
import { Aviso,Badge,Button,CabecalhoPagina,Campo,Card,Carregando,Input,Modal,Select,Textarea } from '@/components/ui'

interface Chamado {id:string;org_id:string;assunto:string;tipo:string;status:string;prioridade:string;nao_lido_master:boolean;nao_lido_cliente:boolean;updated_at:string}
interface Mensagem {id:string;texto:string;autor_nome:string;equipe:boolean;created_at:string}

export default function Suporte({master=false}:{master?:boolean}) {
  const {user}=useAuth()
  const qc=useQueryClient()
  const [status,setStatus]=useState('')
  const [busca,setBusca]=useState('')
  const [novo,setNovo]=useState(false)
  const [aberto,setAberto]=useState<Chamado|null>(null)
  const [texto,setTexto]=useState('')
  const [ocupado,setOcupado]=useState(false)
  const [edicao,setEdicao]=useState({status:'aberto',prioridade:'normal'})
  const [f,setF]=useState({org:'',assunto:'',texto:'',tipo:'suporte'})
  const orgs=useQuery({queryKey:master?['admin-orgs']:['suporte-orgs',user?.id],queryFn:async()=>{
    if(master){const {data,error}=await supabase.rpc('admin_organizacoes');if(error)throw error;return data as {id:string;nome:string}[]}
    const {data,error}=await supabase.from('memberships').select('organizations(id,nome)').eq('user_id',user!.id)
    if(error)throw error
    return (data ?? []).map((r:any)=>r.organizations).filter(Boolean) as {id:string;nome:string}[]
  }})
  const q=useQuery({queryKey:['suporte-chamados',master,user?.id,status],queryFn:async()=>{
    let query=supabase.from('suporte_chamados').select('*').order('updated_at',{ascending:false}).limit(100)
    if(status)query=query.eq('status',status)
    const {data,error}=await query;if(error)throw error;return data as Chamado[]
  }})
  const mensagens=useQuery({queryKey:['suporte-mensagens',aberto?.id],enabled:!!aberto,refetchInterval:aberto?15000:false,queryFn:async()=>{
    const {data,error}=await supabase.from('suporte_mensagens').select('*').eq('chamado_id',aberto!.id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(200)
    if(error)throw error;return (data as Mensagem[]).reverse()
  }})
  const ultima=mensagens.data?.length ? mensagens.data[mensagens.data.length-1].id : undefined
  useEffect(()=>{
    if(!aberto?.id || !ultima)return
    supabase.rpc('marcar_chamado_lido',{p_chamado:aberto.id}).then(({error})=>{if(!error)qc.invalidateQueries({queryKey:['suporte-chamados']})})
  },[aberto?.id,ultima,qc])
  const recarregar=async()=>{await qc.invalidateQueries({queryKey:['suporte-chamados']});await qc.invalidateQueries({queryKey:['suporte-mensagens']})}
  async function criar(e:FormEvent){
    e.preventDefault();setOcupado(true)
    try{
      const org=f.org || (orgs.data?.length===1?orgs.data[0].id:'')
      if(!org)throw new Error('Selecione sua organização.')
      const {error}=await supabase.rpc('abrir_chamado',{p_org:org,p_assunto:f.assunto,p_texto:f.texto,p_tipo:f.tipo})
      if(error)throw error
      await recarregar();setNovo(false);setF({org:'',assunto:'',texto:'',tipo:'suporte'});toast.success('Solicitação registrada.')
    }catch(e){toast.error(mensagemErro(e))}finally{setOcupado(false)}
  }
  async function responder(e:FormEvent){
    e.preventDefault();if(!aberto)return;setOcupado(true)
    try{const {error}=await supabase.rpc('responder_chamado',{p_chamado:aberto.id,p_texto:texto});if(error)throw error;setTexto('');await recarregar();setAberto({...aberto,status:master?'aguardando_cliente':'aberto'});toast.success('Resposta registrada.')}
    catch(e){toast.error(mensagemErro(e))}finally{setOcupado(false)}
  }
  async function atualizar(){
    if(!aberto)return
    if(edicao.status==='fechado' && !confirm('Fechar este chamado? Ele pode ser reaberto pela equipe.'))return
    setOcupado(true)
    try{const {error}=await supabase.rpc('admin_atualizar_chamado',{p_chamado:aberto.id,p_status:edicao.status,p_prioridade:edicao.prioridade});if(error)throw error;await recarregar();setAberto({...aberto,...edicao});toast.success('Atendimento atualizado.')}
    catch(e){toast.error(mensagemErro(e))}finally{setOcupado(false)}
  }
  const lista=(q.data ?? []).filter(c=>`${c.assunto} ${orgs.data?.find(o=>o.id===c.org_id)?.nome ?? ''}`.toLowerCase().includes(busca.trim().toLowerCase()))
  return <>
    {!master && <Link to="/app" className="mb-4 inline-block text-sm text-primary hover:underline">← Voltar ao painel</Link>}
    <CabecalhoPagina titulo={master?'Suporte e sugestões':'Atendimento do LicitaFlow'} descricao="Converse com a equipe e acompanhe o andamento. A lista mostra até 100 solicitações recentes por filtro." acoes={<><Button variante="contorno" onClick={()=>q.refetch()}>Atualizar</Button>{!master && <Button onClick={()=>setNovo(true)}>Nova solicitação</Button>}</>}/>
    <div className="mb-4 flex flex-col gap-3 sm:flex-row"><Input aria-label="Buscar solicitações nesta lista" placeholder="Buscar assunto ou organização nesta lista" value={busca} onChange={e=>setBusca(e.target.value)}/><Select className="sm:w-60" aria-label="Status do atendimento" value={status} onChange={e=>setStatus(e.target.value)}><option value="">Todos os status</option>{Object.entries(STATUS_CHAMADO).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select></div>
    {q.isLoading && <Carregando/>}{q.isError && <Aviso>Não foi possível carregar o atendimento. Tente atualizar a página.</Aviso>}
    <div className="space-y-3">{lista.map(c=><Card key={c.id} className="p-4"><button className="w-full space-y-2 text-left" onClick={()=>{setAberto(c);setEdicao({status:c.status,prioridade:c.prioridade});setTexto('')}}><div className="flex flex-wrap items-center gap-2"><h2 className="min-w-0 flex-1 font-semibold">{c.assunto}</h2><Badge cor="azul">{STATUS_CHAMADO[c.status]}</Badge>{(master?c.nao_lido_master:c.nao_lido_cliente) && <Badge cor="amarelo">Não lido</Badge>}</div><p className="text-sm text-muted-foreground">{orgs.data?.find(o=>o.id===c.org_id)?.nome} · {c.tipo==='sugestao'?'Sugestão':'Suporte'} · {PRIORIDADE_CHAMADO[c.prioridade]}</p><p className="text-xs text-muted-foreground">Atualizado em {formatarDataHora(c.updated_at)}</p></button></Card>)}</div>
    {!q.isLoading && !q.isError && !lista.length && <Card className="p-8 text-center text-sm text-muted-foreground">Nenhuma solicitação neste filtro.</Card>}
    <Modal aberto={novo} aoFechar={()=>{if(!ocupado)setNovo(false)}} titulo="Nova solicitação"><form onSubmit={criar} className="space-y-4">
      {orgs.isError && <Aviso>Não foi possível carregar suas organizações.</Aviso>}
      <Campo rotulo="Organização" htmlFor="sup-org"><Select id="sup-org" required value={f.org || (orgs.data?.length===1?orgs.data[0].id:'')} onChange={e=>setF({...f,org:e.target.value})}><option value="">Selecione</option>{orgs.data?.map(o=><option key={o.id} value={o.id}>{o.nome}</option>)}</Select></Campo>
      <Campo rotulo="Tipo" htmlFor="sup-tipo"><Select id="sup-tipo" value={f.tipo} onChange={e=>setF({...f,tipo:e.target.value})}><option value="suporte">Suporte</option><option value="sugestao">Sugestão</option></Select></Campo>
      <Campo rotulo="Assunto" htmlFor="sup-assunto"><Input id="sup-assunto" required minLength={3} maxLength={160} value={f.assunto} onChange={e=>setF({...f,assunto:e.target.value})}/></Campo>
      <Campo rotulo="Mensagem" htmlFor="sup-msg"><Textarea id="sup-msg" required minLength={2} maxLength={10000} rows={5} value={f.texto} onChange={e=>setF({...f,texto:e.target.value})}/></Campo>
      <p className="text-xs text-muted-foreground">Não inclua senhas, tokens ou chaves secretas na mensagem.</p><Button type="submit" carregando={ocupado}>Enviar solicitação</Button>
    </form></Modal>
    <Modal aberto={!!aberto} aoFechar={()=>{if(!ocupado)setAberto(null)}} titulo={aberto?.assunto ?? 'Atendimento'}>
      {master && <div className="mb-4 space-y-3 rounded border p-3"><Campo rotulo="Status" htmlFor="sup-status"><Select id="sup-status" value={edicao.status} onChange={e=>setEdicao({...edicao,status:e.target.value})}>{Object.entries(STATUS_CHAMADO).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select></Campo><Campo rotulo="Prioridade" htmlFor="sup-prio"><Select id="sup-prio" value={edicao.prioridade} onChange={e=>setEdicao({...edicao,prioridade:e.target.value})}>{Object.entries(PRIORIDADE_CHAMADO).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select></Campo><Button variante="contorno" disabled={ocupado} onClick={atualizar}>Atualizar atendimento</Button></div>}
      {mensagens.isLoading && <Carregando/>}{mensagens.isError && <Aviso>Não foi possível carregar as mensagens.</Aviso>}
      <p className="mb-3 text-xs text-muted-foreground">Histórico recente · até 200 mensagens</p><div className="space-y-3">{mensagens.data?.map(m=><div key={m.id} className={`rounded-lg border p-3 ${m.equipe?'bg-primary/5':'bg-muted/40'}`}><p className="text-xs font-semibold">{m.equipe?'Equipe LicitaFlow':m.autor_nome}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm">{m.texto}</p><p className="mt-2 text-xs text-muted-foreground">{formatarDataHora(m.created_at)}</p></div>)}</div>
      {aberto?.status!=='fechado' && <form onSubmit={responder} className="mt-4 space-y-3"><Campo rotulo="Responder" htmlFor="sup-resposta"><Textarea id="sup-resposta" rows={4} required minLength={2} maxLength={10000} value={texto} onChange={e=>setTexto(e.target.value)}/></Campo><Button type="submit" carregando={ocupado}>Enviar resposta</Button></form>}
    </Modal>
  </>
}
