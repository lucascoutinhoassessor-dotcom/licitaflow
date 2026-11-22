import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, mensagemErro } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'
import { Aviso, Button, Campo, Carregando, Input, InputSenha } from '@/components/ui'
import { AuthShell } from './AuthShell'

export default function RedefinirSenha() {
  const { user, carregando } = useAuth()
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const navigate = useNavigate()
  // Link do e-mail da plataforma: ?token_hash=...&type=recovery. Valida o link e abre a sessão de troca de senha.
  const [params] = useSearchParams()
  const tokenHash = params.get('token_hash')
  const [validando, setValidando] = useState(!!tokenHash)
  const [linkRuim, setLinkRuim] = useState(false)
  useEffect(() => {
    if (!tokenHash) return
    let ativo = true
    supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }).then(({ error }) => {
      if (!ativo) return
      if (error) setLinkRuim(true)
      window.history.replaceState(null, '', '/redefinir-senha')
      setValidando(false)
    })
    return () => { ativo = false }
  }, [tokenHash])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.')
    if (senha !== confirma) return setErro('As senhas não conferem.')
    setEnviando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setEnviando(false)
    if (error) return setErro(mensagemErro(error))
    navigate('/app', { replace: true })
  }

  if (carregando || validando) return <Carregando telaCheia />

  if (!user || linkRuim) {
    return (
      <AuthShell titulo="Link inválido ou expirado">
        <p className="text-sm text-muted-foreground">Peça um novo link de recuperação de senha.</p>
        <Link to="/recuperar-senha" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          Recuperar senha
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell titulo="Criar nova senha">
      <form onSubmit={enviar} className="space-y-4">
        {erro && <Aviso>{erro}</Aviso>}
        <Campo rotulo="Nova senha" htmlFor="senha" ajuda="Mínimo de 8 caracteres.">
          <InputSenha id="senha" autoComplete="new-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
        </Campo>
        <Campo rotulo="Confirmar nova senha" htmlFor="confirma">
          <InputSenha id="confirma" autoComplete="new-password" required value={confirma} onChange={(e) => setConfirma(e.target.value)} />
        </Campo>
        <Button type="submit" className="w-full" carregando={enviando}>
          Salvar nova senha
        </Button>
      </form>
    </AuthShell>
  )
}
