import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'
import { consultarComLimite } from '@/lib/conexao'

/**
 * true quando o usuário logado é administrador da plataforma (painel master).
 * Falha na consulta (sessão sendo renovada, rede) não vira "sem acesso": fica em `erro` para nova tentativa.
 * A chave inclui o token, então a checagem se repete quando o Supabase renova a sessão.
 */
export function useEhAdmin() {
  const { user, session } = useAuth()
  const q = useQuery({
    queryKey: ['eh-admin', user?.id, session?.access_token],
    enabled: !!user,
    staleTime: 5 * 60_000,
    retry: 2,
    retryDelay: (n) => 800 * (n + 1),
    refetchOnWindowFocus: true,
    queryFn: async ({ signal }) => {
      const { data, error } = await consultarComLimite(sinal => supabase.rpc('is_platform_admin').abortSignal(sinal), signal)
      if (error) throw error
      return data === true
    },
  })
  return {
    ehAdmin: q.data === true,
    carregando: q.isPending && q.fetchStatus !== 'paused',
    erro: q.data === undefined && (q.isError || q.fetchStatus === 'paused') ? (q.error ?? new Error('Sem conexão')) : null,
    tentarDeNovo: () => q.refetch(),
  }
}
