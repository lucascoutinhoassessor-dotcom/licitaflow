import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'

/** true quando o usuário logado é administrador da plataforma (painel master). */
export function useEhAdmin() {
  const { user } = useAuth()
  const q = useQuery({
    queryKey: ['eh-admin', user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_platform_admin')
      if (error) throw error
      return data === true
    },
  })
  return { ehAdmin: q.data === true, carregando: q.isLoading }
}
