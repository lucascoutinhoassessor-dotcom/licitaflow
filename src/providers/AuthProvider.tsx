import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { iniciarSessao } from '@/lib/iniciarSessao'
import { FalhaAcesso } from '@/components/FalhaAcesso'

interface AuthCtx {
  session: Session | null
  user: User | null
  carregando: boolean
  /** true quando o usuário chegou pelo link de recuperação de senha */
  recuperandoSenha: boolean
  sair: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const ultimoUsuario = useRef<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [recuperandoSenha, setRecuperandoSenha] = useState(false)
  const [erro, setErro] = useState(false)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    setErro(false)
    setCarregando(true)
    return iniciarSessao(supabase.auth, (s, evento) => {
      const id = s?.user.id ?? null
      if (ultimoUsuario.current !== id) {
        qc.clear()
        if (ultimoUsuario.current) {
          try { localStorage.removeItem('lf-org'); localStorage.removeItem('lf-empresa') } catch { /* armazenamento indisponível */ }
        }
        ultimoUsuario.current = id
        setRecuperandoSenha(false)
      }
      setSession(s)
      setCarregando(false)
      setErro(false)
      if (evento === 'PASSWORD_RECOVERY') setRecuperandoSenha(true)
      if (evento === 'USER_UPDATED' || evento === 'SIGNED_OUT') setRecuperandoSenha(false)
    }, () => { setErro(true); setCarregando(false) })
  }, [qc, tentativa])

  const sair = async () => {
    await supabase.auth.signOut()
    try {
      localStorage.removeItem('lf-org')
      localStorage.removeItem('lf-empresa')
    } catch {
      /* armazenamento indisponível */
    }
  }

  if (erro) return <FalhaAcesso aoTentar={() => setTentativa(n => n + 1)} />

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, carregando, recuperandoSenha, sair }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth fora do AuthProvider')
  return c
}
