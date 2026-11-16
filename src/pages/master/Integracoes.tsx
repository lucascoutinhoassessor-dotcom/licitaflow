import { useQuery } from '@tanstack/react-query'
import { Aviso, Badge, Button, CabecalhoPagina, Card, Carregando } from '@/components/ui'
import { InstalarApp } from '@/components/InstalarApp'
import { pagamentoAPI, NOMES_GATEWAY } from '@/lib/pagamentos'

export default function Integracoes() {
  const q=useQuery({queryKey:['gateways-config'],queryFn:()=>pagamentoAPI({acao:'configuracao'}),retry:false})
  return <><CabecalhoPagina titulo="Integrações e aplicativo" descricao="Status das conexões de pagamento. Credenciais são mantidas exclusivamente no servidor."/>
    {q.isLoading && <Carregando/>}{q.isError && <Aviso>{q.error.message} <button className="underline" onClick={()=>q.refetch()}>Consultar novamente</button></Aviso>}
    <div className="grid gap-4 sm:grid-cols-2">{q.data?.gateways.map((g:{id:string;credenciais:boolean;habilitado:boolean;configurado:boolean})=><Card key={g.id} className="space-y-3 p-5"><h2 className="font-semibold">{NOMES_GATEWAY[g.id]}</h2><Badge cor={g.credenciais && g.habilitado && g.configurado?'verde':'amarelo'}>{g.credenciais && g.habilitado && g.configurado?'Configuração disponível':'Ativação pendente'}</Badge><ul className="space-y-1 text-sm text-muted-foreground"><li>Credenciais: {g.credenciais?'Presentes':'Ausentes'}</li><li>Gateway: {g.habilitado?'Habilitado':'Desabilitado'}</li><li>Servidor: {g.configurado?'Configurado':'Configuração pendente'}</li></ul><p className="text-xs text-muted-foreground">A presença das variáveis não comprova autorização da conta. Valide uma transação no ambiente de teste antes de habilitar cobranças reais.</p></Card>)}</div>
    <Card className="mt-6 space-y-3 p-5"><h2 className="font-semibold">PNCP</h2><Badge cor="azul">Consulta pública disponível</Badge><p className="text-sm text-muted-foreground">O painel do cliente consulta publicações oficiais e importa oportunidades para seus processos. Nesta etapa, a consulta é manual.</p><a href="/app/oportunidades" className="inline-block text-sm text-primary hover:underline">Abrir oportunidades</a></Card>
    <InstalarApp/>
    <Button className="mt-5" variante="contorno" onClick={()=>q.refetch()}>Atualizar status</Button>
  </>
}
