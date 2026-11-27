import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import * as Menu from '@radix-ui/react-dropdown-menu'
import * as Dialog from '@radix-ui/react-dialog'
import { Bell, Building, Check, ChevronDown, ChevronsUpDown, CircleHelp, Download, LayoutDashboard, LogOut, Menu as IconeMais, Moon, Sun, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IA, rotaAtiva, type GrupoNav, type ItemNav } from '@/lib/navegacao'
import { useNavegacao } from '@/hooks/useModulos'
import { Logo } from '@/components/ui'
import { useAuth } from '@/providers/AuthProvider'
import { useOrg } from '@/providers/OrgProvider'
import { useInstalacao } from '@/hooks/useInstalacao'
import { supabase } from '@/lib/supabase'
import PedirNotificacoes from '@/components/PedirNotificacoes'
import AvisoAppAntigo from '@/components/AvisoAppAntigo'

function alternarTema() {
  const escuro = document.documentElement.classList.toggle('dark')
  try {
    localStorage.setItem('lf-tema', escuro ? 'dark' : 'light')
  } catch {
    /* armazenamento indisponível */
  }
}

const cartaoMenu = 'z-50 min-w-[15rem] rounded-xl border border-white/10 bg-sidebar p-1.5 text-sidebar-foreground shadow-2xl'
const itemMenu = 'flex min-h-11 cursor-pointer select-none items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground/90 outline-none data-[highlighted]:bg-white/10 data-[highlighted]:text-white'

function EmBreve() {
  return <span className="ml-auto rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-sidebar-muted">em breve</span>
}

function ItemDoMenu({ item }: { item: ItemNav }) {
  const Icone = item.icone
  return (
    <Menu.Item asChild>
      <Link to={item.rota} className={cn(itemMenu, 'lf-menu-item')}>
        <span className="lf-menu-icone lf-menu-icone-p"><Icone className="h-4 w-4" /></span>
        <span className="truncate">{item.rotulo}</span>
        {item.fase && <EmBreve />}
      </Link>
    </Menu.Item>
  )
}

