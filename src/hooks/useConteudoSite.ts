import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { lerConteudo } from '@/lib/conteudoSite'

/** Conteúdo publicado no master (Landing page): landing e tela de login. */
export function useConteudoSite() {
  const q = useQuery({
    queryKey: ['site-publico'], staleTime: 60_000, retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('site_publico')
      if (error) throw error
      return data
    },
  })
  return { conteudo: lerConteudo(q.data), carregando: q.isLoading }
}
