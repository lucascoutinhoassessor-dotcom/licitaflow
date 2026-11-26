import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase, mensagemErro } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'
import { Abas, Aviso, Badge, Button, CabecalhoPagina, Campo, Card, Carregando, Input, Modal, Select, Textarea } from '@/components/ui'
import { Imagem } from './landing/campos'
import { CartaoQuadro } from '@/components/QuadroInformativo'
import { TIPOS_QUADRO, dataLocalQuadro, validarPostQuadro, type PostQuadro } from '@/lib/quadro'
import { formatarDataHora } from '@/lib/format'

const novoPost = (): PostQuadro => ({ id: '', titulo: '', texto: '', tipo: 'dica', imagem_url: '', link_url: '', link_texto: '', org_id: null, status: 'rascunho', publicar_em: new Date().toISOString(), expira_em: null, ordem: 0, created_at: new Date().toISOString() })
export default function Quadro() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [post, setPost] = useState<PostQuadro | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [filtro, setFiltro] = useState('todos')
  const q = useQuery({ queryKey: ['quadro-admin', user?.id], queryFn: async () => {
    const { data, error } = await supabase.from('quadro_posts').select('*').order('created_at', { ascending: false }).limit(100)
    if (error) throw error
    return data as PostQuadro[]
  } })
  const orgs = useQuery({ queryKey: ['admin-orgs'], queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_organizacoes'); if (error) throw error
    return data as { id: string; nome: string }[]
  } })
  const mudar = (p: Partial<PostQuadro>) => setPost(atual => atual && ({ ...atual, ...p }))
  async function salvar(e: FormEvent) {
    e.preventDefault(); if (!post) return
    const erro = validarPostQuadro(post); if (erro) return toast.error(erro)
    setOcupado(true)
    try {
      const { error } = await supabase.rpc('admin_salvar_quadro', { p_post: { ...post, id: post.id || null } })
      if (error) throw error
      await qc.invalidateQueries({ queryKey: ['quadro-admin'] }); await qc.invalidateQueries({ queryKey: ['quadro-publico'] })
      setPost(null); toast.success(post.status === 'publicado' ? 'Conteúdo salvo. A exibição segue o período definido.' : 'Conteúdo salvo.')
    } catch (e) { toast.error(mensagemErro(e)) } finally { setOcupado(false) }
  }
  return <>
    <CabecalhoPagina titulo="Quadro informativo" descricao="Banners, dicas educativas, funcionalidades e eventos. Edite rascunhos, escolha o público e programe a exibição." acoes={<><Button variante="contorno" onClick={() => q.refetch()}>Atualizar</Button><Button onClick={() => setPost(novoPost())}>Criar conteúdo</Button></>} />
    <Abas abas={[{ id: 'todos', rotulo: 'Todos' }, { id: 'rascunho', rotulo: 'Rascunhos' }, { id: 'publicado', rotulo: 'Publicados / agendados' }, { id: 'arquivado', rotulo: 'Arquivados' }]} atual={filtro} aoTrocar={setFiltro} />
    {q.isLoading && <Carregando />}{q.isError && <Aviso>Não foi possível carregar o quadro. Tente atualizar.</Aviso>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{q.data?.filter(p => filtro === 'todos' || p.status === filtro).map(p => <div key={p.id} className="space-y-2">
      <CartaoQuadro post={p} /><div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge>{p.status === 'publicado' ? (p.expira_em && Date.parse(p.expira_em) <= Date.now() ? 'Expirado' : Date.parse(p.publicar_em) > Date.now() ? 'Agendado' : 'Publicado') : p.status === 'rascunho' ? 'Rascunho' : 'Arquivado'}</Badge><span>{p.org_id ? orgs.data?.find(o => o.id === p.org_id)?.nome ?? 'Organização selecionada' : 'Todos os clientes'}</span><span>{formatarDataHora(p.publicar_em)}</span><Button tamanho="sm" variante="contorno" onClick={() => setPost(p)}>Editar</Button></div>
    </div>)}</div>
    {!q.isLoading && !q.isError && !q.data?.filter(p => filtro === 'todos' || p.status === filtro).length && <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum conteúdo neste filtro.</Card>}
    <Modal aberto={!!post} aoFechar={() => { if (!ocupado) setPost(null) }} titulo="Editar conteúdo do quadro">
      {post && <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Tipo" htmlFor="quadro-tipo"><Select id="quadro-tipo" value={post.tipo} onChange={e => mudar({ tipo: e.target.value as PostQuadro['tipo'] })}>{Object.entries(TIPOS_QUADRO).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</Select></Campo>
        <Campo rotulo="Título" htmlFor="quadro-titulo"><Input id="quadro-titulo" required minLength={3} maxLength={160} value={post.titulo} onChange={e => mudar({ titulo: e.target.value })} /></Campo>
        <Campo rotulo="Texto educativo / descrição" htmlFor="quadro-texto"><Textarea id="quadro-texto" required minLength={3} maxLength={5000} rows={5} value={post.texto} onChange={e => mudar({ texto: e.target.value })} /></Campo>
        <Imagem rotulo="Imagem do banner" valor={post.imagem_url} mudar={imagem_url => mudar({ imagem_url })} ajuda="Envie seu banner (até 5 MB) ou cole um endereço HTTPS. A imagem fica pública." />
        <Campo rotulo="Link do botão (opcional)" htmlFor="quadro-link"><Input id="quadro-link" maxLength={2000} value={post.link_url} placeholder="/app/documentos ou https://…" onChange={e => mudar({ link_url: e.target.value })} /></Campo>
        <Campo rotulo="Texto do botão" htmlFor="quadro-botao"><Input id="quadro-botao" maxLength={80} value={post.link_texto} onChange={e => mudar({ link_texto: e.target.value })} /></Campo>
        <Campo rotulo="Público" htmlFor="quadro-org"><Select id="quadro-org" value={post.org_id ?? ''} onChange={e => mudar({ org_id: e.target.value || null })}><option value="">Todos os clientes</option>{orgs.data?.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}</Select></Campo>
        {orgs.isError && <Aviso>Não foi possível carregar o público. Atualize antes de alterar os destinatários.</Aviso>}
        <div className="grid gap-3 sm:grid-cols-2"><Campo rotulo="Publicar a partir de" htmlFor="quadro-inicio"><Input id="quadro-inicio" type="datetime-local" required value={dataLocalQuadro(post.publicar_em)} onChange={e => { if (e.target.value) mudar({ publicar_em: new Date(e.target.value).toISOString() }) }} /></Campo><Campo rotulo="Expiração (opcional)" htmlFor="quadro-fim"><Input id="quadro-fim" type="datetime-local" value={post.expira_em ? dataLocalQuadro(post.expira_em) : ''} onChange={e => mudar({ expira_em: e.target.value ? new Date(e.target.value).toISOString() : null })} /></Campo></div>
        <Campo rotulo="Ordem (menores primeiro)" htmlFor="quadro-ordem"><Input id="quadro-ordem" type="number" min={-1000} max={1000} value={post.ordem} onChange={e => mudar({ ordem: Number(e.target.value) })} /></Campo>
        <Campo rotulo="Situação" htmlFor="quadro-status"><Select id="quadro-status" value={post.status} onChange={e => mudar({ status: e.target.value as PostQuadro['status'] })}><option value="rascunho">Rascunho — só o master vê</option><option value="publicado">Publicado — visível no período definido</option><option value="arquivado">Arquivado — oculto para os clientes</option></Select></Campo>
        <h3 className="font-semibold">Prévia</h3><CartaoQuadro post={post} />
        <Button type="submit" carregando={ocupado}>Salvar conteúdo</Button>
      </form>}
    </Modal>
  </>
}
