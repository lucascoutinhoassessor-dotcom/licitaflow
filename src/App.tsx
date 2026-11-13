import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from '@/providers/AuthProvider'
import { OrgProvider, useOrg } from '@/providers/OrgProvider'
import { supabaseNaoConfigurado } from '@/lib/supabase'
import { Carregando } from '@/components/ui'
import { AppLayout } from '@/components/layout/AppLayout'
import { ConfiguracaoPendente } from '@/pages/ConfiguracaoPendente'

const Entrar = lazy(() => import('@/pages/auth/Entrar'))
const Cadastro = lazy(() => import('@/pages/auth/Cadastro'))
const RecuperarSenha = lazy(() => import('@/pages/auth/RecuperarSenha'))
const RedefinirSenha = lazy(() => import('@/pages/auth/RedefinirSenha'))
const Convite = lazy(() => import('@/pages/Convite'))
const Onboarding = lazy(() => import('@/pages/Onboarding'))
const Painel = lazy(() => import('@/pages/app/Painel'))
const Empresas = lazy(() => import('@/pages/app/Empresas'))
const Equipe = lazy(() => import('@/pages/app/Equipe'))
const Configuracoes = lazy(() => import('@/pages/app/Configuracoes'))
const EmBreve = lazy(() => import('@/pages/app/EmBreve'))
const NaoEncontrada = lazy(() => import('@/pages/NaoEncontrada'))

function ExigeLogin({ children }: { children: ReactNode }) {
  const { user, carregando, recuperandoSenha } = useAuth()
  const loc = useLocation()
  if (carregando) return <Carregando telaCheia />
  if (recuperandoSenha) return <Navigate to="/redefinir-senha" replace />
  if (!user) return <Navigate to={`/entrar?voltar=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  return <OrgProvider>{children}</OrgProvider>
}

function ExigeOrganizacao() {
  const { carregando, org, empresas } = useOrg()
  if (carregando) return <Carregando telaCheia />
  if (!org || empresas.length === 0) return <Navigate to="/onboarding" replace />
  return (
    <AppLayout>
      <Suspense fallback={<Carregando />}>
        <Outlet />
      </Suspense>
    </AppLayout>
  )
}

function SoVisitante({ children }: { children: ReactNode }) {
  const { user, carregando } = useAuth()
  if (carregando) return <Carregando telaCheia />
  if (user) return <Navigate to="/app" replace />
  return <>{children}</>
}

export default function App() {
  if (supabaseNaoConfigurado) return <ConfiguracaoPendente />

  return (
    <BrowserRouter>
      <Suspense fallback={<Carregando telaCheia />}>
        <Routes>
          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route path="/entrar" element={<SoVisitante><Entrar /></SoVisitante>} />
          <Route path="/cadastro" element={<SoVisitante><Cadastro /></SoVisitante>} />
          <Route path="/recuperar-senha" element={<SoVisitante><RecuperarSenha /></SoVisitante>} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />
          <Route path="/convite/:token" element={<Convite />} />
          <Route path="/onboarding" element={<ExigeLogin><Onboarding /></ExigeLogin>} />

          <Route path="/app" element={<ExigeLogin><ExigeOrganizacao /></ExigeLogin>}>
            <Route index element={<Painel />} />
            <Route path="empresas" element={<Empresas />} />
            <Route path="equipe" element={<Equipe />} />
            <Route path="configuracoes" element={<Configuracoes />} />
            <Route path=":modulo" element={<EmBreve />} />
          </Route>

          <Route path="*" element={<NaoEncontrada />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
