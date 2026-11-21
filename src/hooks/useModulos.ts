import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/providers/OrgProvider'
import { GRUPOS_NAV, IA, NAV_CONTA } from '@/lib/navegacao'
import { estadoDe, filtrarGrupos, filtrarItens } from '@/lib/modulos'

/** Estados de liberação dos módulos para a organização ativa (definidos pelo master). */
export function useModulos() {
  const { org } = useOrg()
  const q = useQuery({
    queryKey: ['modulos-org', org?.id],
    enabled: !!org,
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('modulos_da_org', { p_org: org!.id })
      if (error) throw error
      return (data ?? {}) as Record<string, string>
    },
  })
  // Falha na consulta (ex.: migração ainda não aplicada) mantém o menu como no código.
  const estados = q.data ?? (q.isLoading ? null : undefined)
  return { estados, carregando: q.isLoading, estado: (rota: string) => estadoDe(estados, rota) }
}

/** Navegação do cliente já filtrada pelo que o master liberou. */
export function useNavegacao() {
  const { estados } = useModulos()
  const [ia] = filtrarItens([IA], estados)
  return { grupos: filtrarGrupos(GRUPOS_NAV, estados), ia: ia ?? null, conta: filtrarItens(NAV_CONTA, estados) }
}