/** Menu suspenso de um grupo na barra superior (computador). */
function GrupoSuspenso({ grupo }: { grupo: GrupoNav }) {
  const { pathname } = useLocation()
  const ativo = grupo.itens.some((i) => rotaAtiva(i.rota, pathname))
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        className={cn(
          'group inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40 data-[state=open]:bg-white/10',
          ativo ? 'text-white' : 'text-sidebar-foreground/85',
        )}
      >
        {grupo.rotulo}
        <ChevronDown className="h-4 w-4 opacity-70 transition-transform group-data-[state=open]:rotate-180" />
        {ativo && <span className="sr-only">(seção atual)</span>}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="center" sideOffset={10} className={cartaoMenu}>
          {grupo.itens.map((i) => <ItemDoMenu key={i.rota} item={i} />)}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

function iniciais(email?: string | null) {
  return (email ?? '?').trim().charAt(0).toUpperCase()
}

/** Menu do usuário: conta, organização, tema e sair. */
function MenuUsuario() {
  const nav = useNavegacao()
  const { user, sair } = useAuth()
  const { org, organizacoes, trocarOrg } = useOrg()
  const instalacao = useInstalacao()
  const navigate = useNavigate()
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger className="inline-flex h-10 items-center gap-2 rounded-lg px-1.5 text-sm font-medium text-sidebar-foreground outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40 data-[state=open]:bg-white/10 sm:px-2" aria-label="Menu da conta">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">{iniciais(user?.email)}</span>
        <span className="hidden max-w-[10rem] truncate lg:inline">{org?.nome ?? 'Minha conta'}</span>
        <ChevronDown className="hidden h-4 w-4 opacity-70 lg:block" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={10} className={cn(cartaoMenu, 'max-h-[calc(100dvh-5rem)] w-72 overflow-y-auto')}>
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-white">{org?.nome}</p>
            <p className="truncate text-xs text-sidebar-muted">{user?.email}</p>
          </div>
          {organizacoes.length > 1 && <>
            <Menu.Separator className="my-1 h-px bg-white/10" />
            <Menu.Label className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-wide text-sidebar-muted">Trocar organização</Menu.Label>
            {organizacoes.map((o) => (
              <Menu.Item key={o.id} className={itemMenu} onSelect={() => trocarOrg(o.id)}>
                <Check className={cn('h-4 w-4 shrink-0', o.id === org?.id ? 'text-accent' : 'invisible')} />
                <span className="truncate">{o.nome}</span>
              </Menu.Item>
            ))}
          </>}
          <Menu.Separator className="my-1 h-px bg-white/10" />
          {nav.conta.map((i) => <ItemDoMenu key={i.rota} item={i} />)}
          <Menu.Separator className="my-1 h-px bg-white/10" />
          {!instalacao.ocultar && <Menu.Item className={itemMenu} onSelect={() => { void instalacao.instalar() }}>
            <Download className="h-4 w-4 text-sidebar-muted" />
            Instalar aplicativo
          </Menu.Item>}
          <Menu.Item className={itemMenu} onSelect={(e) => { e.preventDefault(); alternarTema() }}>
            <Sun className="hidden h-4 w-4 text-sidebar-muted dark:block" />
            <Moon className="h-4 w-4 text-sidebar-muted dark:hidden" />
            <span className="dark:hidden">Tema escuro</span>
            <span className="hidden dark:inline">Tema claro</span>
          </Menu.Item>
          <Menu.Item className={itemMenu} onSelect={async () => { await sair(); navigate('/entrar') }}>
            <LogOut className="h-4 w-4 text-sidebar-muted" />
            Sair
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

const botaoIcone = 'inline-flex h-10 w-10 items-center justify-center rounded-lg text-sidebar-foreground/85 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40'

/** Quantos dos avisos listados em /app/avisos o usuário ainda não marcou como lidos.
 *  A chave começa com 'aviso-leituras': o "Marcar como lido" da página já atualiza o sininho. */
function useAvisosNaoLidos() {
  const { user } = useAuth()
  const q = useQuery({
    queryKey: ['aviso-leituras', 'nao-lidos', user?.id],
    enabled: !!user,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data: avisos, error } = await supabase.from('plataforma_avisos').select('id').order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      const ids = (avisos ?? []).map((a) => a.id as string)
      if (!ids.length) return 0
      const { data: lidos, error: e2 } = await supabase.from('aviso_leituras').select('aviso_id').eq('user_id', user!.id).in('aviso_id', ids)
      if (e2) throw e2
      const jaLidos = new Set((lidos ?? []).map((r) => r.aviso_id as string))
      return ids.filter((id) => !jaLidos.has(id)).length
    },
  })
  return q.data ?? 0
}

