import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, mensagemErro } from '@/lib/supabase'
import { Aviso, Button, Campo, Input } from '@/components/ui'
import { AuthShell } from './AuthShell'

export default function Entrar() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const voltar = params.get('voltar')
  const destino = voltar && voltar.startsWith('/') && !voltar.startsWith('//') ? voltar : '/app'

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    if (error) {
      setEnviando(false)
      return setErro(mensagemErro(error))
    }
    // Conta de administração da plataforma vai direto para o console master
    const { data: admin } = await supabase.rpc('is_platform_admin')
    setEnviando(false)
    navigate(admin === true && !voltar ? '/master' : destino, { replace: true })
  }

  return (
    <AuthShell
      titulo="Entrar no LicitaFlow"
      subtitulo="Acesse sua central de licitações."
      rodape={
        <>
          Ainda não tem conta?{' '}
          <Link to={`/cadastro${voltar ? `?voltar=${encodeURIComponent(voltar)}` : ''}`} className="font-medium text-primary hover:underline">
            Criar conta grátis
          </Link>
        </>
      }
    >
      <form onSubmit={enviar} className="space-y-4">
        {erro && <Aviso>{erro}</Aviso>}
        <Campo rotulo="E-mail" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Campo rotulo="Senha" htmlFor="senha">
          <Input id="senha" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
        </Campo>
        <div className="flex justify-end">
          <Link to="/recuperar-senha" className="text-sm text-primary hover:underline">
            Esqueci minha senha
          </Link>
        </div>
        <Button type="submit" className="w-full" carregando={enviando}>
          Entrar
        </Button>
      </form>
    </AuthShell>
  )
}
