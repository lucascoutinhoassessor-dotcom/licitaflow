import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatarDataHora } from '@/lib/format'
import { Aviso, Badge, CabecalhoPagina, Card, Carregando } from '@/components/ui'

interface Evento {
  id: number
  created_at: string
  org_nome: string | null
  usuario_email: string | null
  tabela: string
  acao: 'INSERT' | 'UPDATE' | 'DELETE'
  resumo: string | null
}

const TABELA: Record<string, string> = {
  processos: 'processo',
  processo_itens: 'item',
  documentos: 'documento',
  contratos: 'contrato',
  empenhos: 'empenho',
  faturas: 'fatura',
  empresas: 'empresa',
}
const ACAO = { INSERT: { t: 'criou', c: 'verde' }, UPDATE: { t: 'alterou', c: 'azul' }, DELETE: { t: 'excluiu', c: 'vermelho' } } as const

export default function Atividade() {
  const q = useQuery({
    queryKey: ['admin-atividade'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_atividade', { p_limite: 200 })
      if (error) throw error
      return data as Evento[]
    },
  })

  return (
    <>
      <CabecalhoPagina titulo="Atividade" descricao="O que os clientes estão fazendo na plataforma (atualiza a cada 30 segundos)." />
      {q.isLoading && <Carregando />}
      {q.error && <Aviso>{(q.error as Error).message}</Aviso>}
      <Card className="divide-y">
        {q.data?.map((e) => (
          <div key={e.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:gap-4">
            <div className="w-36 shrink-0 text-xs tabular-nums text-muted-foreground">{formatarDataHora(e.created_at)}</div>
            <div className="min-w-0 flex-1 text-sm">
              <span className="font-medium">{e.usuario_email ?? 'sistema'}</span> <Badge cor={ACAO[e.acao].c}>{ACAO[e.acao].t}</Badge>{' '}
              {TABELA[e.tabela] ?? e.tabela}
              {e.resumo && <span className="text-muted-foreground"> · {e.resumo}</span>}
            </div>
            <div className="truncate text-xs text-muted-foreground sm:w-48 sm:text-right">{e.org_nome}</div>
          </div>
        ))}
        {q.data?.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma atividade ainda.</div>}
      </Card>
    </>
  )
}
