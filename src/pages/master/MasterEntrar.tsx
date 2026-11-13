import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldCheck } from 'lucide-react'
import { supabase, mensagemErro } from '@/lib/supabase'

/** Login exclusivo do console master. Só administradores da plataforma passam daqui. */
export default function MasterEntrar() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const navigate = useNavigate()

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    if (error) {
      setEnviando(false)
      return setErro(mensagemErro(error))
    }
    const { data: admin } = await supabase.rpc('is_platform_admin')
    setEnviando(false)
    if (admin !== true) {
      await supabase.auth.signOut()
      return setErro('Esta conta não tem acesso ao console master.')
    }
    navigate('/master', { replace: true })
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.12),transparent_55%)]" />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10">
            <ShieldCheck className="h-7 w-7 text-amber-400" />
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight">LicitaFlow Console</h1>
          <p className="mt-1 text-sm text-zinc-400">Acesso restrito à administração da plataforma</p>
        </div>
        <form onSubmit={enviar} className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 backdrop-blur">
          {erro && <div role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{erro}</div>}
          <div className="space-y-1.5">
            <label htmlFor="m-email" className="text-sm font-medium text-zinc-300">E-mail</label>
            <input
              id="m-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="m-senha" className="text-sm font-medium text-zinc-300">Senha</label>
            <input
              id="m-senha"
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
          </div>
          <button
            type="submit"
            disabled={enviando}
            className="h-10 w-full rounded-md bg-amber-500 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:opacity-60"
          >
            {enviando ? 'Verificando…' : 'Entrar no console'}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-zinc-500">Todas as ações neste console ficam registradas.</p>
      </motion.div>
    </div>
  )
}
