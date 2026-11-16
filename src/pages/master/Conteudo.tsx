import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase, mensagemErro } from '@/lib/supabase'
import { conteudoSiteSchema, lerConteudo, type ConteudoSite } from '@/lib/conteudoSite'
import { Aviso, Button, CabecalhoPagina, Campo, Card, Carregando, Input, Textarea } from '@/components/ui'
import { formatarDataHora } from '@/lib/format'

type Estado = { versao: number; rascunho: unknown; publicado: unknown; publicado_em: string | null }
const rotulos: Record<keyof ConteudoSite,string> = { titulo:'Título principal', destaque:'Destaque do título', descricao:'Descrição principal', botao:'Texto do botão de cadastro', titulo_final:'Título da chamada final', descricao_final:'Descrição da chamada final', contato:'E-mail de contato (opcional)' }

function Editor({ estado }: { estado: Estado }) {
  const qc = useQueryClient()
  const [conteudo,setConteudo] = useState(() => lerConteudo(estado.rascunho))
  const [versao,setVersao] = useState(estado.versao)
  const [pendente,setPendente] = useState(false)
  const [alterado,setAlterado] = useState(false)
  const historico = useQuery({ queryKey:['site-historico'], queryFn:async () => {
    const {data,error} = await supabase.from('site_content_history').select('id,versao,acao,created_at,conteudo').order('id',{ascending:false}).limit(30)
    if(error) throw error
    return data
  } })
  async function salvar(publicar: boolean) {
    const validado = conteudoSiteSchema.safeParse(conteudo)
    if(!validado.success) return toast.error(validado.error.issues[0].message)
    if(publicar && !confirm('Publicar este conteúdo na landing page para todos os visitantes?')) return
    setPendente(true)
    try {
      const {data,error} = await supabase.rpc('admin_salvar_site',{p_conteudo:validado.data,p_versao:versao,p_publicar:publicar})
      if(error) throw error
      setVersao(data); setAlterado(false)
      await qc.invalidateQueries({queryKey:['site-historico']})
      await qc.invalidateQueries({queryKey:['site-publico']})
      toast.success(publicar ? 'Conteúdo publicado. Visitantes verão a atualização ao carregar a página.' : 'Rascunho salvo. A página pública não foi alterada.')
    } catch(e) { toast.error(mensagemErro(e)) } finally { setPendente(false) }
  }
  return <div className="grid gap-6 lg:grid-cols-2">
    <Card className="space-y-4 p-5">
      <h2 className="font-semibold">Editar conteúdo · revisão {versao}{alterado ? ' · alterações não salvas' : ''}</h2>
      {(Object.keys(rotulos) as (keyof ConteudoSite)[]).map(k => <Campo key={k} htmlFor={`site-${k}`} rotulo={rotulos[k]}>
        {k.includes('descricao') ? <Textarea id={`site-${k}`} maxLength={2000} value={conteudo[k]} onChange={e=>{setConteudo({...conteudo,[k]:e.target.value});setAlterado(true)}} /> : <Input id={`site-${k}`} type={k==='contato'?'email':'text'} maxLength={k==='titulo'?180:k==='botao'?80:2000} value={conteudo[k]} onChange={e=>{setConteudo({...conteudo,[k]:e.target.value});setAlterado(true)}} />}
      </Campo>)}
      <div className="flex flex-wrap gap-3"><Button variante="contorno" disabled={pendente} onClick={()=>salvar(false)}>Salvar rascunho</Button><Button carregando={pendente} onClick={()=>salvar(true)}>Publicar conteúdo</Button></div>
    </Card>
    <div className="space-y-5">
      <Card className="space-y-4 p-6"><h2 className="text-sm text-muted-foreground">Prévia dos textos · ainda não publicada</h2><h3 className="text-3xl font-semibold">{conteudo.titulo} <span className="text-primary">{conteudo.destaque}</span></h3><p>{conteudo.descricao}</p><span className="inline-block rounded bg-primary px-4 py-2 text-primary-foreground">{conteudo.botao}</span><hr/><h3 className="text-xl font-semibold">{conteudo.titulo_final}</h3><p>{conteudo.descricao_final}</p><p>{conteudo.contato}</p></Card>
      <Card className="p-5"><h2 className="mb-3 font-semibold">Histórico e restauração</h2><p className="mb-3 text-xs text-muted-foreground">Restaurar carrega uma versão no editor. É necessário salvar ou publicar para aplicar.</p>
        {historico.isError && <Aviso>Não foi possível carregar o histórico.</Aviso>}
        {historico.data?.map(v=><div key={v.id} className="flex flex-wrap items-center justify-between gap-3 border-t py-3 text-sm"><span>Revisão {v.versao} · {v.acao}<small className="block text-muted-foreground">{formatarDataHora(v.created_at)}</small></span><Button tamanho="sm" variante="contorno" disabled={pendente} onClick={()=>{if(alterado && !confirm('Substituir as alterações não salvas no editor?')) return;setConteudo(lerConteudo(v.conteudo));setAlterado(true)}}>Restaurar no editor</Button></div>)}
      </Card>
    </div>
  </div>
}

export default function Conteudo() {
  const q=useQuery({queryKey:['site-admin'],queryFn:async()=>{
    const {data,error}=await supabase.from('site_content').select('versao,rascunho,publicado,publicado_em').single()
    if(error) throw error
    return data as Estado
  }})
  return <><CabecalhoPagina titulo="Landing page" descricao="Edite os textos de apresentação, as chamadas para cadastro e o contato. Rascunhos só ficam visíveis para o master."/>
    {q.isLoading ? <Carregando/> : q.isError ? <Aviso>Editor indisponível. Verifique se a migração de gestão master foi aplicada. <button className="underline" onClick={()=>q.refetch()}>Tentar novamente</button></Aviso> : q.data && <Editor estado={q.data}/>}
  </>
}
