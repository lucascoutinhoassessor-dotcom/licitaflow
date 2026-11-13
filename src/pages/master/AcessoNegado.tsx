import { useNavigate } from 'react-router-dom'
import { ShieldX } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'

/** Usuário logado no app, mas sem permissão de master. */
export function AcessoNegadoMaster() {
  const { user, sair } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="flex min-h-full items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <div className="w-full max-w-sm text-center">
        <ShieldX className="mx-auto h-12 w-12 text-red-400" />
        <h1 className="mt-4 text-lg font-semibold">Acesso restrito</h1>
        <p className="mt-2 text-sm text-zinc-400">A conta {user?.email} não tem acesso ao console master.</p>
        <button
          onClick={async () => {
            await sair()
            navigate('/master/entrar', { replace: true })
          }}
          className="mt-6 h-10 w-full rounded-md bg-amber-500 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
        >
          Entrar com outra conta
        </button>
      </div>
    </div>
  )
}
