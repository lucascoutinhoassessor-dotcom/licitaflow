import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase, mensagemErro } from '@/lib/supabase'
import { Aviso, Button, Campo, Input } from '@/components/ui'
import { AuthShell } from './AuthShell'

export default function RecuperarSenha() {
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    setEnviando(false)
    if (error) return setErro(mensagemErro(error))
    setEnviado(true)
  }

  return (
    <AuthShell
      titulo="Recuperar senha"
      subtitulo="Enviaremos um link para você criar uma nova senha."
      rodape={
        <Link to="/entrar" className="font-medium text-primary hover:underline">
          Voltar para o login
        </Link>
      }
    >
      {enviado ? (
        <Aviso tipo="sucesso">Se existir uma conta com {email}, você receberá o link em instantes. Confira também a caixa de spam.</Aviso>
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          {erro && <Aviso>{erro}</Aviso>}
          <Campo rotulo="E-mail" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Campo>
          <Button type="submit" className="w-full" carregando={enviando}>
            Enviar link
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
