import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase, mensagemErro } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'
import { Abas, Aviso, Badge, Button, CabecalhoPagina, Card, Carregando } from '@/components/ui'
import { Chamados } from '@/pages/relacionamento/Suporte'
import { TIPOS_QUADRO, type RecomendacaoQuadro } from '@/lib/quadro'

export default function Sugestoes() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [aba, setAba] = useState('recomendacoes')
  const [ocupado, setOcupado] = useState(false)
  const q = useQuery({ queryKey: ['quadro-recomendacoes', user?.id], refetchInterval: 60_000, queryFn: async () => {
    const { error: analise } = await supabase.rpc('admin_analisar_quadro'); if (analise) throw analise
    const { data, error } = await supabase.from('quadro_recomendacoes').select('*').order('created_at', { ascending: false }).limit(100)
    if (error) throw error
    return data as RecomendacaoQuadro[]
  } })
  async function decidir(id: string, criar: boolean) {
    setOcupado(true)
    try {
      const { error } = await supabase.rpc('admin_decidir_recomendacao_quadro', { p_id: id, p_criar: criar })
      if (error) throw error
      await Promise.all([qc.invalidateQueries({ queryKey: ['quadro-recomendacoes'] }), qc.invalidateQueries({ queryKey: ['quadro-admin'] }), qc.invalidateQueries({ queryKey: ['quadro-pendencias'] })])
      toast.success(criar ? 'Rascunho criado no quadro. Revise o texto e o público antes de publicar.' : 'Recomendação dispensada.')
    } catch (e) { toast.error(mensagemErro(e)) } finally { setOcupado(false) }
  }
  return <>
    <CabecalhoPagina titulo="Sugestões para os usuários" descricao="Ideias dos clientes e recomendações de educação, funcionalidades e eventos baseadas em sinais reais da plataforma." acoes={<Button variante="contorno" onClick={() => q.refetch()}>Atualizar análise</Button>} />
    <Abas abas={[{ id: 'recomendacoes', rotulo: 'Recomendações da plataforma', contagem: q.data?.filter(r => r.status === 'nova').length }, { id: 'usuarios', rotulo: 'Enviadas pelos usuários' }]} atual={aba} aoTrocar={setAba} />
    {aba === 'usuarios' ? <Chamados master tipoFixo="sugestao" /> : <div className="space-y-4">
      <Card className="p-4 text-sm text-muted-foreground">A análise usa contagens de chamados recentes, documentos vencidos e prazos atrasados. As recomendações seguem regras automáticas; não leem conversas privadas nem geram eventos fictícios. Todo conteúdo sugerido começa como rascunho para sua revisão. <Link to="/master/quadro" className="font-medium text-primary hover:underline">Abrir quadro informativo</Link></Card>
      {q.isLoading && <Carregando />}{q.isError && <Aviso>Não foi possível analisar as sugestões. Tente atualizar a análise.</Aviso>}
      {q.data?.map(r => <Card key={r.id} className="space-y-3 p-5"><div className="flex flex-wrap gap-2"><Badge cor="azul">{TIPOS_QUADRO[r.tipo]}</Badge><Badge cor={r.status === 'nova' ? 'amarelo' : 'neutro'}>{r.status === 'nova' ? 'Nova recomendação' : r.status === 'rascunho' ? 'Rascunho criado' : 'Dispensada'}</Badge></div><h2 className="font-semibold">{r.titulo}</h2><p className="text-sm text-muted-foreground">{r.motivo}</p><p className="whitespace-pre-wrap text-sm">{r.texto_sugerido}</p>{r.status === 'nova' && <div className="flex flex-wrap gap-2"><Button tamanho="sm" disabled={ocupado} onClick={() => decidir(r.id, true)}>Criar rascunho no quadro</Button><Button tamanho="sm" variante="contorno" disabled={ocupado} onClick={() => decidir(r.id, false)}>Dispensar</Button></div>}</Card>)}
      {!q.isLoading && !q.isError && !q.data?.length && <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum sinal que exija uma recomendação neste momento. As sugestões dos usuários ficam na outra aba.</Card>}
    </div>}
  </>
}
