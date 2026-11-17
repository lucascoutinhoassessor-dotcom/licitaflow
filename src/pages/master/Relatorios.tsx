import { useQuery } from '@tanstack/react-query'
import { supabase,mensagemErro } from '@/lib/supabase'
import { ETAPAS,MODALIDADES } from '@/lib/dominio'
import { baixarCSV } from '@/lib/relacionamento'
import { Aviso,Badge,Button,CabecalhoPagina,Card,Carregando } from '@/components/ui'
interface Relatorio {por_etapa:{etapa:string;quantidade:number}[];por_modalidade:{modalidade:string;quantidade:number}[];prazos_atrasados:number;documentos_vencidos:number;importados_pncp:number;clientes:{nome:string;plano:string;suspensa:boolean;processos:number;ganhos:number}[]}
export default function Relatorios(){
  const q=useQuery({queryKey:['admin-relatorio-operacao'],queryFn:async()=>{const {data,error}=await supabase.rpc('admin_relatorio_operacao');if(error)throw error;return data as Relatorio}})
  if(q.isLoading)return <Carregando/>
  if(q.isError)return <Aviso>{mensagemErro(q.error)} <button className="underline" onClick={()=>q.refetch()}>Tentar novamente</button></Aviso>
  const r=q.data!
  return <><CabecalhoPagina titulo="Relatórios operacionais" descricao="Consolidado real de todas as organizações. Processos ganhos não representam recebimento financeiro." acoes={<Button variante="contorno" onClick={()=>q.refetch()}>Atualizar</Button>}/>
    <div className="mb-6 grid gap-3 sm:grid-cols-3">{[['Prazos atrasados',r.prazos_atrasados],['Documentos vencidos',r.documentos_vencidos],['Processos importados do PNCP',r.importados_pncp]].map(([t,v])=><Card key={t} className="p-5"><p className="text-sm text-muted-foreground">{t}</p><p className="text-3xl font-semibold">{v}</p></Card>)}</div>
    <div className="mb-6 grid gap-5 md:grid-cols-2"><Card className="p-5"><h2 className="mb-3 font-semibold">Funil da plataforma</h2>{r.por_etapa.map(e=><p key={e.etapa} className="flex justify-between gap-3 py-2 text-sm"><span>{ETAPAS[e.etapa] ?? e.etapa}</span><strong>{e.quantidade}</strong></p>)}{!r.por_etapa.length && <p className="text-sm text-muted-foreground">Nenhum processo registrado.</p>}</Card><Card className="p-5"><h2 className="mb-3 font-semibold">Modalidades</h2>{r.por_modalidade.map(m=><p key={m.modalidade} className="flex justify-between gap-3 py-2 text-sm"><span>{MODALIDADES[m.modalidade] ?? m.modalidade}</span><strong>{m.quantidade}</strong></p>)}</Card></div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Organizações com mais processos · até 100</h2><Button tamanho="sm" variante="contorno" disabled={!r.clientes.length} onClick={()=>baixarCSV('licitaflow-operacao.csv',r.clientes,[{chave:'nome',rotulo:'Organização'},{chave:'plano',rotulo:'Plano'},{chave:'suspensa',rotulo:'Suspensa'},{chave:'processos',rotulo:'Processos'},{chave:'ganhos',rotulo:'Ganhos'}])}>Exportar CSV</Button></div>
    <Card className="divide-y">{r.clientes.map((c,i)=><div key={`${i}-${c.nome}`} className="flex flex-col justify-between gap-2 p-4 sm:flex-row sm:items-center"><div><p className="font-medium">{c.nome}</p><p className="text-xs text-muted-foreground">{c.plano} {c.suspensa && <Badge cor="vermelho">Suspensa</Badge>}</p></div><p className="text-sm">{c.processos} processos · {c.ganhos} ganhos</p></div>)}</Card>
  </>
}
