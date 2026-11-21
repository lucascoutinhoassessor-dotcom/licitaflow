import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'

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
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_platform_admin')
      if (error) throw error
      return data === true
    },
  })
  return {
    ehAdmin: q.data === true,
    carregando: q.isLoading,
    erro: q.isError && q.data === undefined ? q.error : null,
    tentarDeNovo: () => q.refetch(),
  }
}
