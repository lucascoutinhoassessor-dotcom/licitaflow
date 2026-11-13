import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase, mensagemErro } from '@/lib/supabase'
import { useOrg } from '@/providers/OrgProvider'

type Filtro = (q: any) => any

/**
 * Lista registros da organização atual. Se a tabela tiver empresa_id e houver uma
 * empresa selecionada, filtra por ela (a menos que `porEmpresa` seja false).
 */
export function useLista<T>(tabela: string, opcoes: { filtro?: Filtro; chave?: unknown[]; porEmpresa?: boolean; ordem?: [string, boolean?]; habilitado?: boolean } = {}) {
  const { org, empresa } = useOrg()
  const { filtro, chave = [], porEmpresa = true, ordem, habilitado = true } = opcoes
  return useQuery({
    queryKey: [tabela, org?.id, porEmpresa ? empresa?.id ?? 'todas' : 'todas', ...chave],
    enabled: !!org && habilitado,
    queryFn: async () => {
      let q = supabase.from(tabela).select('*').eq('org_id', org!.id)
      if (porEmpresa && empresa) q = q.eq('empresa_id', empresa.id)
      if (filtro) q = filtro(q)
      if (ordem) q = q.order(ordem[0], { ascending: ordem[1] ?? true, nullsFirst: false })
      const { data, error } = await q
      if (error) throw error
      return data as T[]
    },
  })
}

/** Busca um registro pelo id. */
export function useRegistro<T>(tabela: string, id: string | undefined) {
  return useQuery({
    queryKey: [tabela, 'id', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from(tabela).select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data as T | null
    },
  })
}

/** Inserir/atualizar/excluir com toast e invalidação das listas afetadas. */
export function useSalvar(tabela: string, invalidar: string[] = []) {
  const qc = useQueryClient()
  const { org } = useOrg()
  const posOperacao = () => {
    for (const t of [tabela, ...invalidar]) qc.invalidateQueries({ queryKey: [t] })
    qc.invalidateQueries({ queryKey: ['contagem'] })
  }

  const salvar = useMutation({
    mutationFn: async ({ id, dados }: { id?: string; dados: Record<string, unknown> }) => {
      const limpo = Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, v === '' ? null : v]))
      if (id) {
        const { data, error } = await supabase.from(tabela).update(limpo).eq('id', id).select().single()
        if (error) throw error
        return data
      }
      const { data, error } = await supabase.from(tabela).insert({ ...limpo, org_id: org!.id }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: posOperacao,
    onError: (e) => toast.error(mensagemErro(e)),
  })

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(tabela).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: posOperacao,
    onError: (e) => toast.error(mensagemErro(e)),
  })

  return { salvar, excluir }
}

/** Mapa id -> nome curto das empresas da organização. */
export function useNomeEmpresa() {
  const { empresas } = useOrg()
  return (id: string | null | undefined) => {
    const e = empresas.find((x) => x.id === id)
    return e ? e.nome_fantasia || e.razao_social : ''
  }
}
