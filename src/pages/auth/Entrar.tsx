import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, mensagemErro } from '@/lib/supabase'
import { Aviso, Button, Campo, Input, InputSenha } from '@/components/ui'
import { AuthShell } from './AuthShell'
import { masterSeparado } from '@/lib/pwa'
import { useConteudoSite } from '@/hooks/useConteudoSite'
import { useDiasTeste } from '@/hooks/useDiasTeste'
import { comDias, linkSeguro } from '@/lib/conteudoSite'
import { consultarComLimite } from '@/lib/conexao'

export default function Entrar() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const voltar = params.get('voltar')
  const destino = voltar && voltar.startsWith('/') && !voltar.startsWith('//') ? voltar : '/app'
  const { conteudo, carregando } = useConteudoSite()
  const dias = useDiasTeste()

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
      if (error) return setErro(mensagemErro(error))
      // Em produção o master tem endereço e login próprios; aqui a conta entra no app do usuário.
      if (masterSeparado()) return navigate(destino, { replace: true })
      // Conta de administração da plataforma vai direto para o console master.
      const { data: admin } = await consultarComLimite(signal => supabase.rpc('is_platform_admin').abortSignal(signal))
      navigate(admin === true && !voltar ? '/master' : destino, { replace: true })
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setEnviando(false)
    }
  }

  // Textos editados no master (Landing page → Geral → Tela de login). O convite só aparece depois de carregar,
  // para não piscar uma oferta antiga; texto do link vazio esconde o convite.
  const l = conteudo.login
  const textoLink = comDias(l.cadastro.texto, dias).trim()
  const link = linkSeguro(l.cadastro.link) || '/cadastro'
  const classeLink = 'font-medium text-primary hover:underline'
  const convite = carregando || !textoLink ? undefined : (
    <>
      {l.pergunta && <>{comDias(l.pergunta, dias)} </>}
      {link.startsWith('/') ? (
        <Link to={link === '/cadastro' && voltar ? `/cadastro?voltar=${encodeURIComponent(voltar)}` : link} className={classeLink}>{textoLink}</Link>
      ) : (
        <a href={link} className={classeLink} {...(/^https?:/i.test(link) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{textoLink}</a>
      )}
    </>
  )

  return (
    <AuthShell titulo={comDias(l.titulo, dias) || 'Entrar'} subtitulo={comDias(l.subtitulo, dias) || undefined} rodape={convite}>
      <form onSubmit={enviar} className="space-y-4">
        {erro && <Aviso>{erro}</Aviso>}
        <Campo rotulo="E-mail" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Campo rotulo="Senha" htmlFor="senha">
          <InputSenha id="senha" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
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
