import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Aviso, Badge, Button, CabecalhoPagina, Campo, Card, Carregando, Input, Modal, Select } from '@/components/ui'
import { supabase, mensagemErro } from '@/lib/supabase'
import { formatarData, formatarMoeda } from '@/lib/format'
import { pagamentoAPI, NOMES_GATEWAY, type Cobranca } from '@/lib/pagamentos'
import { AssinaturaPainel } from '@/components/AssinaturaPainel'
import { useOrg } from '@/providers/OrgProvider'

/** Só no app do cliente (dentro do OrgProvider): a assinatura da organização ativa. */
function AssinaturaDaOrg() {
  const {org}=useOrg()
  return org ? <div className="mb-6"><AssinaturaPainel org={org.id}/></div> : null
}

export default function Cobrancas({ master=false }: {master?:boolean}) {
  const qc=useQueryClient()
  const [novo,setNovo]=useState(false)
  const [ocupado,setOcupado]=useState('')
  const [f,setF]=useState({org:'',descricao:'Acesso LicitaForce',valor:'',vencimento:'',gateway:'stripe'})
  const q=useQuery({queryKey:['plataforma-cobrancas',master],queryFn:async()=>{
    const {data,error}=await supabase.from('plataforma_cobrancas').select('*').order('created_at',{ascending:false}).limit(200)
    if(error) throw error
    return data as Cobranca[]
  }})
  const orgs=useQuery({queryKey:['admin-orgs'],enabled:master,queryFn:async()=>{const {data,error}=await supabase.rpc('admin_organizacoes');if(error)throw error;return data as {id:string;nome:string}[]}})
  const [verificar,setVerificar]=useState<Cobranca|null>(null)
  const [retorno,setRetorno]=useState({slug:'',transaction_nsu:''})
  const recarregar=()=>qc.invalidateQueries({queryKey:['plataforma-cobrancas']})
  async function criar(e:React.FormEvent) {
    e.preventDefault();setOcupado('novo')
    try {
      const centavos=Math.round(Number(f.valor.replace(',','.'))*100)
      if(!Number.isSafeInteger(centavos)||centavos<100) throw new Error('Informe valor válido, a partir de R$ 1,00.')
      const {error}=await supabase.rpc('admin_criar_cobranca',{p_org:f.org,p_descricao:f.descricao,p_valor_centavos:centavos,p_vencimento:f.vencimento,p_gateway:f.gateway})
      if(error)throw error
      await recarregar();setNovo(false);toast.success('Cobrança registrada. Gere o checkout quando o gateway estiver configurado.')
    } catch(e){toast.error(mensagemErro(e))}finally{setOcupado('')}
  }
  async function acao(c:Cobranca,tipo:'checkout'|'verificar') {
    setOcupado(c.id)
    try {
      const r=await pagamentoAPI({acao:tipo,id:c.id,...retorno})
      toast.success(tipo==='checkout'?'Checkout gerado. O link está disponível na cobrança.':r.pago?'Pagamento confirmado pelo provedor.':'O provedor ainda não confirmou o pagamento.')
      await recarregar();setVerificar(null)
    }catch(e){toast.error(mensagemErro(e))}finally{setOcupado('')}
  }
  const lista=q.data ?? []
  const recebido=lista.filter(c=>c.status==='paga').reduce((v,c)=>v+c.valor_centavos,0)
  const aberto=lista.filter(c=>c.status!=='paga').reduce((v,c)=>v+c.valor_centavos,0)
  return <>{!master && <Link className="mb-4 inline-block text-sm text-primary hover:underline" to="/app">← Voltar ao painel</Link>}<CabecalhoPagina titulo={master?'Financeiro da plataforma':'Cobranças do LicitaForce'} descricao={master?'Cobranças avulsas (fora da assinatura). Os totais consideram os 200 registros mais recentes.':'Sua assinatura, as faturas e cobranças avulsas da organização.'} acoes={master && <Button onClick={()=>setNovo(true)}>Nova cobrança</Button>}/>
    {!master && <AssinaturaDaOrg/>}
    {!master && <h2 className="mb-3 font-semibold">Cobranças avulsas</h2>}
    {master && <div className="mb-5 grid gap-3 sm:grid-cols-2"><Card className="p-5"><p className="text-sm text-muted-foreground">Pagamentos confirmados</p><p className="text-2xl font-semibold">{formatarMoeda(recebido/100)}</p></Card><Card className="p-5"><p className="text-sm text-muted-foreground">Em aberto / preparação</p><p className="text-2xl font-semibold">{formatarMoeda(aberto/100)}</p></Card></div>}
    {q.isLoading && <Carregando/>}{q.isError && <Aviso>Não foi possível carregar cobranças. Confira se a migração de pagamentos foi aplicada. <button className="underline" onClick={()=>q.refetch()}>Tentar novamente</button></Aviso>}
    <div className="space-y-3">{lista.map(c=><Card key={c.id} className="space-y-3 p-5"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{c.descricao}</h2><Badge cor={c.status==='paga'?'verde':'amarelo'}>{c.status}</Badge></div>{master && <p className="text-sm text-muted-foreground">{orgs.data?.find(o=>o.id===c.org_id)?.nome ?? c.org_id}</p>}<p>{formatarMoeda(c.valor_centavos/100)} · {NOMES_GATEWAY[c.gateway]} · vence {formatarData(c.vencimento)}</p><div className="flex flex-wrap items-center gap-3">
      {c.checkout_url && <a className="text-sm text-primary hover:underline" href={c.checkout_url} target="_blank" rel="noopener noreferrer">{c.status==='paga'?'Consultar checkout':'Abrir pagamento'}</a>}
      {master && c.status==='rascunho' && <Button tamanho="sm" disabled={!!ocupado} onClick={()=>acao(c,'checkout')}>Gerar checkout</Button>}
      {master && c.checkout_url && c.status!=='paga' && <Button tamanho="sm" variante="contorno" disabled={!!ocupado} onClick={()=>{setRetorno({slug:'',transaction_nsu:''});setVerificar(c)}}>Conferir no provedor</Button>}
      {c.status==='revisao' && <p className="text-sm text-destructive">Confira a operação no gateway antes de emitir outra cobrança.</p>}
    </div></Card>)}</div>{!q.isLoading && !q.isError && !lista.length && <Card className="p-8 text-center text-sm text-muted-foreground">Nenhuma cobrança registrada.</Card>}
    <p className="mt-4 text-xs text-muted-foreground">Cobranças avulsas não alteram o plano. Pagamentos de links Asaas são confirmados sozinhos pelo webhook; nos demais gateways, use “Conferir no provedor”.</p>
    <Modal aberto={novo} aoFechar={()=>{if(!ocupado)setNovo(false)}} titulo="Nova cobrança da plataforma"><form className="space-y-4" onSubmit={criar}>
      <Campo rotulo="Cliente" htmlFor="cb-org"><Select id="cb-org" required value={f.org} onChange={e=>setF({...f,org:e.target.value})}><option value="">Selecione</option>{orgs.data?.map(o=><option key={o.id} value={o.id}>{o.nome}</option>)}</Select></Campo>
      <Campo rotulo="Descrição" htmlFor="cb-desc"><Input id="cb-desc" required minLength={3} maxLength={200} value={f.descricao} onChange={e=>setF({...f,descricao:e.target.value})}/></Campo>
      <Campo rotulo="Valor em R$" htmlFor="cb-valor"><Input id="cb-valor" inputMode="decimal" required value={f.valor} onChange={e=>setF({...f,valor:e.target.value})}/></Campo>
      <Campo rotulo="Vencimento" htmlFor="cb-data"><Input id="cb-data" type="date" required value={f.vencimento} onChange={e=>setF({...f,vencimento:e.target.value})}/></Campo>
      <Campo rotulo="Gateway" htmlFor="cb-gateway"><Select id="cb-gateway" value={f.gateway} onChange={e=>setF({...f,gateway:e.target.value})}>{Object.entries(NOMES_GATEWAY).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select></Campo>
      <Button type="submit" carregando={ocupado==='novo'}>Registrar cobrança</Button>
    </form></Modal>
    <Modal aberto={!!verificar} aoFechar={()=>{if(!ocupado)setVerificar(null)}} titulo="Conferir pagamento"><div className="space-y-4"><p className="text-sm">O status será consultado diretamente no provedor.</p>{verificar?.gateway==='infinitepay' && <><Campo rotulo="transaction_nsu" htmlFor="cb-nsu"><Input id="cb-nsu" value={retorno.transaction_nsu} onChange={e=>setRetorno({...retorno,transaction_nsu:e.target.value})}/></Campo><Campo rotulo="slug" htmlFor="cb-slug"><Input id="cb-slug" value={retorno.slug} onChange={e=>setRetorno({...retorno,slug:e.target.value})}/></Campo></>}<Button carregando={!!ocupado} onClick={()=>verificar && acao(verificar,'verificar')}>Consultar gateway</Button></div></Modal>
  </>
}
