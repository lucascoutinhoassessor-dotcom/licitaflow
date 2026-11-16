import { InstalarApp } from '@/components/InstalarApp'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { supabase, mensagemErro } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'
import { useOrg } from '@/providers/OrgProvider'
import { Button, CabecalhoPagina, Campo, Card, Input, Select } from '@/components/ui'
import type { TipoOrg } from '@/types/db'

export default function Configuracoes() {
  const { user } = useAuth()
  const { org, podeAdministrar, recarregar } = useOrg()
  const [nome, setNome] = useState((user?.user_metadata?.nome as string) ?? '')
  const [orgNome, setOrgNome] = useState(org?.nome ?? '')
  const [orgTipo, setOrgTipo] = useState<TipoOrg>(org?.tipo ?? 'fornecedor')
  const [salvandoPerfil, setSalvandoPerfil] = useState(false)
  const [salvandoOrg, setSalvandoOrg] = useState(false)

  async function salvarPerfil(e: FormEvent) {
    e.preventDefault()
    setSalvandoPerfil(true)
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.auth.updateUser({ data: { nome: nome.trim() } }),
      supabase.from('profiles').update({ nome: nome.trim() }).eq('id', user!.id),
    ])
    setSalvandoPerfil(false)
    if (e1 || e2) return toast.error(mensagemErro(e1 || e2))
    toast.success('Perfil atualizado.')
  }

  async function salvarOrg(e: FormEvent) {
    e.preventDefault()
    setSalvandoOrg(true)
    const { error } = await supabase.from('organizations').update({ nome: orgNome.trim(), tipo: orgTipo }).eq('id', org!.id)
    setSalvandoOrg(false)
    if (error) return toast.error(mensagemErro(error))
    toast.success('Organização atualizada.')
    recarregar()
  }

  return (
    <>
      <CabecalhoPagina titulo="Configurações" />
      <InstalarApp />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-semibold">Seu perfil</h2>
          <form onSubmit={salvarPerfil} className="mt-4 space-y-4">
            <Campo rotulo="Nome" htmlFor="nome">
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </Campo>
            <Campo rotulo="E-mail" htmlFor="email">
              <Input id="email" value={user?.email ?? ''} disabled />
            </Campo>
            <Button type="submit" carregando={salvandoPerfil}>
              Salvar perfil
            </Button>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold">Organização</h2>
          <form onSubmit={salvarOrg} className="mt-4 space-y-4">
            <Campo rotulo="Nome" htmlFor="org-nome">
              <Input id="org-nome" value={orgNome} onChange={(e) => setOrgNome(e.target.value)} disabled={!podeAdministrar} />
            </Campo>
            <Campo rotulo="Tipo" htmlFor="org-tipo">
              <Select id="org-tipo" value={orgTipo} onChange={(e) => setOrgTipo(e.target.value as TipoOrg)} disabled={!podeAdministrar}>
                <option value="fornecedor">Fornecedor</option>
                <option value="assessoria">Assessoria (várias empresas)</option>
              </Select>
            </Campo>
            <div className="text-sm text-muted-foreground">
              Plano: <strong className="text-foreground">{org?.plano === 'trial' ? 'Teste grátis' : org?.plano}</strong>
            </div>
            {podeAdministrar && (
              <Button type="submit" carregando={salvandoOrg}>
                Salvar organização
              </Button>
            )}
          </form>
        </Card>
      </div>
    </>
  )
}
