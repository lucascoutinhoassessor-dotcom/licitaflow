import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthProvider'
import type { Empresa, OrganizacaoComPapel, Papel } from '@/types/db'
import { consultarComLimite } from '@/lib/conexao'
import { FalhaAcesso } from '@/components/FalhaAcesso'

interface OrgCtx {
  carregando: boolean
  organizacoes: OrganizacaoComPapel[]
  org: OrganizacaoComPapel | null
  papel: Papel | null
  podeEditar: boolean
  podeAdministrar: boolean
  empresas: Empresa[]
  /** empresa selecionada; null = "todas as empresas" (útil para assessorias) */
  empresa: Empresa | null
  trocarOrg: (id: string) => void
  trocarEmpresa: (id: string | null) => void
  recarregar: () => Promise<void>
}

const Ctx = createContext<OrgCtx | null>(null)

function ler(chave: string) {
  try {
    return localStorage.getItem(chave)
  } catch {
    return null
  }
}
function gravar(chave: string, valor: string | null) {
  try {
    if (valor) localStorage.setItem(chave, valor)
    else localStorage.removeItem(chave)
  } catch {
    /* armazenamento indisponível */
  }
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [orgId, setOrgId] = useState<string | null>(() => ler('lf-org'))
  const [empresaId, setEmpresaId] = useState<string | null>(() => ler('lf-empresa'))

  const orgsQ = useQuery({
    queryKey: ['organizacoes', user?.id],
    enabled: !!user,
    refetchInterval: 30_000,
    refetchOnWindowFocus: 'always',
    queryFn: async ({ signal }) => {
      const { data, error } = await consultarComLimite(sinal => supabase.rpc('minhas_organizacoes').abortSignal(sinal), signal)
      if (error) throw error
      return (data ?? []) as OrganizacaoComPapel[]
    },
  })

  const organizacoes = useMemo(() => orgsQ.data ?? [], [orgsQ.data])
  const org = organizacoes.find((o) => o.id === orgId) ?? organizacoes[0] ?? null

  const empresasQ = useQuery({
    queryKey: ['empresas', org?.id],
    enabled: !!org && !org.suspensa,
    refetchOnWindowFocus: true,
    queryFn: async ({ signal }) => {
      const { data, error } = await consultarComLimite(sinal => supabase.from('empresas').select('*').eq('org_id', org!.id).order('razao_social').abortSignal(sinal), signal)
      if (error) throw error
      return data as Empresa[]
    },
  })

  const empresas = useMemo(() => empresasQ.data ?? [], [empresasQ.data])
  const empresa = empresas.find((e) => e.id === empresaId) ?? (empresas.length === 1 ? empresas[0] : null)

  useEffect(() => {
    if (org && org.id !== orgId) {
      setOrgId(org.id)
      gravar('lf-org', org.id)
    }
  }, [org, orgId])

  const trocarOrg = useCallback((id: string) => {
    setOrgId(id)
    gravar('lf-org', id)
    setEmpresaId(null)
    gravar('lf-empresa', null)
  }, [])

  const trocarEmpresa = useCallback((id: string | null) => {
    setEmpresaId(id)
    gravar('lf-empresa', id)
  }, [])

  const recarregar = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['organizacoes'] })
    await qc.invalidateQueries({ queryKey: ['empresas'] })
  }, [qc])

  const papel = org?.papel ?? null
  const valor = useMemo<OrgCtx>(
    () => ({
      carregando: orgsQ.isPending || (!!org && !org.suspensa && empresasQ.isPending),
      organizacoes,
      org,
      papel,
      podeEditar: papel === 'owner' || papel === 'admin' || papel === 'membro',
      podeAdministrar: papel === 'owner' || papel === 'admin',
      empresas,
      empresa,
      trocarOrg,
      trocarEmpresa,
      recarregar,
    }),
    [orgsQ.isPending, empresasQ.isPending, organizacoes, org, papel, empresas, empresa, trocarOrg, trocarEmpresa, recarregar],
  )

  // Falha ou consulta pausada pela rede não significa que o cadastro está vazio.
  if ((orgsQ.data === undefined && (orgsQ.isError || orgsQ.fetchStatus === 'paused')) ||
      (!!org && !org.suspensa && empresasQ.data === undefined && (empresasQ.isError || empresasQ.fetchStatus === 'paused'))) {
    return <FalhaAcesso aoTentar={recarregar} />
  }

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useOrg() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useOrg fora do OrgProvider')
  return c
}

/** Igual a useOrg, mas devolve null fora do OrgProvider (telas compartilhadas com o console master). */
export function useOrgOpcional() {
  return useContext(Ctx)
}
