import { useQuery } from '@tanstack/react-query'
import { useOrg } from '@/providers/OrgProvider'
import { supabase } from '@/lib/supabase'
import { formatarMoeda } from '@/lib/format'
import { ETAPAS } from '@/lib/dominio'
import { baixarCSV } from '@/lib/relacionamento'
import { RecursoLiberado } from '@/components/RecursoLiberado'
import { Aviso,Button,CabecalhoPagina,Card,Carregando } from '@/components/ui'
interface Relatorio {processos:number;contratos:number;prazos_atrasados:number;documentos_vencidos:number;recebido:number;a_receber:number;por_etapa:{etapa:string;quantidade:number}[]}
export default function Relatorios(){
  const {org,empresa}=useOrg()
  const q=useQuery({queryKey:['relatorio-cliente',org?.id,empresa?.id],enabled:!!org,queryFn:async()=>{const {data,error}=await supabase.rpc('relatorio_cliente',{p_org:org!.id,p_empresa:empresa?.id ?? null});if(error)throw error;return data as Relatorio}})
  if(q.isLoading)return <Carregando/>
  if(q.isError)return <Aviso>Não foi possível carregar os relatórios. <button className="underline" onClick={()=>q.refetch()}>Tentar novamente</button></Aviso>
  const r=q.data;if(!r)return null
  const linhas=r.por_etapa.map(e=>({etapa:ETAPAS[e.etapa] ?? e.etapa,quantidade:e.quantidade}))
  return <><CabecalhoPagina titulo="Relatórios" descricao={`Dados da operação · ${empresa?.nome_fantasia || empresa?.razao_social || 'Todas as empresas da organização'}. Os totais são calculados no banco.`} acoes={<><Button variante="contorno" onClick={()=>q.refetch()}>Atualizar</Button><RecursoLiberado id="recurso-exportar-csv"><Button disabled={!linhas.length} onClick={()=>baixarCSV('licitaflow-funil.csv',linhas,[{chave:'etapa',rotulo:'Etapa'},{chave:'quantidade',rotulo:'Quantidade'}])}>Exportar funil CSV</Button></RecursoLiberado></>}/>
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">{[['Processos',r.processos],['Contratos',r.contratos],['Prazos atrasados',r.prazos_atrasados],['Documentos vencidos',r.documentos_vencidos],['Recebido nos contratos',formatarMoeda(r.recebido)],['A receber nos contratos',formatarMoeda(r.a_receber)]].map(([t,v])=><Card key={t} className="p-5"><p className="text-sm text-muted-foreground">{t}</p><p className="mt-2 text-2xl font-semibold">{v}</p></Card>)}</div>
    <Card className="p-5"><h2 className="mb-3 font-semibold">Funil de processos</h2>{linhas.map(e=><p className="flex justify-between gap-3 border-b py-3 text-sm" key={e.etapa}><span>{e.etapa}</span><strong>{e.quantidade}</strong></p>)}{!linhas.length && <p className="text-sm text-muted-foreground">Nenhum processo registrado.</p>}</Card>
    <p className="mt-4 text-xs text-muted-foreground">Os valores financeiros se referem às suas notas fiscais em contratos, não a cobranças da assinatura do LicitaFlow.</p>
  </>
}
