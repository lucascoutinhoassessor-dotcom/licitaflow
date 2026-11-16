import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
  const qc = useQueryClient()
  const ultimoUsuario = useRef<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [recuperandoSenha, setRecuperandoSenha] = useState(false)

  useEffect(() => {
    let ativo = true
    let eventoRecebido = false
    const aplicar = (s: Session | null) => {
      if (!ativo) return
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
    }
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      eventoRecebido = true
      aplicar(s)
      if (evento === 'PASSWORD_RECOVERY') setRecuperandoSenha(true)
      if (evento === 'USER_UPDATED' || evento === 'SIGNED_OUT') setRecuperandoSenha(false)
    })
    supabase.auth.getSession().then(({ data }) => { if (!eventoRecebido) aplicar(data.session) }).catch(() => { if (!eventoRecebido) aplicar(null) })
    return () => { ativo = false; data.subscription.unsubscribe() }
  }, [qc])

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
