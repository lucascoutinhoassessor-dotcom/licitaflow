import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Activity, Building2, LayoutDashboard, LogOut, ShieldCheck, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/AuthProvider'

const abas = [
  { rota: '/master', rotulo: 'Visão geral', icone: LayoutDashboard, end: true },
  { rota: '/master/organizacoes', rotulo: 'Organizações', icone: Building2 },
  { rota: '/master/usuarios', rotulo: 'Usuários', icone: Users },
  { rota: '/master/atividade', rotulo: 'Atividade', icone: Activity },
]

/** Console master: área independente do app do cliente, com identidade própria. */
export default function MasterLayout() {
  const { user, sair } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="dark console min-h-full bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10">
            <ShieldCheck className="h-4 w-4 text-amber-400" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">LicitaFlow Console</div>
            <div className="hidden text-[11px] text-zinc-500 sm:block">{user?.email}</div>
          </div>
          <div className="flex-1" />
          <button
            onClick={async () => {
              await sair()
              navigate('/master/entrar', { replace: true })
            }}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {abas.map((a) => (
            <NavLink
              key={a.rota}
              to={a.rota}
              end={a.end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors',
                  isActive ? 'border-amber-400 text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-200',
                )
              }
            >
              <a.icone className="h-4 w-4" />
              {a.rotulo}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl p-4 lg:p-8">
        <Outlet />
      </main>
    </div>
  )
}
