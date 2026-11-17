import { useState,type FormEvent } from 'react'
import { Link,useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/providers/AuthProvider'
import { supabase,mensagemErro } from '@/lib/supabase'
import { InstalarApp } from '@/components/InstalarApp'
import { Aviso,Badge,Button,CabecalhoPagina,Campo,Card,Input } from '@/components/ui'
export default function Configuracoes(){
  const {user}=useAuth()
  const navegar=useNavigate()
  const [nome,setNome]=useState((user?.user_metadata?.nome as string) ?? '')
  const [salvando,setSalvando]=useState(false)
  const [encerrando,setEncerrando]=useState(false)
  const conexao=useQuery({queryKey:['master-config-conexao',user?.id],queryFn:async()=>{const {data,error}=await supabase.rpc('is_platform_admin');if(error)throw error;return data===true},retry:false})
  async function salvar(e:FormEvent){
    e.preventDefault();setSalvando(true)
    try{
      const {error}=await supabase.auth.updateUser({data:{nome:nome.trim()}});if(error)throw error
      const {error:perfil}=await supabase.from('profiles').update({nome:nome.trim()}).eq('id',user!.id);if(perfil)throw perfil
      toast.success('Nome atualizado.')
    }catch(e){toast.error(mensagemErro(e))}finally{setSalvando(false)}
  }
  async function encerrar(){
    if(!confirm('Encerrar suas sessões em todos os dispositivos? Será necessário entrar novamente.'))return
    setEncerrando(true)
    try{const {error}=await supabase.auth.signOut({scope:'global'});if(error)throw error;navegar('/master/entrar',{replace:true})}
    catch(e){toast.error(mensagemErro(e));setEncerrando(false)}
  }
  return <><CabecalhoPagina titulo="Configurações do Console" descricao="Seu perfil administrativo, sessões e pontos de configuração da plataforma."/>
    <div className="grid gap-5 lg:grid-cols-2"><Card className="space-y-4 p-5"><h2 className="font-semibold">Perfil do administrador</h2><form onSubmit={salvar} className="space-y-4"><Campo rotulo="Nome" htmlFor="master-nome"><Input id="master-nome" required minLength={2} maxLength={120} value={nome} onChange={e=>setNome(e.target.value)}/></Campo><Campo rotulo="E-mail de acesso" htmlFor="master-email"><Input id="master-email" value={user?.email ?? ''} disabled/></Campo><Button type="submit" carregando={salvando}>Salvar nome</Button></form></Card>
      <Card className="space-y-4 p-5"><h2 className="font-semibold">Acesso e sessões</h2>{conexao.isError?<Aviso>Não foi possível verificar sua conexão administrativa.</Aviso>:<Badge cor={conexao.data?'verde':'amarelo'}>{conexao.isLoading?'Verificando…':conexao.data?'Conexão e acesso master confirmados':'Acesso não confirmado'}</Badge>}<div className="flex flex-wrap gap-3"><Button variante="contorno" onClick={()=>conexao.refetch()}>Verificar conexão</Button><Button variante="perigo" carregando={encerrando} onClick={encerrar}>Encerrar todas as minhas sessões</Button></div><p className="text-xs text-muted-foreground">Você pode administrar permissões de outras pessoas na área Usuários. A ação acima atua somente nas suas sessões.</p></Card>
      <Card className="space-y-3 p-5 lg:col-span-2"><h2 className="font-semibold">Configurações da plataforma</h2><div className="grid gap-3 text-sm sm:grid-cols-2"><Link className="rounded border p-4 text-primary hover:underline" to="/master/planos">Catálogo de planos e limites de uso →</Link><Link className="rounded border p-4 text-primary hover:underline" to="/master/integracoes">Gateways e status das integrações →</Link><Link className="rounded border p-4 text-primary hover:underline" to="/master/conteudo">Textos e contato da landing page →</Link><Link className="rounded border p-4 text-primary hover:underline" to="/master/auditoria">Histórico de ações administrativas →</Link></div></Card>
    </div><InstalarApp/>
  </>
}
