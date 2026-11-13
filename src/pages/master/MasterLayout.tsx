import { NavLink, Outlet, Link } from 'react-router-dom'
import { Activity, ArrowLeft, Building2, LayoutDashboard, ShieldCheck, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/ui'

const abas = [
  { rota: '/master', rotulo: 'Visão geral', icone: LayoutDashboard, end: true },
  { rota: '/master/organizacoes', rotulo: 'Organizações', icone: Building2 },
  { rota: '/master/usuarios', rotulo: 'Usuários', icone: Users },
  { rota: '/master/atividade', rotulo: 'Atividade', icone: Activity },
]

export default function MasterLayout() {
  return (
    <div className="min-h-full bg-background">
      <header className="sticky top-0 z-30 border-b bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Logo claro />
          <span className="flex items-center gap-1.5 rounded-full bg-warning/20 px-2.5 py-0.5 text-xs font-semibold text-warning">
            <ShieldCheck className="h-3.5 w-3.5" /> MASTER
          </span>
          <div className="flex-1" />
          <Link to="/app" className="flex items-center gap-1.5 text-sm text-sidebar-muted hover:text-sidebar-foreground">
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Voltar ao app</span>
          </Link>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4">
          {abas.map((a) => (
            <NavLink
              key={a.rota}
              to={a.rota}
              end={a.end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors',
                  isActive ? 'border-accent text-sidebar-foreground' : 'border-transparent text-sidebar-muted hover:text-sidebar-foreground',
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
