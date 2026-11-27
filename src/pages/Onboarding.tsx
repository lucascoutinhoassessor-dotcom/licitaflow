import { ContaSuspensa } from '@/pages/ContaSuspensa'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Briefcase, Building2, Check } from 'lucide-react'
import { supabase, mensagemErro } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useOrg } from '@/providers/OrgProvider'
import { useAuth } from '@/providers/AuthProvider'
import { Aviso, Button, Campo, Card, Carregando, Input, Logo } from '@/components/ui'
import { EmpresaForm } from '@/components/EmpresaForm'
import type { TipoOrg } from '@/types/db'
import { useEhAdmin } from '@/hooks/useAdmin'

export default function Onboarding() {
  const { org, empresas, carregando, recarregar, trocarOrg, trocarEmpresa } = useOrg()
  const { sair } = useAuth()
  const { ehAdmin, carregando: carregandoAdmin } = useEhAdmin()
  const navigate = useNavigate()
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<TipoOrg>('fornecedor')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  if (carregando || carregandoAdmin) return <Carregando telaCheia />
  // Conta de administração sem organização própria: o lugar dela é o console
  if (ehAdmin && !org) return <Navigate to="/master" replace />
  if (org?.suspensa) return <ContaSuspensa />
  if (org && empresas.length > 0) return <Navigate to="/app" replace />

  const etapa = org ? 2 : 1

  async function criarOrg(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setSalvando(true)
    const { data, error } = await supabase.rpc('criar_organizacao', { p_nome: nome, p_tipo: tipo })
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    trocarOrg(data as string)
    await recarregar()
  }

  const opcoes: { valor: TipoOrg; titulo: string; texto: string; icone: typeof Building2 }[] = [
    { valor: 'fornecedor', titulo: 'Sou fornecedor', texto: 'Minha empresa participa de licitações.', icone: Building2 },
    { valor: 'assessoria', titulo: 'Sou assessoria', texto: 'Gerencio licitações de várias empresas clientes.', icone: Briefcase },
  ]

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex items-center justify-between">
          <Logo />
          <button onClick={sair} className="text-sm text-muted-foreground hover:text-foreground">
            Sair
          </button>
        </div>

        <ol className="mb-6 flex items-center gap-3 text-sm">
          {['Organização', 'Primeira empresa'].map((t, i) => (
            <li key={t} className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                  etapa > i + 1 ? 'bg-success text-success-foreground' : etapa === i + 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {etapa > i + 1 ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={etapa === i + 1 ? 'font-medium' : 'text-muted-foreground'}>{t}</span>
              {i === 0 && <span className="mx-1 h-px w-8 bg-border" />}
            </li>
          ))}
        </ol>

        <Card className="p-6 sm:p-8">
          {etapa === 1 ? (
            <form onSubmit={criarOrg} className="space-y-5">
              <div>
                <h1 className="text-xl font-semibold">Vamos configurar sua conta</h1>
                <p className="mt-1 text-sm text-muted-foreground">Leva menos de um minuto.</p>
              </div>
              {erro && <Aviso>{erro}</Aviso>}
              <div className="grid gap-3 sm:grid-cols-2">
                {opcoes.map((o) => (
                  <button
                    type="button"
                    key={o.valor}
                    onClick={() => setTipo(o.valor)}
                    className={cn('rounded-lg border p-4 text-left transition-colors', tipo === o.valor ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted')}
                  >
                    <o.icone className="mb-2 h-5 w-5 text-primary" />
                    <div className="font-medium">{o.titulo}</div>
                    <div className="text-xs text-muted-foreground">{o.texto}</div>
                  </button>
                ))}
              </div>
              <Campo rotulo={tipo === 'assessoria' ? 'Nome da assessoria' : 'Nome da sua empresa ou equipe'} htmlFor="nome">
                <Input id="nome" required minLength={2} maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} />
              </Campo>
              <Button type="submit" className="w-full" carregando={salvando}>
                Continuar
              </Button>
            </form>
          ) : (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-semibold">{org?.tipo === 'assessoria' ? 'Cadastre a primeira empresa cliente' : 'Cadastre sua empresa'}</h1>
                <p className="mt-1 text-sm text-muted-foreground">Digite o CNPJ: buscamos os dados da empresa automaticamente.</p>
              </div>
              <EmpresaForm
                orgId={org!.id}
                textoBotao="Concluir e entrar"
                aoSalvar={async (id) => {
                  trocarEmpresa(id)
                  await recarregar()
                  navigate('/app', { replace: true })
                }}
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
