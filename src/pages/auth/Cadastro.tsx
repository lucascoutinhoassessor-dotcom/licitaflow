import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MailCheck, Ticket } from 'lucide-react'
import { guardarCupomPendente, normalizarCupom, previaCupom, rotuloCupomCliente, useCupomPendente } from '@/lib/cupom'
import { supabase, mensagemErro } from '@/lib/supabase'
import { contaEmailAPI } from '@/lib/contaEmail'
import { Aviso, Button, Campo, Input, InputSenha } from '@/components/ui'
import { AuthShell } from './AuthShell'
import { useDiasTeste } from '@/hooks/useDiasTeste'
import { normalizarWhatsapp } from '@/lib/telefone'

export default function Cadastro() {
  const dias = useDiasTeste()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const voltar = params.get('voltar')
  const destino = voltar && voltar.startsWith('/') && !voltar.startsWith('//') ? voltar : '/onboarding'
  // Link de campanha (?cupom=): guarda o cupom e aplica sozinho quando a conta da empresa for criada.
  const cupomLink = normalizarCupom(params.get('cupom'))
  const cupomGuardado = useCupomPendente()
  const cupom = useQuery({ queryKey: ['previa-cupom', cupomGuardado], enabled: !!cupomGuardado, retry: false, staleTime: 300_000, queryFn: () => previaCupom(cupomGuardado!) })
  useEffect(() => { if (cupomLink) guardarCupomPendente(cupomLink) }, [cupomLink])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    const telefone = normalizarWhatsapp(whatsapp)
    if (!telefone) return setErro('Informe um WhatsApp válido com DDD, por exemplo (11) 91234-5678.')
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.')
    setEnviando(true)
    // E-mail de confirmação pela plataforma (nome e logo do LicitaForce); sem ele configurado, segue o cadastro padrão do Supabase.
    try {
      if (await contaEmailAPI({ acao: 'cadastrar', nome: nome.trim(), email: email.trim(), telefone, senha, voltar: destino })) {
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
      options: { data: { nome: nome.trim(), telefone }, emailRedirectTo: `${window.location.origin}${destino}` },
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
      subtitulo={dias > 0 ? `${dias} dias grátis. Sem cartão de crédito.` : 'Crie sua conta e contrate um plano para começar.'}
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
        {cupomGuardado && cupom.data && <p role="status" className="flex items-start gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"><Ticket className="mt-0.5 h-4 w-4 shrink-0" /><span>Cupom <strong>{cupom.data.codigo}</strong>: {rotuloCupomCliente(cupom.data)}. {cupom.data.tipo === 'dias' ? 'Entra sozinho assim que você criar a conta da sua empresa.' : 'Já fica aplicado na hora de contratar o plano.'}</span></p>}
        {cupomGuardado && cupom.isError && <p className="text-sm text-destructive">Cupom {cupomGuardado}: {mensagemErro(cupom.error)} <button type="button" className="underline" onClick={() => guardarCupomPendente(null)}>Remover</button></p>}
        <Campo rotulo="Seu nome" htmlFor="nome">
          <Input id="nome" autoComplete="name" required value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Campo rotulo="E-mail" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Campo rotulo="WhatsApp" htmlFor="whatsapp" ajuda="Com DDD. Usado para avisos urgentes de prazos e disputas.">
          <Input id="whatsapp" type="tel" inputMode="tel" autoComplete="tel" required placeholder="(11) 91234-5678" maxLength={20} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
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
