import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, mensagemErro } from '@/lib/supabase'
import { formatarDataHora } from '@/lib/format'
import { Aviso, Button, CabecalhoPagina, Card, Carregando, Input } from '@/components/ui'

export default function Auditoria() {
  const [pagina,setPagina]=useState(0)
  const [filtro,setFiltro]=useState('')
  const q=useQuery({queryKey:['admin-auditoria',pagina],queryFn:async()=>{
    const {data,error}=await supabase.from('admin_audit').select('id,created_at,ator,acao,alvo,dados').order('id',{ascending:false}).range(pagina*50,pagina*50+49)
    if(error) throw error
    return data
  }})
  const lista=(q.data ?? []).filter(e=>`${e.acao} ${e.alvo} ${e.ator} ${JSON.stringify(e.dados)}`.toLowerCase().includes(filtro.trim().toLowerCase()))
  return <><CabecalhoPagina titulo="Auditoria administrativa" descricao="Registro de mudanças em clientes, papéis, administradores e publicações da landing page. Somente o master pode consultar."/>
    <Input className="mb-4" aria-label="Buscar nos registros desta página" placeholder="Buscar nos registros desta página" value={filtro} onChange={e=>setFiltro(e.target.value)}/>
    {q.isLoading && <Carregando/>}{q.isError && <Aviso>{mensagemErro(q.error)}</Aviso>}
    <Card className="divide-y">{lista.map(e=><div key={e.id} className="p-4"><p className="text-sm font-medium">{e.acao} · {e.alvo}</p><p className="mt-1 break-all text-xs text-muted-foreground">{formatarDataHora(e.created_at)} · ator: {e.ator ?? 'Operação do banco'}</p><details className="mt-2 text-sm"><summary className="cursor-pointer">Ver detalhes da alteração</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-3 text-xs">{JSON.stringify(e.dados,null,2)}</pre></details></div>)}{!q.isLoading && !q.isError && !lista.length && <p className="p-8 text-center text-sm text-muted-foreground">Nenhum registro nesta página.</p>}</Card>
    <div className="mt-4 flex items-center justify-between"><Button variante="contorno" disabled={!pagina || q.isFetching} onClick={()=>setPagina(p=>p-1)}>Anterior</Button><span className="text-sm">Página {pagina+1}</span><Button variante="contorno" disabled={q.isFetching || (q.data?.length ?? 0)<50} onClick={()=>setPagina(p=>p+1)}>Próxima</Button></div>
  </>
}
