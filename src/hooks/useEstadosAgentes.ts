import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/providers/OrgProvider'
import type { EstadosAgentes } from '@/lib/agentesProcesso'

/** Estado real dos agentes em todos os processos da organização (atualiza a cada 2 min). */
export function useEstadosAgentes(habilitado = true) {
  const { org } = useOrg()
  return useQuery({
    queryKey: ['agentes-estado-processos', org?.id],
    enabled: !!org && habilitado,
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('agentes_estado_processos', { p_org: org!.id })
      if (error) throw error
      return (data ?? {}) as EstadosAgentes
    },
  })
}
