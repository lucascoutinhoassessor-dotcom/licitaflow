import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, mensagemErro } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'
import { Aviso, Button, Carregando } from '@/components/ui'
import { NOME_PAPEL, type Papel } from '@/types/db'
import { AuthShell } from './auth/AuthShell'

export default function Convite() {
  const { token } = useParams()
  const { user, carregando } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [erro, setErro] = useState('')
  const [aceitando, setAceitando] = useState(false)

  const convite = useQuery({
    queryKey: ['convite', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ver_convite', { p_token: token })
      if (error) throw error
      return (data as { org_nome: string; email: string; papel: Papel; expirado: boolean; usado: boolean }[])[0] ?? null
    },
  })

  if (carregando || convite.isLoading) return <Carregando telaCheia />

  const c = convite.data
  if (!c || c.expirado || c.usado) {
    return (
      <AuthShell titulo="Convite indisponível">
        <p className="text-sm text-muted-foreground">
          {!c ? 'Este link de convite não existe.' : c.usado ? 'Este convite já foi usado.' : 'Este convite expirou. Peça um novo ao administrador.'}
        </p>
      </AuthShell>
    )
  }

  const voltar = `/convite/${token}`

  async function aceitar() {
    setErro('')
    setAceitando(true)
    const { data, error } = await supabase.rpc('aceitar_convite', { p_token: token })
    setAceitando(false)
    if (error) return setErro(mensagemErro(error))
    try {
      localStorage.setItem('lf-org', data as string)
      localStorage.removeItem('lf-empresa')
    } catch {
      /* armazenamento indisponível */
    }
    await qc.invalidateQueries()
    navigate('/app', { replace: true })
  }

  return (
    <AuthShell titulo={`Convite para ${c.org_nome}`} subtitulo={`Você foi convidado como ${NOME_PAPEL[c.papel].toLowerCase()}.`}>
      <div className="space-y-4">
        {erro && <Aviso>{erro}</Aviso>}
        {user ? (
          <>
            {user.email?.toLowerCase() !== c.email.toLowerCase() && (
              <Aviso>
                Este convite foi enviado para {c.email}, mas você está conectado como {user.email}. Saia e entre com o e-mail correto.
              </Aviso>
            )}
            <Button className="w-full" onClick={aceitar} carregando={aceitando} disabled={user.email?.toLowerCase() !== c.email.toLowerCase()}>
              Aceitar convite
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Entre ou crie uma conta com <strong className="text-foreground">{c.email}</strong> para aceitar.
            </p>
            <div className="flex gap-2">
              <Link to={`/entrar?voltar=${encodeURIComponent(voltar)}`} className="flex-1">
                <Button variante="contorno" className="w-full">
                  Entrar
                </Button>
              </Link>
              <Link to={`/cadastro?voltar=${encodeURIComponent(voltar)}`} className="flex-1">
                <Button className="w-full">Criar conta</Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </AuthShell>
  )
}
