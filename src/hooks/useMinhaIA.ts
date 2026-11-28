import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/providers/OrgProvider'
import type { ChaveIA } from '@/lib/minhaIA'

/** Chaves de IA do próprio cliente (sem a chave) e a que está em uso. */
export function useChavesIA(habilitado = true) {
  const { org } = useOrg()
  return useQuery({
    queryKey: ['ia-chaves', org?.id], enabled: !!org && habilitado, staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ia_chaves_resumo', { p_org: org!.id })
      if (error) throw error
      return (data ?? []) as ChaveIA[]
    },
  })
}

/** Chave em uso pela organização, ou undefined (usa a IA do LicitaForce, dentro do limite do plano). */
export function useMinhaIA(habilitado = true) {
  return useChavesIA(habilitado).data?.find((c) => c.ativa)
}
