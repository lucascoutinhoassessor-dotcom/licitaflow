import { useState,type FormEvent } from 'react'
import { useQuery,useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase,mensagemErro } from '@/lib/supabase'
import { formatarMoeda } from '@/lib/format'
import { useCatalogoPlanos,type PlanoCatalogo } from '@/hooks/useCatalogoPlanos'
import { Aviso,Badge,Button,CabecalhoPagina,Campo,Card,Carregando,Input,Modal } from '@/components/ui'

export default function Planos(){
  const q=useCatalogoPlanos()
  const qc=useQueryClient()
  const [edicao,setEdicao]=useState<PlanoCatalogo|'novo'|null>(null)
  const [f,setF]=useState({id:'',nome:'',mensal:'',anual:'',empresas:'',usuarios:'',processos:'',ativo:true})
  const [ocupado,setOcupado]=useState(false)
  const politica=useQuery({queryKey:['politicas-planos'],queryFn:async()=>{const {data,error}=await supabase.from('plataforma_politicas').select('aplicar_limites').single();if(error)throw error;return data.aplicar_limites as boolean}})
  function editar(p:PlanoCatalogo|'novo'){
    setEdicao(p)
    setF(p==='novo'?{id:'',nome:'',mensal:'',anual:'',empresas:'',usuarios:'',processos:'',ativo:true}:{id:p.id,nome:p.nome,mensal:String(p.mensal_centavos/100),anual:String(p.anual_centavos/100),empresas:p.limite_empresas==null?'':String(p.limite_empresas),usuarios:p.limite_usuarios==null?'':String(p.limite_usuarios),processos:p.limite_processos==null?'':String(p.limite_processos),ativo:p.ativo})
  }
  async function salvar(e:FormEvent){
    e.preventDefault();setOcupado(true)
    try{
      const limite=(s:string)=>s.trim()===''?null:Number(s)
      const {error}=await supabase.rpc('admin_salvar_plano',{p_id:f.id,p_nome:f.nome,p_mensal:Math.round(Number(f.mensal.replace(',','.'))*100),p_anual:Math.round(Number(f.anual.replace(',','.'))*100),p_empresas:limite(f.empresas),p_usuarios:limite(f.usuarios),p_processos:limite(f.processos),p_ativo:f.ativo})
      if(error)throw error
      await qc.invalidateQueries({queryKey:['catalogo-planos']});setEdicao(null);toast.success('Catálogo atualizado. Nenhuma cobrança foi emitida.')
    }catch(e){toast.error(mensagemErro(e))}finally{setOcupado(false)}
  }
  async function alternar(){
    if(!confirm(politica.data?'Desativar a aplicação de limites para novos cadastros?':'Ativar limites para novas empresas, usuários e processos? Registros existentes serão preservados.'))return
    setOcupado(true)
    try{const {error}=await supabase.rpc('admin_aplicar_limites',{p_aplicar:!politica.data});if(error)throw error;await qc.invalidateQueries({queryKey:['politicas-planos']});toast.success('Política atualizada e auditada.')}
    catch(e){toast.error(mensagemErro(e))}finally{setOcupado(false)}
  }
  return <><CabecalhoPagina titulo="Planos e limites" descricao="Catálogo comercial e limites aplicados no banco. Preços de catálogo não geram cobranças nem renovam assinaturas automaticamente." acoes={<Button onClick={()=>editar('novo')}>Novo plano</Button>}/>
    <Card className="mb-5 space-y-3 p-5"><h2 className="font-semibold">Política de limites</h2>{politica.isError?<Aviso>Política indisponível. Verifique a migração de planos.</Aviso>:<><p className="text-sm text-muted-foreground">{politica.isLoading?'Carregando…':politica.data?'Ativa: novas inserções respeitam os limites do plano.':'Desativada: limites são exibidos para acompanhamento, sem bloquear novas inserções.'}</p><Button variante="contorno" disabled={ocupado||politica.isLoading} onClick={alternar}>{politica.data?'Desativar limites':'Ativar limites'}</Button></>}</Card>
    {q.isLoading && <Carregando/>}{q.isError && <Aviso>Não foi possível carregar o catálogo. Verifique se a migração de planos foi aplicada.</Aviso>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{q.data?.map(p=><Card key={p.id} className="space-y-3 p-5"><div className="flex flex-wrap items-center gap-2"><h2 className="flex-1 font-semibold">{p.nome}</h2><Badge cor={p.ativo?'verde':'neutro'}>{p.ativo?'Público':'Oculto'}</Badge></div><p className="text-xs text-muted-foreground">{p.id}</p><p>{formatarMoeda(p.mensal_centavos/100)}/mês · {formatarMoeda(p.anual_centavos/100)}/ano</p><ul className="text-sm text-muted-foreground"><li>Empresas: {p.limite_empresas ?? 'Ilimitado'}</li><li>Usuários: {p.limite_usuarios ?? 'Ilimitado'}</li><li>Processos: {p.limite_processos ?? 'Ilimitado'}</li></ul><Button tamanho="sm" variante="contorno" onClick={()=>editar(p)}>Editar plano</Button></Card>)}</div>
    <Modal aberto={!!edicao} aoFechar={()=>{if(!ocupado)setEdicao(null)}} titulo={edicao==='novo'?'Novo plano':'Editar plano'}><form className="space-y-4" onSubmit={salvar}>
      <Campo rotulo="Identificador" htmlFor="pl-id"><Input id="pl-id" required pattern="[a-z0-9_]{3,40}" disabled={edicao!=='novo'} value={f.id} onChange={e=>setF({...f,id:e.target.value})}/></Campo><Campo rotulo="Nome" htmlFor="pl-nome"><Input id="pl-nome" required minLength={3} maxLength={80} value={f.nome} onChange={e=>setF({...f,nome:e.target.value})}/></Campo>
      <div className="grid gap-3 sm:grid-cols-2"><Campo rotulo="Preço mensal em R$" htmlFor="pl-mensal"><Input id="pl-mensal" required inputMode="decimal" value={f.mensal} onChange={e=>setF({...f,mensal:e.target.value})}/></Campo><Campo rotulo="Preço anual total em R$" htmlFor="pl-anual"><Input id="pl-anual" required inputMode="decimal" value={f.anual} onChange={e=>setF({...f,anual:e.target.value})}/></Campo></div>
      <p className="text-xs text-muted-foreground">Limite em branco significa ilimitado; zero impede novos registros quando a política estiver ativa.</p>
      {(['empresas','usuarios','processos'] as const).map(k=><Campo key={k} rotulo={`Limite de ${k}`} htmlFor={`pl-${k}`}><Input id={`pl-${k}`} type="number" min={0} step={1} value={f[k]} onChange={e=>setF({...f,[k]:e.target.value})}/></Campo>)}
      {!['trial','cancelado'].includes(f.id) && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.ativo} onChange={e=>setF({...f,ativo:e.target.checked})}/>Exibir no catálogo público</label>}
      <Button type="submit" carregando={ocupado}>Salvar plano</Button>
    </form></Modal>
  </>
}
