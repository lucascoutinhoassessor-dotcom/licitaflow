import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { DIAS_TESTE } from '@/lib/planos'

/** Prazo do teste grátis definido pelo master (Planos → Teste grátis). Usa 14 dias até o banco responder. */
export function useDiasTeste() {
  const q = useQuery({
    queryKey: ['dias-teste-gratis'],
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dias_teste_gratis')
      if (error) throw error
      return typeof data === 'number' && data > 0 ? data : DIAS_TESTE
    },
  })
  return q.data ?? DIAS_TESTE
}
