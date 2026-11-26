import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, BookOpen } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'
import { useOrg } from '@/providers/OrgProvider'
import { Badge, Card, Aviso, Carregando } from '@/components/ui'
import { TIPOS_QUADRO, linkQuadroSeguro, type PostQuadro } from '@/lib/quadro'

export function CartaoQuadro({ post }: { post: PostQuadro }) {
  const link = post.link_url && linkQuadroSeguro(post.link_url) ? post.link_url : ''
  const classeLink = 'inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline'
  return <Card className="h-full overflow-hidden">
    {post.imagem_url && linkQuadroSeguro(post.imagem_url, true) && <img src={post.imagem_url} alt={post.titulo} loading="lazy" className="max-h-80 w-full object-contain bg-muted" />}
    <div className="space-y-3 p-5">
      <Badge cor={post.tipo === 'evento' ? 'amarelo' : 'azul'}>{TIPOS_QUADRO[post.tipo]}</Badge>
      <h3 className="break-words text-lg font-semibold">{post.titulo}</h3>
      <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{post.texto}</p>
      {link && (link.startsWith('/') ? <Link className={classeLink} to={link}>{post.link_texto}<ArrowUpRight className="h-4 w-4" /></Link> : <a className={classeLink} href={link} target="_blank" rel="noopener noreferrer">{post.link_texto}<ArrowUpRight className="h-4 w-4" /></a>)}
    </div>
  </Card>
}

export default function QuadroInformativo({ compacto = false }: { compacto?: boolean }) {
  const { user } = useAuth()
  const { org } = useOrg()
  const q = useQuery({ queryKey: ['quadro-publico', user?.id, org?.id, compacto], enabled: !!user && !!org,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('quadro_listar', { p_org: org!.id, p_limite: compacto ? 3 : 100 })
      if (error) throw error
      return data as PostQuadro[]
    },
  })
  return <section className="my-6 space-y-4" aria-label="Quadro informativo">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-xl font-semibold"><BookOpen className="h-5 w-5 text-primary" />Quadro informativo</h2><p className="mt-1 text-sm text-muted-foreground">Dicas, funcionalidades, eventos e novidades para você.</p></div>
      <div className="flex gap-4 text-sm font-medium text-primary">{compacto && <Link to="/app/quadro" className="hover:underline">Ver todos</Link>}<Link to="/app/sugestoes" className="hover:underline">Enviar sugestão</Link></div>
    </div>
    {q.isLoading && <Carregando />}
    {q.isError && <Aviso>Não foi possível carregar o quadro. <button className="underline" onClick={() => q.refetch()}>Tentar novamente</button></Aviso>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{q.data?.map(post => <CartaoQuadro key={post.id} post={post} />)}</div>
    {!q.isLoading && !q.isError && !q.data?.length && <Card className="p-6 text-sm text-muted-foreground">Os próximos conteúdos e eventos aparecerão aqui.</Card>}
  </section>
}
