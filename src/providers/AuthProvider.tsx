import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

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
  const [session, setSession] = useState<Session | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [recuperandoSenha, setRecuperandoSenha] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCarregando(false)
    })
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      setSession(s)
      if (evento === 'PASSWORD_RECOVERY') setRecuperandoSenha(true)
      if (evento === 'USER_UPDATED' || evento === 'SIGNED_OUT') setRecuperandoSenha(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const sair = async () => {
    await supabase.auth.signOut()
    try {
      localStorage.removeItem('lf-org')
      localStorage.removeItem('lf-empresa')
    } catch {
      /* armazenamento indisponível */
    }
  }

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
