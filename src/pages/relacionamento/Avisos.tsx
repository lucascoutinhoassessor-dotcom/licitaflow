import { useEffect, useState, type FormEvent } from 'react'
import { useQuery,useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/providers/AuthProvider'
import { supabase,mensagemErro } from '@/lib/supabase'
import { formatarDataHora } from '@/lib/format'
import { ativarPush,desativarPush,descreverAparelho,enviarPushAviso,estadoPush,explicarErroPush,precisaInstalar,testarPush,type EstadoPush } from '@/lib/push'
import { Aviso,Badge,Button,CabecalhoPagina,Campo,Card,Carregando,Input,Modal,Textarea } from '@/components/ui'
import { TIPOS_LOG,type LogPlataforma } from '@/lib/logsPlataforma'

interface Comunicado {id:string;titulo:string;texto:string;org_id:string|null;org_ids:string[]|null;ativo:boolean;expira_em:string|null;created_at:string;publicar_em:string;enviar_push:boolean;push_enviado_em:string|null}
const FORM_VAZIO={titulo:'',texto:'',dest:'todos' as 'todos'|'alguns',orgs:[] as string[],busca:'',quando:'agora' as 'agora'|'agendar',data:'',push:true,expira:''}
/** Agora no formato do campo datetime-local, no fuso do aparelho. */
const agoraLocal=()=>{const d=new Date();d.setSeconds(0,0);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}

export default function Avisos({master=false}:{master?:boolean}) {
  const {user}=useAuth()
  const qc=useQueryClient()
  const [novo,setNovo]=useState(false)
  const [ocupado,setOcupado]=useState(false)
  const [f,setF]=useState(FORM_VAZIO)
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
  const nomeOrg=(id:string)=>orgs.data?.find(o=>o.id===id)?.nome ?? 'Cliente'
  const encontradas=(orgs.data ?? []).filter(o=>o.nome.toLowerCase().includes(f.busca.trim().toLowerCase()))
  function destinatarios(a:Comunicado){
    if(a.org_ids?.length)return a.org_ids.length<=3?a.org_ids.map(nomeOrg).join(', '):`${a.org_ids.length} clientes`
    return a.org_id?orgs.data?.find(o=>o.id===a.org_id)?.nome ?? 'Organização selecionada':'Todos os clientes'
  }
  async function publicar(e:FormEvent){
    e.preventDefault()
    if(f.dest==='alguns' && !f.orgs.length){toast.error('Escolha pelo menos um cliente.');return}
    const quando=f.quando==='agendar'?new Date(f.data):null
    if(quando && (isNaN(quando.getTime()) || quando.getTime()<Date.now()-60000)){toast.error('Escolha uma data e um horário futuros para o envio.');return}
    if(f.expira && new Date(f.expira).getTime()<=(quando?.getTime() ?? Date.now())){toast.error('A expiração deve ser depois do envio.');return}
    const para=f.dest==='todos'?'todos os clientes':f.orgs.length===1?nomeOrg(f.orgs[0]):`${f.orgs.length} clientes`
    const como=f.push?'no painel e por push':'só no painel, sem push'
    if(!confirm(quando?`Agendar este aviso para ${para}, ${como}, em ${formatarDataHora(quando.toISOString())}?`:`Publicar agora este aviso para ${para}, ${como}?`))return
    setOcupado(true)
    try{
      const {data:id,error}=await supabase.rpc('admin_publicar_aviso',{p_titulo:f.titulo,p_texto:f.texto,p_orgs:f.dest==='alguns'?f.orgs:null,p_publicar_em:quando?.toISOString() ?? null,p_push:f.push,p_expira_em:f.expira?new Date(f.expira).toISOString():null})
      if(error)throw error
      await qc.invalidateQueries({queryKey:['plataforma-avisos']});setNovo(false);setF(FORM_VAZIO)
      if(quando){toast.success(`Aviso agendado para ${formatarDataHora(quando.toISOString())}.${f.push?' O push sai automaticamente nesse horário.':''}`);return}
      if(!f.push){toast.success('Aviso publicado no painel, sem push.');return}
      try{const r=await enviarPushAviso(String(id))
        if(r.falhas)toast.warning(`Aviso publicado. Push entregue a ${r.enviados} e recusado em ${r.falhas} ${r.falhas===1?'aparelho':'aparelhos'}.`,{description:[...new Set((r.erros??[]).map(x=>explicarErroPush(x.status)))].join(' · '),duration:15000})
        else toast.success(r.enviados?`Aviso publicado e enviado por push para ${r.enviados} ${r.enviados===1?'aparelho':'aparelhos'}.`:'Aviso publicado no painel. Nenhum aparelho com notificações ativadas para receber o push.')}
      catch(e){toast.error(`Aviso publicado no painel, mas o push falhou: ${mensagemErro(e)}`)}
    }
    catch(e){toast.error(mensagemErro(e))}finally{setOcupado(false)}
  }
  const [push,setPush]=useState<EstadoPush|null>(null)
  useEffect(()=>{if(!master)estadoPush().then(setPush).catch(()=>setPush('inativo'))},[master])
  async function alternarPush(){
    setOcupado(true)
    try{if(push==='ativo'){await desativarPush();setPush('inativo');toast.success('Notificações desativadas neste aparelho.')}else{const e=await ativarPush();setPush(e);if(e==='negado')toast.error('As notificações estão bloqueadas. Libere nas configurações do navegador para este site.')}}
    catch(e){toast.error(mensagemErro(e))}finally{setOcupado(false)}
  }
  const [testando,setTestando]=useState(false)
  async function testar(){
    setTestando(true)
    try{
      const r=await testarPush()
      if(!r.resultados.length){toast.error('Nenhum aparelho seu com notificações ativadas. Abra o app no celular ou no computador e ative as notificações em Avisos.');return}
      const linhas=r.resultados.map(x=>`${x.ok?'✓':'✗'} ${descreverAparelho(x.aparelho)}: ${x.ok?'entregue ao serviço de push':explicarErroPush(x.status)}`)
      const desc=<div className="space-y-0.5">{linhas.map((l,i)=><p key={i}>{l}</p>)}{r.enviados>0 && <p className="pt-1">Se a notificação não apareceu num aparelho marcado com ✓, o bloqueio está nele: notificações do navegador nas configurações do sistema, modo Não Perturbe ou economia de bateria.</p>}</div>
      ;(r.falhas?toast.warning:toast.success)(`Teste enviado: ${r.enviados} de ${r.resultados.length} ${r.resultados.length===1?'aparelho':'aparelhos'}.`,{description:desc,duration:20000})
    }catch(e){toast.error(mensagemErro(e))}finally{setTestando(false)}
  }
  async function excluir(id:string){
    if(!confirm('Excluir o aviso de vez? Ele some do painel dos clientes e do histórico. Notificações já entregues nos aparelhos não são apagadas.'))return
    setOcupado(true)
    try{const {error}=await supabase.rpc('admin_excluir_aviso',{p_aviso:id});if(error)throw error;await qc.invalidateQueries({queryKey:['plataforma-avisos']});toast.success('Aviso excluído.')}
    catch(e){toast.error(mensagemErro(e))}finally{setOcupado(false)}
  }
  async function arquivar(id:string,agendado:boolean){
    if(!confirm(agendado?'Cancelar o agendamento? O aviso não será publicado e o push não será enviado.':'Arquivar o aviso? Ele deixará de aparecer para os clientes.'))return
    setOcupado(true)
    try{const {error}=await supabase.rpc('admin_arquivar_aviso',{p_aviso:id});if(error)throw error;await qc.invalidateQueries({queryKey:['plataforma-avisos']});toast.success(agendado?'Agendamento cancelado.':'Aviso arquivado.')}
    catch(e){toast.error(mensagemErro(e))}finally{setOcupado(false)}
  }
  async function marcar(id:string){
    setOcupado(true)
    try{const {error}=await supabase.from('aviso_leituras').upsert({aviso_id:id,user_id:user!.id},{onConflict:'aviso_id,user_id',ignoreDuplicates:true});if(error)throw error;await qc.invalidateQueries({queryKey:['aviso-leituras']})}
    catch(e){toast.error(mensagemErro(e))}finally{setOcupado(false)}
  }
  return <><CabecalhoPagina titulo={master?'Avisos aos clientes':'Avisos do LicitaFlow'} descricao={master?'Publique agora ou agende data e horário, para todos ou para clientes escolhidos. Quem ativou as notificações recebe o aviso por push.':'Comunicados no painel, com histórico recente de até 100 avisos. Quem ativa as notificações recebe cada aviso na hora, por push.'} acoes={<><Button variante="contorno" onClick={()=>q.refetch()}>Atualizar</Button>{(master||push==='ativo') && <Button variante="contorno" carregando={testando} onClick={testar}>Testar push</Button>}{master && <Button onClick={()=>setNovo(true)}>Publicar aviso</Button>}</>}/>
    {q.isLoading && <Carregando/>}{q.isError && <Aviso>Não foi possível consultar os avisos. Tente atualizar a página.</Aviso>}{leituras.isError && <Aviso>Não foi possível consultar seus registros de leitura.</Aviso>}
    {!master && push && push!=='sem-suporte' && <Card className="mb-4 flex flex-wrap items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="font-medium">{push==='ativo'?'Notificações ativadas neste aparelho':'Receber os avisos na hora'}</p><p className="text-sm text-muted-foreground">{push==='negado'?'As notificações deste site estão bloqueadas. Libere nas configurações do navegador e toque em Ativar.':push==='ativo'?'Cada aviso novo chega como notificação, mesmo com o app fechado.':'Ative para receber cada aviso como notificação no celular ou no computador, mesmo com o app fechado.'}</p></div><Button tamanho="sm" variante={push==='ativo'?'contorno':'primario'} carregando={ocupado} onClick={alternarPush}>{push==='ativo'?'Desativar':'Ativar notificações'}</Button></Card>}
    {!master && push==='sem-suporte' && precisaInstalar() && <div className="mb-4"><Aviso>No iPhone, as notificações só funcionam com o LicitaFlow instalado: toque em Compartilhar → Adicionar à Tela de Início e abra por lá.</Aviso></div>}
    <div className="space-y-4">{q.data?.map(a=>{
      const expirado=!!a.expira_em && new Date(a.expira_em)<new Date()
      const lido=leituras.data?.includes(a.id)
      const agendado=new Date(a.publicar_em)>new Date()
      return <Card key={a.id} className="space-y-3 p-5"><div className="flex flex-wrap items-center gap-2"><h2 className="min-w-0 flex-1 font-semibold">{a.titulo}</h2>{master?<>
          {a.ativo && agendado?<Badge cor="amarelo">Agendado · {formatarDataHora(a.publicar_em)}</Badge>:<Badge cor={a.ativo&&!expirado?'verde':'neutro'}>{!a.ativo?(agendado?'Cancelado':'Arquivado'):expirado?'Expirado':'Publicado'}</Badge>}
          <Badge cor={a.enviar_push&&a.push_enviado_em?'azul':'neutro'}>{!a.enviar_push?'Sem push':a.push_enviado_em?'Push enviado':'Push pendente'}</Badge>
        </>:<Badge cor={lido?'neutro':'azul'}>{lido?'Lido':'Não lido'}</Badge>}</div>
        <p className="whitespace-pre-wrap text-sm">{a.texto}</p>
        <p className="text-xs text-muted-foreground">{master?`Criado ${formatarDataHora(a.created_at)}${!agendado && Math.abs(new Date(a.publicar_em).getTime()-new Date(a.created_at).getTime())>60000?` · publicado ${formatarDataHora(a.publicar_em)}`:''} · ${destinatarios(a)}`:formatarDataHora(a.publicar_em)}{a.expira_em?` · expira ${formatarDataHora(a.expira_em)}`:''}</p>
        {master && <div className="flex flex-wrap gap-2">{a.ativo && <Button tamanho="sm" variante="contorno" disabled={ocupado} onClick={()=>arquivar(a.id,agendado)}>{agendado?'Cancelar agendamento':'Arquivar'}</Button>}<Button tamanho="sm" variante="perigo" disabled={ocupado} onClick={()=>excluir(a.id)}>Excluir</Button></div>}
        {!master && !lido && <Button tamanho="sm" variante="contorno" disabled={ocupado||leituras.isError} onClick={()=>marcar(a.id)}>Marcar como lido</Button>}</Card>
    })}</div>{!q.isLoading && !q.isError && !q.data?.length && <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum aviso disponível.</Card>}
    {!master && <AtualizacoesPlataforma/>}
    <Modal aberto={novo} aoFechar={()=>{if(!ocupado)setNovo(false)}} titulo="Publicar aviso"><form onSubmit={publicar} className="space-y-4">
      <fieldset className="space-y-2"><legend className="mb-1 text-sm font-medium">Destinatários</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name="av-dest" checked={f.dest==='todos'} onChange={()=>setF({...f,dest:'todos'})}/>Todos os clientes</label>
          <label className="flex items-center gap-2"><input type="radio" name="av-dest" checked={f.dest==='alguns'} onChange={()=>setF({...f,dest:'alguns'})}/>Clientes escolhidos</label>
        </div>
        {f.dest==='alguns' && <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center gap-2"><Input aria-label="Buscar cliente" placeholder="Buscar cliente…" value={f.busca} onChange={e=>setF({...f,busca:e.target.value})}/><span className="shrink-0 text-xs text-muted-foreground">{f.orgs.length} {f.orgs.length===1?'escolhido':'escolhidos'}</span></div>
          <div className="flex gap-3 text-xs"><button type="button" className="text-primary hover:underline" onClick={()=>setF({...f,orgs:[...new Set([...f.orgs,...encontradas.map(o=>o.id)])]})}>Marcar {f.busca.trim()?'os encontrados':'todos'}</button><button type="button" className="text-primary hover:underline" onClick={()=>setF({...f,orgs:[]})}>Limpar</button></div>
          <div className="max-h-48 space-y-1 overflow-y-auto">{encontradas.map(o=><label key={o.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted"><input type="checkbox" checked={f.orgs.includes(o.id)} onChange={e=>setF({...f,orgs:e.target.checked?[...f.orgs,o.id]:f.orgs.filter(x=>x!==o.id)})}/><span className="truncate">{o.nome}</span></label>)}
            {orgs.isLoading && <p className="px-1 text-sm text-muted-foreground">Carregando clientes…</p>}
            {orgs.data && !encontradas.length && <p className="px-1 text-sm text-muted-foreground">Nenhum cliente encontrado.</p>}</div>
        </div>}
      </fieldset>
      {orgs.isError && <Aviso>Não foi possível carregar as organizações. Tente novamente antes de publicar.</Aviso>}
      <Campo rotulo="Título" htmlFor="av-titulo"><Input id="av-titulo" required minLength={3} maxLength={160} value={f.titulo} onChange={e=>setF({...f,titulo:e.target.value})}/></Campo>
      <Campo rotulo="Comunicado" htmlFor="av-texto"><Textarea id="av-texto" required minLength={3} maxLength={5000} rows={5} value={f.texto} onChange={e=>setF({...f,texto:e.target.value})}/></Campo>
      <fieldset className="space-y-2"><legend className="mb-1 text-sm font-medium">Quando enviar</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name="av-quando" checked={f.quando==='agora'} onChange={()=>setF({...f,quando:'agora'})}/>Agora</label>
          <label className="flex items-center gap-2"><input type="radio" name="av-quando" checked={f.quando==='agendar'} onChange={()=>setF({...f,quando:'agendar',data:f.data||agoraLocal()})}/>Agendar data e horário</label>
        </div>
        {f.quando==='agendar' && <Input aria-label="Data e horário do envio" type="datetime-local" required min={agoraLocal()} value={f.data} onChange={e=>setF({...f,data:e.target.value})}/>}
        {f.quando==='agendar' && <p className="text-xs text-muted-foreground">O aviso fica oculto para os clientes até esse horário{f.push?' e o push sai automaticamente, com até 1 minuto de diferença.':'.'}</p>}
      </fieldset>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" checked={f.push} onChange={e=>setF({...f,push:e.target.checked})}/><span><span className="font-medium">Enviar notificação push</span><span className="block text-xs text-muted-foreground">Chega no celular ou no computador de quem ativou as notificações, mesmo com o app fechado.</span></span></label>
      <Campo rotulo="Expiração (opcional)" htmlFor="av-expira"><Input id="av-expira" type="datetime-local" value={f.expira} onChange={e=>setF({...f,expira:e.target.value})}/></Campo>
      <Button type="submit" carregando={ocupado} disabled={orgs.isError}>{f.quando==='agendar'?'Agendar aviso':'Publicar agora'}</Button>
    </form></Modal>
  </>
}

/** Logs que o master marcou como públicos: o que mudou na plataforma. */
function AtualizacoesPlataforma(){
  const q=useQuery({queryKey:['plataforma-logs-publicos'],queryFn:async()=>{const {data,error}=await supabase.from('plataforma_logs').select('id,tipo,titulo,texto,created_at').eq('publico',true).order('created_at',{ascending:false}).limit(30);if(error)throw error;return data as Pick<LogPlataforma,'id'|'tipo'|'titulo'|'texto'|'created_at'>[]}})
  if(!q.data?.length)return null
  return <section className="mt-8"><h2 className="mb-3 text-lg font-semibold">Atualizações da plataforma</h2><div className="space-y-3">{q.data.map(l=><Card key={l.id} className="space-y-1.5 p-4"><div className="flex flex-wrap items-center gap-2"><Badge cor={TIPOS_LOG[l.tipo][1]}>{TIPOS_LOG[l.tipo][0]}</Badge><span className="text-xs text-muted-foreground">{formatarDataHora(l.created_at)}</span></div><h3 className="font-medium">{l.titulo}</h3>{l.texto&&<p className="whitespace-pre-wrap text-sm text-muted-foreground">{l.texto}</p>}</Card>)}</div></section>
}
