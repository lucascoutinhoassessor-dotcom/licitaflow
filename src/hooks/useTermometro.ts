import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/providers/OrgProvider'
import { useModulos } from '@/hooks/useModulos'
import type { LimiteIA } from '@/lib/agentesIA'
import type { AlvoCapag, CapagEnte, UgFederal } from '@/lib/termometro'

/** O Termômetro aparece com o módulo "agentes" liberado e o plano incluindo o agente (limite diferente de 0). */
export function useTermometroLiberado() {
  const { org } = useOrg()
  const { estado } = useModulos()
  const liberado = estado('/app/agentes') === 'liberado'
  const uso = useQuery({ queryKey: ['ia-uso-resumo', org?.id], enabled: !!org && liberado, staleTime: 300_000, queryFn: async () => {
    const { data, error } = await supabase.rpc('ia_uso_resumo', { p_org: org!.id }); if (error) throw error; return data as Record<string, LimiteIA>
  } })
  return liberado && uso.data?.termometro?.limite !== 0 && !!uso.data
}

/** Notas CAPAG de vários alvos de uma vez (chave direta ou município pelo nome). */
export function useCapag(alvos: AlvoCapag[], habilitado = true) {
  const chaves = [...new Set(alvos.flatMap((a) => (a?.tipo === 'chave' ? [a.chave] : [])))].sort()
  const nomes = [...new Set(alvos.flatMap((a) => (a?.tipo === 'municipio' ? [`${a.uf}|${a.nome}`] : [])))].sort()
  return useQuery({
    queryKey: ['capag', chaves.join(','), nomes.join(',')],
    enabled: habilitado && (chaves.length > 0 || nomes.length > 0),
    staleTime: 3_600_000,
    queryFn: async () => {
      const linhas: CapagEnte[] = []
      if (chaves.length) {
        const { data, error } = await supabase.from('capag').select('*').in('chave', chaves)
        if (error) throw error
        linhas.push(...(data as CapagEnte[]))
      }
      if (nomes.length) {
        const { data, error } = await supabase.from('capag').select('*').eq('esfera', 'M').in('nome_busca', [...new Set(nomes.map((n) => n.split('|')[1]))])
        if (error) throw error
        linhas.push(...(data as (CapagEnte & { nome_busca: string })[]).filter((d) => nomes.includes(`${d.uf}|${d.nome_busca}`)))
      }
      return linhas
    },
  })
}

/** Nota de um alvo dentro do resultado de useCapag. */
export function notaDe(lista: (CapagEnte & { nome_busca?: string })[] | undefined, alvo: AlvoCapag): CapagEnte | null | undefined {
  if (!lista || !alvo || alvo.tipo === 'federal') return undefined
  if (alvo.tipo === 'chave') return lista.find((l) => l.chave === alvo.chave) ?? null
  return lista.find((l) => l.esfera === 'M' && l.uf === alvo.uf && l.nome_busca === alvo.nome) ?? null
}

/** Resumo federal de várias UGs de uma vez (pagamentos medidos no Portal da Transparência). */
export function useFederal(ugs: (string | null | undefined)[], habilitado = true) {
  const lista = [...new Set(ugs.filter((u): u is string => !!u && /^\d{6}$/.test(u)))].sort()
  return useQuery({
    queryKey: ['termometro-federal', lista.join(',')],
    enabled: habilitado && lista.length > 0,
    staleTime: 3_600_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('termometro_federal_consulta', { p_ugs: lista })
      if (error) throw error
      return (data ?? []) as UgFederal[]
    },
  })
}

/** Último dia do Portal da Transparência já lido ("AAAAMMDD"). */
export function usePosicaoFederal(habilitado = true) {
  return useQuery({ queryKey: ['termometro-federal-posicao'], enabled: habilitado, staleTime: 3_600_000, queryFn: async () => {
    const { data, error } = await supabase.rpc('termometro_federal_posicao'); if (error) throw error; return (data ?? null) as string | null
  } })
}
