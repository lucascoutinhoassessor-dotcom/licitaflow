import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Activity, FileText, History, Building2, LayoutDashboard, LogOut, ShieldCheck, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/AuthProvider'
import { MenuLateral } from '@/components/layout/MenuLateral'

const abas = [
  { rota: '/master', rotulo: 'Visão geral', icone: LayoutDashboard, end: true },
  { rota: '/master/organizacoes', rotulo: 'Organizações', icone: Building2 },
  { rota: '/master/usuarios', rotulo: 'Usuários', icone: Users },
  { rota: '/master/conteudo', rotulo: 'Landing page', icone: FileText },
  { rota: '/master/auditoria', rotulo: 'Auditoria', icone: History },
  { rota: '/master/atividade', rotulo: 'Atividade', icone: Activity },
]

/** Console master: área independente do app do cliente, com identidade própria. */
export default function MasterLayout() {
  const { user, sair } = useAuth()
  const navigate = useNavigate()

  const menu = <>
    <nav aria-label="Módulos do master" className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
      {abas.map(a => <NavLink key={a.rota} to={a.rota} end={a.end}
        className={({isActive}) => cn('flex min-h-11 items-center gap-3 rounded-md px-3 py-3 text-sm transition-colors', isActive ? 'bg-amber-500/15 font-medium text-amber-300' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100')}>
        <a.icone className="h-4 w-4 shrink-0"/>{a.rotulo}
      </NavLink>)}
    </nav>
    <div className="shrink-0 space-y-3 border-t border-zinc-800 p-4">
      <p className="truncate text-xs text-zinc-500">{user?.email}</p>
      <Link className="flex min-h-11 items-center text-sm text-zinc-300 hover:text-white" to="/" target="_blank" rel="noopener noreferrer">Ver site público ↗</Link>
      <button onClick={async () => { await sair(); navigate('/master/entrar', { replace: true }) }} className="flex min-h-11 w-full items-center gap-2 rounded px-3 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white"><LogOut className="h-4 w-4"/>Sair</button>
    </div>
  </>
  return (
    <div className="dark console flex h-dvh min-w-0 flex-col bg-zinc-950 text-zinc-100 xl:pl-72">
      <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-3 py-2 sm:px-5">
        <MenuLateral titulo="LicitaFlow Console" console>{menu}</MenuLateral>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10"><ShieldCheck className="h-5 w-5 text-amber-400"/></div>
        <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">Administração da plataforma</div><p className="truncate text-xs text-zinc-500">{user?.email}</p></div>
      </header>
      <main id="conteudo-principal" className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="painel-conteudo mx-auto w-full min-w-0 max-w-7xl p-4 lg:p-8"><Outlet /></div>
      </main>
    </div>
  )
}
