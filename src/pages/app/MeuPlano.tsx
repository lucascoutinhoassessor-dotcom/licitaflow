import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useOrg } from '@/providers/OrgProvider'
import { supabase } from '@/lib/supabase'
import type { PlanoCatalogo } from '@/hooks/useCatalogoPlanos'
import { formatarData,formatarMoeda } from '@/lib/format'
import { Aviso,Badge,CabecalhoPagina,Card,Carregando } from '@/components/ui'
import { AssinaturaPainel } from '@/components/AssinaturaPainel'
import { UsoIAPlano } from '@/components/UsoIAPlano'
export default function MeuPlano(){
  const {org,podeAdministrar}=useOrg()
  const q=useQuery({queryKey:['plano-cliente',org?.id],enabled:!!org,queryFn:async()=>{const {data,error}=await supabase.rpc('plano_cliente',{p_org:org!.id});if(error)throw error;return data as {plano:PlanoCatalogo;aplicar_limites:boolean;empresas:number;usuarios:number;processos:number}}})
  if(q.isLoading)return <Carregando/>
  if(q.isError)return <Aviso>Não foi possível carregar seu plano. <button className="underline" onClick={()=>q.refetch()}>Tentar novamente</button></Aviso>
  const r=q.data;if(!r)return null
  return <><CabecalhoPagina titulo="Meu plano e uso" descricao="Acompanhe o plano da sua organização e os limites contratados."/><Card className="mb-5 space-y-3 p-5"><h2 className="text-xl font-semibold">{r.plano.nome}</h2>{org?.plano==='trial'?<p className="text-sm">Teste grátis até {formatarData(org.trial_ate)}</p>:<p className="text-sm">Preço atual de catálogo: {formatarMoeda(r.plano.mensal_centavos/100)}/mês ou {formatarMoeda(r.plano.anual_centavos/100)}/ano.</p>}<Badge>{r.aplicar_limites?'Limites ativos para novos registros':'Acompanhamento de uso'}</Badge></Card>
    <div className="grid gap-3 sm:grid-cols-3">{[['empresas','Empresas'],['usuarios','Usuários'],['processos','Processos']].map(([k,t])=>{const usado=r[k] as number;const limite=r.plano[`limite_${k}`] as number|null;return <Card className="space-y-2 p-5" key={k}><h2 className="text-sm text-muted-foreground">{t}</h2><p className="text-2xl font-semibold">{usado} <span className="text-sm text-muted-foreground">/ {limite ?? 'ilimitado'}</span></p>{limite!==null && usado>=limite && <p className="text-xs text-warning">Limite alcançado. Seus dados existentes estão preservados.</p>}</Card>})}</div>
    {org && <UsoIAPlano org={org.id}/>}
    <div className="mt-6">{podeAdministrar && org ? <AssinaturaPainel org={org.id}/> : <Aviso tipo="info">Somente o dono ou um administrador da organização contrata ou altera o plano.</Aviso>}</div>
    <Link to="/suporte" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">Dúvidas sobre o plano? Fale com o atendimento →</Link>
  </>
}
