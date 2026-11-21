import { useNavigate } from 'react-router-dom'
import { ShieldX, WifiOff } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'

/** Usuário logado no app, mas sem permissão de master — ou a verificação não respondeu. */
export function AcessoNegadoMaster({ falhaVerificacao = false, aoTentar }: { falhaVerificacao?: boolean; aoTentar?: () => void }) {
  const { user, sair } = useAuth()
  const navigate = useNavigate()
  const Icone = falhaVerificacao ? WifiOff : ShieldX
  return (
    <div className="flex min-h-full items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <div className="w-full max-w-sm text-center">
        <Icone className={`mx-auto h-12 w-12 ${falhaVerificacao ? 'text-amber-400' : 'text-red-400'}`} />
        <h1 className="mt-4 text-lg font-semibold">{falhaVerificacao ? 'Não foi possível verificar o acesso' : 'Acesso restrito'}</h1>
        <p className="mt-2 text-sm text-zinc-400">
          {falhaVerificacao
            ? `A sessão de ${user?.email} não respondeu agora. Tente de novo; se continuar, entre novamente.`
            : `A conta ${user?.email} não tem acesso ao console master.`}
        </p>
        {falhaVerificacao && aoTentar && (
          <button onClick={aoTentar} className="mt-6 h-10 w-full rounded-md bg-amber-500 text-sm font-semibold text-zinc-950 hover:bg-amber-400">
            Tentar de novo
          </button>
        )}
        <button
          onClick={async () => {
            await sair()
            navigate('/master/entrar', { replace: true })
          }}
          className={`mt-3 h-10 w-full rounded-md text-sm font-semibold ${falhaVerificacao ? 'border border-zinc-700 text-zinc-200 hover:bg-zinc-800' : 'mt-6 bg-amber-500 text-zinc-950 hover:bg-amber-400'}`}
        >
          {falhaVerificacao ? 'Entrar novamente' : 'Entrar com outra conta'}
        </button>
      </div>
    </div>
  )
}
