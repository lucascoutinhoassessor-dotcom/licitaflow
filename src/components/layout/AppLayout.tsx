import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Building, ChevronsUpDown, LogOut, Menu, Moon, Sun, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NAV_CONTA, NAV_PRINCIPAL, type ItemNav } from '@/lib/navegacao'
import { useAuth } from '@/providers/AuthProvider'
import { useOrg } from '@/providers/OrgProvider'
import { Logo } from '@/components/ui'

function ItemMenu({ item, aoClicar }: { item: ItemNav; aoClicar: () => void }) {
  const Icone = item.icone
  return (
    <NavLink
      to={item.rota}
      end={item.rota === '/app'}
      onClick={aoClicar}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
          isActive ? 'bg-sidebar-accent text-sidebar-foreground font-medium' : 'text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
        )
      }
    >
      <Icone className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{item.rotulo}</span>
      {item.fase && <span className="rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-medium text-sidebar-muted">em breve</span>}
    </NavLink>
  )
}

function alternarTema() {
  const escuro = document.documentElement.classList.toggle('dark')
  try {
    localStorage.setItem('lf-tema', escuro ? 'dark' : 'light')
  } catch {
    /* armazenamento indisponível */
  }
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false)
  const { user, sair } = useAuth()
  const { org, organizacoes, trocarOrg, empresas, empresa, trocarEmpresa } = useOrg()
  const navigate = useNavigate()
  const fechar = () => setAberto(false)

  return (
    <div className="flex h-full">
      {aberto && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={fechar} />}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0',
          aberto ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          <Logo claro />
          <button className="lg:hidden" onClick={fechar} aria-label="Fechar menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        {organizacoes.length > 1 && (
          <div className="border-b border-sidebar-border p-3">
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-sidebar-muted">Organização</label>
            <div className="relative">
              <select
                value={org?.id}
                onChange={(e) => trocarOrg(e.target.value)}
                className="w-full appearance-none rounded-md bg-sidebar-accent px-3 py-2 pr-8 text-sm text-sidebar-foreground"
              >
                {organizacoes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
              </select>
              <ChevronsUpDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-sidebar-muted" />
            </div>
          </div>
        )}

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_PRINCIPAL.map((i) => (
            <ItemMenu key={i.rota} item={i} aoClicar={fechar} />
          ))}
          <div className="px-3 pb-1 pt-5 text-[11px] uppercase tracking-wide text-sidebar-muted">Conta</div>
          {NAV_CONTA.map((i) => (
            <ItemMenu key={i.rota} item={i} aoClicar={fechar} />
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="truncate px-3 text-xs text-sidebar-muted">{user?.email}</div>
          <div className="mt-2 flex gap-1">
            <button onClick={alternarTema} className="flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-muted hover:bg-sidebar-accent" aria-label="Alternar tema">
              <Sun className="hidden h-4 w-4 dark:block" />
              <Moon className="h-4 w-4 dark:hidden" />
              Tema
            </button>
            <button
              onClick={async () => {
                await sair()
                navigate('/entrar')
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-muted hover:bg-sidebar-accent"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-3 border-b bg-card px-4">
          <button className="lg:hidden" onClick={() => setAberto(true)} aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{org?.nome}</span>
            {org?.plano === 'trial' && <span className="ml-2 hidden sm:inline">· teste grátis até {new Date(`${org.trial_ate}T00:00:00`).toLocaleDateString('pt-BR')}</span>}
          </div>
          {empresas.length > 1 && (
            <div className="relative">
              <Building className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <select
                value={empresa?.id ?? ''}
                onChange={(e) => trocarEmpresa(e.target.value || null)}
                className="h-9 max-w-[14rem] appearance-none rounded-md border border-input bg-card pl-8 pr-8 text-sm sm:max-w-xs"
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
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl p-4 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
