import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {supabase} from '@/lib/supabase'
import {Badge,Button,Card} from '@/components/ui'
import type {StatusCatalogo} from '@/lib/buscaIndice'
interface Status {ativo:boolean;agendado:boolean;catalogo:StatusCatalogo;fila:number;pedidos_em_andamento:number;aguardando_tentativa:number}
export default function StatusColeta(){
 const client=useQueryClient()
 const status=useQuery({queryKey:['admin-catalogo-oportunidades'],queryFn:async()=>{const{data,error}=await supabase.rpc('admin_catalogo_oportunidades');if(error)throw new Error('Não foi possível consultar a atualização do catálogo.');return data as Status},refetchInterval:30_000,retry:false})
 const alterar=useMutation({mutationFn:async(ativo:boolean)=>{const{error}=await supabase.rpc('admin_catalogo_oportunidades',{p_ativo:ativo});if(error)throw new Error('Não foi possível alterar o coletor.');},onSuccess:()=>client.invalidateQueries({queryKey:['admin-catalogo-oportunidades']})})
 const c=status.data?.catalogo
 return <Card className="mt-6 space-y-3 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Catálogo de oportunidades</h2>{status.data&&<Badge cor={status.data.ativo&&status.data.agendado?'verde':'amarelo'}>{status.data.ativo&&status.data.agendado?'Atualização automática ativa':'Atualização não ativa'}</Badge>}</div>
 <p className="text-sm text-muted-foreground">As pesquisas consultam o índice. A coleta e a atualização dos itens acontecem em segundo plano.</p>
 {status.isError&&<p role="alert" className="text-sm text-destructive">{status.error.message}</p>}
 {c&&<><div className="grid gap-3 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Editais indexados</p><p className="text-xl font-semibold">{c.editais_indexados.toLocaleString('pt-BR')}</p></div><div><p className="text-xs text-muted-foreground">Com itens coletados</p><p className="text-xl font-semibold">{c.editais_com_itens.toLocaleString('pt-BR')}</p></div><div><p className="text-xs text-muted-foreground">Na fila de atualização</p><p className="text-xl font-semibold">{status.data?.fila.toLocaleString('pt-BR')}</p></div></div><p className="text-sm">{c.carga_inicial_concluida?'Carga inicial de editais concluída.':`Carga inicial em andamento: ${c.paginas_coletadas} de ${c.paginas_planejadas} páginas recebidas.`}</p><p className="text-xs text-muted-foreground">Última coleta: {c.ultima_coleta_em?new Date(c.ultima_coleta_em).toLocaleString('pt-BR'):'Aguardando primeira atualização'}</p>{c.aviso&&<p className="text-sm text-amber-700">{c.aviso}</p>}</>}
 {(status.data?.aguardando_tentativa??0)>0&&<p className="text-sm text-amber-700">Há {status.data?.aguardando_tentativa} pedidos aguardando nova tentativa na fonte.</p>}
 {alterar.isError&&<p role="alert" className="text-sm text-destructive">{alterar.error.message}</p>}
 <div className="flex flex-wrap gap-3"><Button tamanho="sm" variante="contorno" onClick={()=>status.refetch()}>Atualizar status do catálogo</Button>{status.data?.agendado&&<Button tamanho="sm" variante="contorno" carregando={alterar.isPending} onClick={()=>alterar.mutate(!status.data!.ativo)}>{status.data.ativo?'Pausar atualização':'Retomar atualização'}</Button>}<a href="/app/oportunidades" className="self-center text-sm text-primary hover:underline">Abrir oportunidades</a></div>
 </Card>
}
