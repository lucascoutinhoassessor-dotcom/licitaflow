import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthProvider'
import type { Empresa, OrganizacaoComPapel, Papel } from '@/types/db'

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
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memberships')
        .select('papel, organizations(*)')
        .eq('user_id', user!.id)
        .order('created_at')
      if (error) throw error
      return (data ?? [])
        .filter((m: any) => m.organizations)
        .map((m: any) => ({ ...m.organizations, papel: m.papel })) as OrganizacaoComPapel[]
    },
  })

  const organizacoes = useMemo(() => orgsQ.data ?? [], [orgsQ.data])
  const org = organizacoes.find((o) => o.id === orgId) ?? organizacoes[0] ?? null

  const empresasQ = useQuery({
    queryKey: ['empresas', org?.id],
    enabled: !!org,
    queryFn: async () => {
      const { data, error } = await supabase.from('empresas').select('*').eq('org_id', org!.id).order('razao_social')
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
      carregando: orgsQ.isLoading || (!!org && empresasQ.isLoading),
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
    [orgsQ.isLoading, empresasQ.isLoading, organizacoes, org, papel, empresas, empresa, trocarOrg, trocarEmpresa, recarregar],
  )

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useOrg() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useOrg fora do OrgProvider')
  return c
}
