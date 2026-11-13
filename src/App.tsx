import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from '@/providers/AuthProvider'
import { OrgProvider, useOrg } from '@/providers/OrgProvider'
import { supabaseNaoConfigurado } from '@/lib/supabase'
import { useEhAdmin } from '@/hooks/useAdmin'
import { Carregando } from '@/components/ui'
import { AppLayout } from '@/components/layout/AppLayout'
import { ConfiguracaoPendente } from '@/pages/ConfiguracaoPendente'
import { ContaSuspensa } from '@/pages/ContaSuspensa'

const Landing = lazy(() => import('@/pages/landing/Landing'))
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
const MasterLayout = lazy(() => import('@/pages/master/MasterLayout'))
const MasterVisaoGeral = lazy(() => import('@/pages/master/VisaoGeral'))
const MasterOrganizacoes = lazy(() => import('@/pages/master/Organizacoes'))
const MasterUsuarios = lazy(() => import('@/pages/master/Usuarios'))
const MasterAtividade = lazy(() => import('@/pages/master/Atividade'))
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
  if (org?.suspensa) return <ContaSuspensa />
  if (!org || empresas.length === 0) return <Navigate to="/onboarding" replace />
  return (
    <AppLayout>
      <Suspense fallback={<Carregando />}>
        <Outlet />
      </Suspense>
    </AppLayout>
  )
}

function ExigeAdmin() {
  const { ehAdmin, carregando } = useEhAdmin()
  if (carregando) return <Carregando telaCheia />
  if (!ehAdmin) return <NaoEncontrada />
  return (
    <Suspense fallback={<Carregando telaCheia />}>
      <MasterLayout />
    </Suspense>
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
          <Route path="/" element={<Landing />} />
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

          <Route path="/master" element={<ExigeLogin><ExigeAdmin /></ExigeLogin>}>
            <Route index element={<MasterVisaoGeral />} />
            <Route path="organizacoes" element={<MasterOrganizacoes />} />
            <Route path="usuarios" element={<MasterUsuarios />} />
            <Route path="atividade" element={<MasterAtividade />} />
          </Route>

          <Route path="*" element={<NaoEncontrada />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
