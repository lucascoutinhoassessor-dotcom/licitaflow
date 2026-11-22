import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { supabase, mensagemErro } from '@/lib/supabase'
import { contaEmailAPI } from '@/lib/contaEmail'
import { Aviso, Button, Campo, Input, InputSenha } from '@/components/ui'
import { AuthShell } from './AuthShell'
import { useDiasTeste } from '@/hooks/useDiasTeste'

export default function Cadastro() {
  const dias = useDiasTeste()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const voltar = params.get('voltar')
  const destino = voltar && voltar.startsWith('/') && !voltar.startsWith('//') ? voltar : '/onboarding'

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.')
    setEnviando(true)
    // E-mail de confirmação pela plataforma (nome e logo do LicitaFlow); sem ele configurado, segue o cadastro padrão do Supabase.
    try {
      if (await contaEmailAPI({ acao: 'cadastrar', nome: nome.trim(), email: email.trim(), senha, voltar: destino })) {
        setEnviando(false)
        return setConfirmar(true)
      }
    } catch (e) {
      setEnviando(false)
      return setErro(mensagemErro(e))
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: senha,
      options: { data: { nome: nome.trim() }, emailRedirectTo: `${window.location.origin}${destino}` },
    })
    setEnviando(false)
    if (error) return setErro(mensagemErro(error))
    // E-mail já cadastrado: o Supabase responde "sucesso" sem identidades e não envia e-mail.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      return setErro('Já existe uma conta com este e-mail. Use "Entrar" ou "Esqueci minha senha".')
    }
    if (data.session) navigate(destino, { replace: true })
    else setConfirmar(true)
  }

  if (confirmar) {
    return (
      <AuthShell titulo="Confirme seu e-mail">
        <div className="flex flex-col items-center gap-3 text-center">
          <MailCheck className="h-12 w-12 text-accent" />
          <p className="text-sm text-muted-foreground">
            Enviamos um link de confirmação para <strong className="text-foreground">{email}</strong>. Clique nele para ativar sua conta e continuar o cadastro.
          </p>
          <Link to="/entrar" className="text-sm font-medium text-primary hover:underline">
            Voltar para o login
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      titulo="Criar sua conta"
      subtitulo={`${dias} dias grátis. Sem cartão de crédito.`}
      rodape={
        <>
          Já tem conta?{' '}
          <Link to="/entrar" className="font-medium text-primary hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={enviar} className="space-y-4">
        {erro && <Aviso>{erro}</Aviso>}
        <Campo rotulo="Seu nome" htmlFor="nome">
          <Input id="nome" autoComplete="name" required value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Campo rotulo="E-mail" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Campo rotulo="Senha" htmlFor="senha" ajuda="Mínimo de 8 caracteres.">
          <InputSenha id="senha" autoComplete="new-password" required minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} />
        </Campo>
        <Button type="submit" className="w-full" carregando={enviando}>
          Criar conta
        </Button>
      </form>
    </AuthShell>
  )
}
