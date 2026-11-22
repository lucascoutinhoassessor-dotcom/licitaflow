import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { destinoSeguro } from '@/lib/contaEmail'
import { Carregando } from '@/components/ui'
import { AuthShell } from './AuthShell'

/** Link de confirmação do cadastro enviado pelo e-mail da plataforma (?token_hash=...&type=signup). */
export default function ConfirmarEmail() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [erro, setErro] = useState(false)
  const tokenHash = params.get('token_hash')
  const destino = destinoSeguro(params.get('voltar'))

  useEffect(() => {
    if (!tokenHash) { setErro(true); return }
    let ativo = true
    supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'signup' }).then(({ error }) => {
      if (!ativo) return
      if (error) setErro(true)
      else navigate(destino, { replace: true })
    })
    return () => { ativo = false }
  }, [tokenHash, destino, navigate])

  if (!erro) return <Carregando telaCheia />
  return (
    <AuthShell titulo="Link inválido ou expirado">
      <p className="text-sm text-muted-foreground">
        Este link de confirmação já foi usado ou expirou. Se você já confirmou, é só entrar. Se não, use “Esqueci minha senha”: o link que chega por e-mail também confirma a conta.
      </p>
      <div className="mt-4 flex gap-4 text-sm font-medium">
        <Link to="/entrar" className="text-primary hover:underline">Entrar</Link>
        <Link to="/recuperar-senha" className="text-primary hover:underline">Esqueci minha senha</Link>
      </div>
    </AuthShell>
  )
}