/** Sininho da barra superior com o número de avisos não lidos. */
function SininhoAvisos() {
  const n = useAvisosNaoLidos()
  return (
    <Link to="/app/avisos" className={cn(botaoIcone, 'relative')} aria-label={n ? `Avisos: ${n} não ${n === 1 ? 'lido' : 'lidos'}` : 'Avisos'}>
      <Bell className="h-5 w-5" />
      {n > 0 && <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-black" aria-hidden>{n > 9 ? '9+' : n}</span>}
    </Link>
  )
}

/** Gaveta de baixo para cima com os itens de um grupo (celular). */
function Gaveta({ titulo, aberto, aoMudar, itens, extra }: { titulo: string; aberto: boolean; aoMudar: (v: boolean) => void; itens: ItemNav[]; extra?: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <Dialog.Root open={aberto} onOpenChange={aoMudar}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden" />
        <Dialog.Content aria-describedby={undefined} className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-sidebar px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2 text-sidebar-foreground shadow-2xl focus:outline-none lg:hidden">
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-white/20" aria-hidden />
          <div className="mb-1 flex items-center justify-between px-2">
            <Dialog.Title className="text-base font-semibold text-white">{titulo}</Dialog.Title>
            <Dialog.Close className={botaoIcone} aria-label="Fechar"><X className="h-5 w-5" /></Dialog.Close>
          </div>
          <nav aria-label={titulo} className="lf-gaveta space-y-1">
            {itens.map((i) => {
              const Icone = i.icone
              const ativo = rotaAtiva(i.rota, pathname)
              return (
                <Link key={i.rota} to={i.rota} onClick={() => aoMudar(false)} aria-current={ativo ? 'page' : undefined}
                  className={cn('lf-menu-item flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px]', ativo ? 'bg-white/10 font-medium text-white' : 'text-sidebar-foreground/90 active:bg-white/10')}>
                  <span className={cn('lf-menu-icone', ativo && 'lf-menu-icone-ativo')}><Icone className="h-[18px] w-[18px]" /></span>
                  <span className="truncate">{i.rotulo}</span>
                  {i.fase && <EmBreve />}
                </Link>
              )
            })}
          </nav>
          {extra}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Barra inferior fixa no celular: Painel, Oportunidades, Negócios, Análise e Mais. */
function BarraInferior() {
  const { pathname, search } = useLocation()
  const { sair } = useAuth()
  const instalacao = useInstalacao()
  const navigate = useNavigate()
  const [aberta, setAberta] = useState<string | null>(null)
  useEffect(() => setAberta(null), [pathname, search])
  const nav = useNavegacao()
  const mais: ItemNav[] = [...(nav.ia ? [nav.ia] : []), ...nav.conta]
  const botao = (ativo: boolean) => cn('flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium tracking-tight outline-none focus-visible:bg-white/10', ativo ? 'text-white' : 'text-sidebar-muted')
  const marca = (ativo: boolean) => cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', ativo && 'bg-white/15')
  return (
    <>
      <nav aria-label="Menu principal" data-barra-inferior className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom))] border-t border-white/10 bg-sidebar pb-[env(safe-area-inset-bottom)] lg:hidden">
        <NavLink to="/app" end className={({ isActive }) => botao(isActive)}>
          {({ isActive }) => <><span className={marca(isActive)}><LayoutDashboard className="h-5 w-5" /></span>Painel</>}
        </NavLink>
        {nav.grupos.map((g) => {
          const ativo = g.itens.some((i) => rotaAtiva(i.rota, pathname))
          const Icone = g.icone
          const conteudo = <><span className={marca(ativo)}><Icone className="h-5 w-5" /></span><span className="max-w-full truncate">{g.curto ?? g.rotulo}</span></>
          return g.itens.length === 1
            ? <Link key={g.id} to={g.itens[0].rota} className={botao(ativo)} aria-current={ativo ? 'page' : undefined}>{conteudo}</Link>
            : <button key={g.id} type="button" className={botao(ativo)} onClick={() => setAberta(g.id)} aria-haspopup="dialog">{conteudo}</button>
        })}
        <button type="button" className={botao(mais.some((i) => rotaAtiva(i.rota, pathname)))} onClick={() => setAberta('mais')} aria-haspopup="dialog">
          <span className={marca(mais.some((i) => rotaAtiva(i.rota, pathname)))}><IconeMais className="h-5 w-5" /></span>Mais
        </button>
      </nav>
      {nav.grupos.filter((g) => g.itens.length > 1).map((g) => (
        <Gaveta key={g.id} titulo={g.rotulo} itens={g.itens} aberto={aberta === g.id} aoMudar={(v) => setAberta(v ? g.id : null)} />
      ))}
      <Gaveta titulo="Mais" itens={mais} aberto={aberta === 'mais'} aoMudar={(v) => setAberta(v ? 'mais' : null)}
        extra={<div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
          {!instalacao.ocultar && <button type="button" onClick={() => { setAberta(null); void instalacao.instalar() }} className="col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-accent-foreground active:opacity-90">
            <Download className="h-4 w-4" />Instalar aplicativo no celular
          </button>}
          <button type="button" onClick={alternarTema} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white/5 text-sm text-sidebar-foreground/90 active:bg-white/10">
            <Sun className="hidden h-4 w-4 dark:block" /><Moon className="h-4 w-4 dark:hidden" />
            <span className="dark:hidden">Tema escuro</span><span className="hidden dark:inline">Tema claro</span>
          </button>
          <button type="button" onClick={async () => { await sair(); navigate('/entrar') }} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white/5 text-sm text-sidebar-foreground/90 active:bg-white/10">
            <LogOut className="h-4 w-4" />Sair
          </button>
        </div>} />
    </>
  )
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { org, empresas, empresa, trocarEmpresa } = useOrg()
  const { pathname } = useLocation()
  const iaAtiva = rotaAtiva(IA.rota, pathname)
  const nav = useNavegacao()
  const instalacao = useInstalacao()

  return (
    <div className="flex h-dvh min-w-0 flex-col">
      {/* Barra superior escura, fixa, no padrão de menus agrupados. */}
      <header className="relative z-40 flex h-16 shrink-0 items-center gap-2 border-b border-white/10 bg-black px-3 pt-[env(safe-area-inset-top)] text-sidebar-foreground sm:px-5">
        <Link to="/app" className="shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white/40" aria-label="LicitaForce – ir para o painel">
          <Logo claro />
        </Link>
        <nav aria-label="Módulos do usuário" className="hidden flex-1 items-center justify-center gap-1 lg:flex">
          {nav.ia && <Link to={IA.rota} className={cn('lf-ia mr-2 inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-white/40', iaAtiva && 'lf-ia-ativa')}>
            <span className="lf-ia-icone grid h-3.5 w-3.5 grid-cols-2 gap-[2px]" aria-hidden>
              <span className="rounded-[1px] bg-sky-400" /><span className="rounded-[1px] bg-emerald-400" /><span className="rounded-[1px] bg-amber-400" /><span className="rounded-[1px] bg-rose-400" />
            </span>
            <span className="lf-ia-texto">IA</span>
          </Link>}
          {nav.grupos.map((g) => <GrupoSuspenso key={g.id} grupo={g} />)}
        </nav>
        <div className="ml-auto flex items-center gap-1 lg:ml-0">
          {!instalacao.ocultar && <button type="button" onClick={() => { void instalacao.instalar() }} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/15 px-3 text-sm font-medium text-white outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40" aria-label="Instalar aplicativo">
            <Download className="h-4 w-4" /><span className="hidden sm:inline">Instalar app</span>
          </button>}
          <SininhoAvisos />
          <Link to="/suporte" className={cn(botaoIcone, 'hidden sm:inline-flex')} aria-label="Ajuda e suporte"><CircleHelp className="h-5 w-5" /></Link>
          <MenuUsuario />
        </div>
      </header>

      <main id="conteudo-principal" className="min-h-0 min-w-0 flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
        <AvisoAppAntigo />
        {(org?.plano === 'trial' || empresas.length > 1) && (
          <div className="border-b bg-card">
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-4 py-2 lg:px-8">
              <div className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {org?.plano === 'trial' && <>Teste grátis até {new Date(`${org.trial_ate}T00:00:00`).toLocaleDateString('pt-BR')}</>}
              </div>
              {empresas.length > 1 && (
                <div className="relative w-full min-w-0 sm:w-auto sm:max-w-[50%]">
                  <Building className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <select
                    value={empresa?.id ?? ''}
                    onChange={(e) => trocarEmpresa(e.target.value || null)}
                    className="h-9 w-full min-w-0 max-w-full appearance-none rounded-md border border-input bg-card pl-8 pr-8 text-sm"
                    aria-label="Empresa"
                  >
                    <option value="">Todas as empresas</option>
                    {empresas.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nome_fantasia || e.razao_social}
                      </option>
                    ))}
                  </select>
                  <ChevronsUpDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
          </div>
        )}
        <div className="painel-conteudo mx-auto w-full min-w-0 max-w-6xl p-4 lg:p-8">{children}</div>
        <PedirNotificacoes />
      </main>

      <BarraInferior />
    </div>
  )
}
