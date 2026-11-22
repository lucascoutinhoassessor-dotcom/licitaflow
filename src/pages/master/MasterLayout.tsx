import { useEffect } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Settings, Wallet, Plug, CreditCard, Headphones, Megaphone, BarChart3, Activity, FileText, History, Building2, LayoutDashboard, LogOut, ShieldCheck, Users, Repeat, Receipt, Trophy, ExternalLink, Download, ToggleRight, Bot, Ticket, ScrollText, Volume2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useFinanceiro } from './Financeiro'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/AuthProvider'
import { MenuLateral } from '@/components/layout/MenuLateral'
import { useInstalacao } from '@/hooks/useInstalacao'
import { URL_SITE, masterSeparado, usarAppDoPainel } from '@/lib/pwa'

const grupos: { titulo: string; abas: { rota: string; rotulo: string; icone: typeof Settings; end?: boolean }[] }[] = [
  { titulo: 'Painel', abas: [{ rota: '/master', rotulo: 'Visão geral', icone: LayoutDashboard, end: true }] },
  { titulo: 'Clientes', abas: [
    { rota: '/master/organizacoes', rotulo: 'Organizações', icone: Building2 },
    { rota: '/master/usuarios', rotulo: 'Usuários', icone: Users },
    { rota: '/master/ranking', rotulo: 'Melhores clientes', icone: Trophy },
  ] },
  { titulo: 'Receita', abas: [
    { rota: '/master/financeiro', rotulo: 'Painel financeiro', icone: Wallet },
    { rota: '/master/assinaturas', rotulo: 'Assinaturas', icone: Repeat },
    { rota: '/master/cobrancas', rotulo: 'Cobranças avulsas', icone: Receipt },
    { rota: '/master/planos', rotulo: 'Planos e limites', icone: CreditCard },
    { rota: '/master/cupons', rotulo: 'Cupons', icone: Ticket },
    { rota: '/master/consumo-ia', rotulo: 'Consumo de IA', icone: Bot },
  ] },
  { titulo: 'Operação', abas: [
    { rota: '/master/funcionalidades', rotulo: 'Funcionalidades', icone: ToggleRight },
    { rota: '/master/integracoes', rotulo: 'Asaas e integrações', icone: Plug },
    { rota: '/master/relatorios', rotulo: 'Relatórios', icone: BarChart3 },
    { rota: '/master/atividade', rotulo: 'Atividade', icone: Activity },
    { rota: '/master/logs', rotulo: 'Logs', icone: ScrollText },
  ] },
  { titulo: 'Relacionamento', abas: [
    { rota: '/master/suporte', rotulo: 'Suporte e sugestões', icone: Headphones },
    { rota: '/master/avisos', rotulo: 'Avisos aos clientes', icone: Megaphone },
    { rota: '/master/som-aviso', rotulo: 'Som do aviso', icone: Volume2 },
    { rota: '/master/conteudo', rotulo: 'Landing page', icone: FileText },
  ] },
  { titulo: 'Governança', abas: [
    { rota: '/master/auditoria', rotulo: 'Auditoria', icone: History },
    { rota: '/master/configuracoes', rotulo: 'Configurações', icone: Settings },
  ] },
]

/** Console master: área independente do app do cliente, com identidade própria. */
export default function MasterLayout() {
  const { user, sair } = useAuth()
  const navigate = useNavigate()
  const instalacao = useInstalacao()
  // Enquanto estiver no master, o navegador oferece o app "LicitaFlow Master" (abre em /master).
  useEffect(() => { usarAppDoPainel(true); return () => usarAppDoPainel(false) }, [])

  const fin = useFinanceiro()
  const chamados = useQuery({
    queryKey: ['admin-chamados-abertos'],
    queryFn: async () => {
      const { count, error } = await supabase.from('suporte_chamados').select('id', { count: 'exact', head: true }).in('status', ['aberto', 'em_andamento'])
      if (error) throw error
      return count ?? 0
    },
    refetchInterval: 60_000,
  })
  // Contadores de pendência ao lado dos itens do menu.
  const pendencias: Record<string, number> = {
    '/master/assinaturas': (fin.data?.assinaturas.atrasadas ?? 0),
    '/master/suporte': chamados.data ?? 0,
    '/master/integracoes': fin.data?.gateway && !fin.data.gateway.ativo ? 1 : 0,
  }
  const inicial = (user?.email ?? '?').slice(0, 1).toUpperCase()

  const menu = <>
    <nav aria-label="Módulos do master" className="rolagem-discreta min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-8 pt-4 [mask-image:linear-gradient(to_bottom,black_calc(100%-2rem),transparent)]">
      {grupos.map(g => <div key={g.titulo}>
        <p className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{g.titulo}</p>
        <div className="space-y-0.5">{g.abas.map(a => <NavLink key={a.rota} to={a.rota} end={a.end}
          className={({isActive}) => cn('group relative flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] transition-colors', isActive ? 'bg-zinc-800/80 font-medium text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100')}>
          {({isActive}) => <>
            {isActive && <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-amber-400" />}
            <a.icone className={cn('h-4 w-4 shrink-0', isActive ? 'text-amber-400' : 'text-zinc-500 group-hover:text-zinc-300')}/>
            <span className="flex-1 truncate">{a.rotulo}</span>
            {pendencias[a.rota] > 0 && <span className="min-w-5 rounded-full bg-amber-500/15 px-1.5 text-center text-[11px] font-semibold tabular-nums text-amber-300">{a.rota === '/master/integracoes' ? '!' : pendencias[a.rota]}</span>}
          </>}
        </NavLink>)}</div>
      </div>)}
    </nav>
    <div className="shrink-0 border-t border-zinc-800 p-3">
      {!instalacao.ocultar && <button onClick={() => { void instalacao.instalar() }} className="mb-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-sm font-medium text-amber-300 hover:bg-amber-500/20"><Download className="h-4 w-4"/>Instalar app no celular</button>}
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-amber-300">{inicial}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-zinc-200">{user?.email}</p><p className="text-[11px] text-zinc-500">Administrador</p></div>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1">
        <a className="flex h-9 items-center justify-center gap-1.5 rounded-lg text-xs text-zinc-400 hover:bg-zinc-900 hover:text-white" href={masterSeparado() ? URL_SITE : '/'} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5"/>Site</a>
        <button onClick={async () => { await sair(); navigate('/master/entrar', { replace: true }) }} className="flex h-9 items-center justify-center gap-1.5 rounded-lg text-xs text-zinc-400 hover:bg-zinc-900 hover:text-white"><LogOut className="h-3.5 w-3.5"/>Sair</button>
      </div>
    </div>
  </>
  return (
    <div className="dark console flex h-dvh min-w-0 flex-col bg-zinc-950 text-zinc-100 xl:pl-72">
      <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-3 py-2 sm:px-5">
        <MenuLateral titulo="LicitaFlow Console" console>{menu}</MenuLateral>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 xl:hidden"><ShieldCheck className="h-5 w-5 text-amber-400"/></div>
        <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">Administração da plataforma</div><p className="truncate text-xs text-zinc-500">{user?.email}</p></div>
        {!instalacao.ocultar && <button onClick={() => { void instalacao.instalar() }} aria-label="Instalar aplicativo" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 text-sm font-medium text-amber-300 hover:bg-amber-500/20"><Download className="h-4 w-4"/><span className="hidden sm:inline">Instalar app</span></button>}
      </header>
      <main id="conteudo-principal" className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="painel-conteudo mx-auto w-full min-w-0 max-w-7xl p-4 lg:p-8"><Outlet /></div>
      </main>
    </div>
  )
}
