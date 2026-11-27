import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase, mensagemErro } from '@/lib/supabase'
import { formatarMoeda, formatarDataHora } from '@/lib/format'
import { Aviso, Badge, Button, CabecalhoPagina, Campo, Card, Carregando, Input, Modal, Select } from '@/components/ui'
import { AssinaturaPainel } from '@/components/AssinaturaPainel'
import { LimitesIACliente } from '@/components/LimitesIACliente'
import { EditarOrg } from './Organizacoes'
import { AtivacoesCliente, WhatsApp, paraOrgAdmin, useClientes } from './Clientes'
import { DadosOrgMaster, EditarMembroMaster } from '@/components/EdicaoClienteMaster'

interface Membro { id:string; nome:string|null; email:string; papel:string; ultimo_acesso:string|null }
interface Cliente {
  nome:string; processos:number; contratos:number; documentos:number; prazos_pendentes:number; recebido:number; a_receber:number
  membros:Membro[]
  empresas:{id:string;nome:string;cnpj:string;uf:string|null;ativa:boolean}[]
}
export default function ClienteDetalhe() {
  const {id}=useParams()
  const qc=useQueryClient()
  const [membro,setMembro]=useState<Membro|null>(null)
  const [papel,setPapel]=useState('leitor')
  const [motivo,setMotivo]=useState('')
  const [salvando,setSalvando]=useState(false)
  const [editandoConta,setEditandoConta]=useState(false)
  const [editandoDados,setEditandoDados]=useState(false)
  const [editandoLogin,setEditandoLogin]=useState<Membro|null>(null)
  const clientes=useClientes()
  const ficha=clientes.data?.organizacoes.find(o=>o.id===id)
  const conta=ficha && paraOrgAdmin(ficha)
  const q=useQuery({queryKey:['admin-cliente',id],enabled:!!id,queryFn:async()=>{
    const {data,error}=await supabase.rpc('admin_cliente',{p_org:id})
    if(error) throw error
    return data as Cliente
  }})
  async function salvar() {
    if(!membro || motivo.trim().length<5) return toast.error('Informe o motivo com pelo menos 5 caracteres.')
    setSalvando(true)
    try {
      const {error}=await supabase.rpc('admin_papel_membro',{p_org:id,p_usuario:membro.id,p_papel:papel,p_motivo:motivo})
      if(error) throw error
      await qc.invalidateQueries({queryKey:['admin-cliente',id]})
      await qc.invalidateQueries({queryKey:['admin-usuarios']})
      toast.success('Permissão atualizada e registrada na auditoria.');setMembro(null)
    } catch(e) {toast.error(mensagemErro(e))} finally {setSalvando(false)}
  }
  if(q.isLoading) return <Carregando/>
  if(q.isError) return <Aviso>{mensagemErro(q.error)} <button className="underline" onClick={()=>q.refetch()}>Tentar novamente</button></Aviso>
  const c=q.data
  if(!c) return null
  return <>
    <Link className="mb-4 inline-block text-sm text-primary hover:underline" to="/master/clientes">← Clientes</Link>
    <CabecalhoPagina titulo={c.nome} descricao="Ficha do cliente: dados, plano, assinatura, empresas, equipe, login, e-mails de liberação e de senha. Alterações são auditadas." acoes={conta && <><Button variante="contorno" onClick={()=>setEditandoDados(true)}>Nome e tipo</Button><Button variante="contorno" onClick={()=>setEditandoConta(true)}>Plano, teste e suspensão</Button></>}/>
    {conta && <div className="mb-5 flex flex-wrap gap-2">
      <Badge cor={conta.suspensa?'vermelho':'verde'}>{conta.suspensa?`Suspensa${conta.motivo_suspensao?': '+conta.motivo_suspensao:''}`:'Acesso liberado'}</Badge>
      <Badge cor="azul">Plano: {conta.plano}</Badge>
      {conta.plano==='trial' && <Badge cor="amarelo">Teste até {new Date(conta.trial_ate+'T12:00:00').toLocaleDateString('pt-BR')}</Badge>}
      {conta.dono_email && <Badge>Dono: {conta.dono_email}</Badge>}
    </div>}
    {id && <div className="mb-6"><AssinaturaPainel org={id} master/></div>}
    {ficha && <Card className="mb-6 p-4"><AtivacoesCliente c={ficha}/></Card>}
    {id && <LimitesIACliente org={id}/>}
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">{[
      ['Processos',c.processos],['Contratos',c.contratos],['Documentos',c.documentos],['Prazos pendentes',c.prazos_pendentes],['Recebido nos contratos',formatarMoeda(c.recebido)],['A receber nos contratos',formatarMoeda(c.a_receber)],
    ].map(([r,v])=><Card className="p-4" key={r}><p className="text-sm text-muted-foreground">{r}</p><p className="mt-1 text-2xl font-semibold">{v}</p></Card>)}</div>
    <p className="mb-5 text-xs text-muted-foreground">Os valores financeiros são da operação do cliente. Não representam pagamentos de assinatura ao LicitaForce.</p>
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="divide-y"><h2 className="p-4 font-semibold">Empresas ({c.empresas.length})</h2>{c.empresas.map(e=><div className="p-4" key={e.id}><p className="font-medium">{e.nome} {!e.ativa && <Badge>Inativa</Badge>}</p><p className="text-sm text-muted-foreground">{e.cnpj} · {e.uf ?? 'UF não informada'}</p></div>)}{!c.empresas.length && <p className="p-4 text-sm text-muted-foreground">Nenhuma empresa cadastrada.</p>}</Card>
      <Card className="divide-y"><h2 className="p-4 font-semibold">Equipe ({c.membros.length})</h2>{c.membros.map(m=><div className="space-y-2 p-4" key={m.id}><p className="break-all font-medium">{m.nome || m.email}</p><p className="break-all text-sm text-muted-foreground">{m.email}</p><WhatsApp numero={ficha?.membros.find(x=>x.id===m.id)?.telefone ?? null} className="text-sm"/><p className="text-xs text-muted-foreground">Último acesso: {formatarDataHora(m.ultimo_acesso)}</p><div className="flex flex-wrap items-center justify-between gap-2"><Badge>{m.papel}</Badge><div className="flex flex-wrap gap-2"><Button tamanho="sm" variante="contorno" onClick={()=>setEditandoLogin(m)}>Editar login e e-mails</Button>{m.papel!=='owner' && <Button tamanho="sm" variante="contorno" onClick={()=>{setMembro(m);setPapel(m.papel);setMotivo('')}}>Alterar acesso</Button>}</div></div></div>)}</Card>
    </div>
    <Modal aberto={editandoConta && !!conta} aoFechar={()=>setEditandoConta(false)} titulo={conta?.nome ?? ''}>{conta && <EditarOrg org={conta} aoFechar={()=>{setEditandoConta(false);qc.invalidateQueries({queryKey:['admin-cliente',id]})}}/>}</Modal>
    <Modal aberto={editandoDados && !!conta} aoFechar={()=>setEditandoDados(false)} titulo="Dados da organização">{conta && id && <DadosOrgMaster org={id} nome={conta.nome} tipo={conta.tipo} aoSalvar={()=>setEditandoDados(false)}/>}</Modal>
    <Modal aberto={!!editandoLogin} aoFechar={()=>setEditandoLogin(null)} titulo={editandoLogin?.nome || editandoLogin?.email || 'Usuário'}>{editandoLogin && id && <EditarMembroMaster org={id} membro={editandoLogin} aoSalvar={()=>setEditandoLogin(null)}/>}</Modal>
    <Modal aberto={!!membro} aoFechar={()=>{if(!salvando)setMembro(null)}} titulo="Alterar permissão do membro">
      <div className="space-y-4"><p className="break-all text-sm">{membro?.email}</p><Campo rotulo="Papel" htmlFor="membro-papel"><Select id="membro-papel" value={papel} onChange={e=>setPapel(e.target.value)}><option value="admin">Administrador do cliente</option><option value="membro">Membro</option><option value="leitor">Somente leitura</option></Select></Campo><Campo rotulo="Motivo da alteração" htmlFor="membro-motivo"><Input id="membro-motivo" value={motivo} onChange={e=>setMotivo(e.target.value)} minLength={5} maxLength={1000}/></Campo><Button carregando={salvando} disabled={motivo.trim().length<5} onClick={salvar}>Confirmar alteração</Button></div>
    </Modal>
  </>
}
