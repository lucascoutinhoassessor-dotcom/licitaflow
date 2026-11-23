import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from '@/providers/AuthProvider'
import { OrgProvider, useOrg } from '@/providers/OrgProvider'
import { supabaseNaoConfigurado } from '@/lib/supabase'
import { emAppInstalado, enderecoCorreto } from '@/lib/pwa'
import { useEhAdmin } from '@/hooks/useAdmin'
import { Carregando } from '@/components/ui'
import { AppLayout } from '@/components/layout/AppLayout'
import { GuardaModulo } from '@/components/GuardaModulo'
import { ConfiguracaoPendente } from '@/pages/ConfiguracaoPendente'
import { ContaSuspensa } from '@/pages/ContaSuspensa'
import { AcessoNegadoMaster } from '@/pages/master/AcessoNegado'

const Landing = lazy(() => import('@/pages/landing/Landing'))
const Entrar = lazy(() => import('@/pages/auth/Entrar'))
const Cadastro = lazy(() => import('@/pages/auth/Cadastro'))
const RecuperarSenha = lazy(() => import('@/pages/auth/RecuperarSenha'))
const RedefinirSenha = lazy(() => import('@/pages/auth/RedefinirSenha'))
const ConfirmarEmail = lazy(() => import('@/pages/auth/ConfirmarEmail'))
const Convite = lazy(() => import('@/pages/Convite'))
const Onboarding = lazy(() => import('@/pages/Onboarding'))
const Painel = lazy(() => import('@/pages/app/Painel'))
const Empresas = lazy(() => import('@/pages/app/Empresas'))
const Equipe = lazy(() => import('@/pages/app/Equipe'))
const Configuracoes = lazy(() => import('@/pages/app/Configuracoes'))
const Oportunidades = lazy(() => import('@/pages/app/Oportunidades'))
const OportunidadeDetalhe = lazy(() => import('@/pages/app/OportunidadeDetalhe'))
const AnaliseMercado = lazy(() => import('@/pages/app/AnaliseMercado'))
const AnaliseEmpresas = lazy(() => import('@/pages/app/AnaliseEmpresas'))
const AnaliseEmpresaDetalhe = lazy(() => import('@/pages/app/AnaliseEmpresaDetalhe'))
const HistoricoPrecos = lazy(() => import('@/pages/app/HistoricoPrecos'))
const CompraDetalhe = lazy(() => import('@/pages/app/CompraDetalhe'))
const EmBreve = lazy(() => import('@/pages/app/EmBreve'))
const Processos = lazy(() => import('@/pages/app/processos/Processos'))
const ProcessoDetalhe = lazy(() => import('@/pages/app/processos/ProcessoDetalhe'))
const Prazos = lazy(() => import('@/pages/app/Prazos'))
const Documentos = lazy(() => import('@/pages/app/Documentos'))
const Contratos = lazy(() => import('@/pages/app/contratos/Contratos'))
const ContratoDetalhe = lazy(() => import('@/pages/app/contratos/ContratoDetalhe'))
const Financeiro = lazy(() => import('@/pages/app/Financeiro'))
const Juridico = lazy(() => import('@/pages/app/Juridico'))
const Agentes = lazy(() => import('@/pages/app/Agentes'))
const LeitorEdital = lazy(() => import('@/pages/app/LeitorEdital'))
const Sentinela = lazy(() => import('@/pages/app/Sentinela'))
const MasterEntrar = lazy(() => import('@/pages/master/MasterEntrar'))
const MasterLayout = lazy(() => import('@/pages/master/MasterLayout'))
const MasterVisaoGeral = lazy(() => import('@/pages/master/VisaoGeral'))
const MasterOrganizacoes = lazy(() => import('@/pages/master/Organizacoes'))
const MasterUsuarios = lazy(() => import('@/pages/master/Usuarios'))
const MasterConteudo = lazy(() => import('@/pages/master/Conteudo'))
const MasterCliente = lazy(() => import('@/pages/master/ClienteDetalhe'))
const MasterAuditoria = lazy(() => import('@/pages/master/Auditoria'))
const Suporte = lazy(() => import('@/pages/relacionamento/Suporte'))
const Avisos = lazy(() => import('@/pages/relacionamento/Avisos'))
const RelatoriosMaster = lazy(() => import('@/pages/master/Relatorios'))
const RelatoriosCliente = lazy(() => import('@/pages/app/Relatorios'))
const Planos = lazy(() => import('@/pages/master/Planos'))
const MeuPlano = lazy(() => import('@/pages/app/MeuPlano'))
const Cobrancas = lazy(() => import('@/pages/app/Cobrancas'))
const Integracoes = lazy(() => import('@/pages/master/Integracoes'))
const ConfiguracoesMaster = lazy(() => import('@/pages/master/Configuracoes'))
const MasterAtividade = lazy(() => import('@/pages/master/Atividade'))
const MasterFinanceiro = lazy(() => import('@/pages/master/Financeiro'))
const MasterAssinaturas = lazy(() => import('@/pages/master/Assinaturas'))
const MasterRanking = lazy(() => import('@/pages/master/Ranking'))
const MasterModulos = lazy(() => import('@/pages/master/Modulos'))
const MasterConsumoIA = lazy(() => import('@/pages/master/ConsumoIA'))
const MasterCupons = lazy(() => import('@/pages/master/Cupons'))
const MasterLogs = lazy(() => import('@/pages/master/Logs'))
const MasterSomAviso = lazy(() => import('@/pages/master/SomAviso'))
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
        <GuardaModulo><Outlet /></GuardaModulo>
      </Suspense>
    </AppLayout>
  )
}

/** Guarda do console master: independente do app do cliente (não exige organização). */
function ExigeMaster() {
  const { user, carregando: carregandoAuth } = useAuth()
  const { ehAdmin, carregando, erro, tentarDeNovo } = useEhAdmin()
  if (carregandoAuth || (user && carregando)) return <Carregando telaCheia />
  if (!user) return <Navigate to="/master/entrar" replace />
  if (erro) return <AcessoNegadoMaster falhaVerificacao aoTentar={tentarDeNovo} />
  if (!ehAdmin) return <AcessoNegadoMaster />
  return (
    <Suspense fallback={<Carregando telaCheia />}>
      <MasterLayout />
    </Suspense>
  )
}

/** Master e app do usuário moram em endereços diferentes em produção: navegação interna que cruza a fronteira recarrega no endereço certo. */
function TrocaDeEndereco() {
  const { pathname, search, hash } = useLocation()
  useEffect(() => {
    const destino = enderecoCorreto(window.location.hostname, pathname, search + hash, emAppInstalado())
    if (destino) window.location.replace(destino)
  }, [pathname, search, hash])
  return null
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
      <TrocaDeEndereco />
      <Suspense fallback={<Carregando telaCheia />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/entrar" element={<SoVisitante><Entrar /></SoVisitante>} />
          <Route path="/cadastro" element={<SoVisitante><Cadastro /></SoVisitante>} />
          <Route path="/recuperar-senha" element={<SoVisitante><RecuperarSenha /></SoVisitante>} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />
          <Route path="/confirmar-email" element={<ConfirmarEmail />} />
          <Route path="/convite/:token" element={<Convite />} />
          <Route path="/cobrancas" element={<ExigeLogin><div className="painel-conteudo mx-auto max-w-5xl p-4 sm:p-8"><Cobrancas /></div></ExigeLogin>} />
          <Route path="/suporte" element={<ExigeLogin><div className="painel-conteudo mx-auto max-w-5xl p-4 sm:p-8"><Suporte /></div></ExigeLogin>} />
          <Route path="/onboarding" element={<ExigeLogin><Onboarding /></ExigeLogin>} />

          <Route path="/app" element={<ExigeLogin><ExigeOrganizacao /></ExigeLogin>}>
            <Route index element={<Painel />} />
            <Route path="empresas" element={<Empresas />} />
            <Route path="equipe" element={<Equipe />} />
            <Route path="configuracoes" element={<Configuracoes />} />
            <Route path="oportunidades" element={<Oportunidades />} />
            <Route path="oportunidades/:cnpj/:ano/:seq" element={<OportunidadeDetalhe />} />
            <Route path="analise-mercado" element={<AnaliseMercado />} />
            <Route path="analise-empresas" element={<AnaliseEmpresas />} />
            <Route path="analise-empresas/:cnpj" element={<AnaliseEmpresaDetalhe />} />
            <Route path="historico-precos" element={<HistoricoPrecos />} />
            <Route path="compras/:idCompra" element={<CompraDetalhe />} />
            <Route path="processos" element={<Processos />} />
            <Route path="processos/:id" element={<ProcessoDetalhe />} />
            <Route path="prazos" element={<Prazos />} />
            <Route path="documentos" element={<Documentos />} />
            <Route path="contratos" element={<Contratos />} />
            <Route path="contratos/:id" element={<ContratoDetalhe />} />
            <Route path="financeiro" element={<Financeiro />} />
            <Route path="juridico" element={<Navigate to="/app/juridico/impugnacao" replace />} />
            <Route path="juridico/:tipo" element={<Juridico />} />
            <Route path="agentes" element={<Agentes />} />
            <Route path="agentes/leitor/:cnpj/:ano/:seq" element={<LeitorEdital />} />
            <Route path="agentes/sentinela" element={<Sentinela />} />
            <Route path="avisos" element={<Avisos />} />
            <Route path="relatorios" element={<RelatoriosCliente />} />
            <Route path="plano" element={<MeuPlano />} />
            <Route path=":modulo" element={<EmBreve />} />
          </Route>

          <Route path="/master/entrar" element={<MasterEntrar />} />
          <Route path="/master" element={<ExigeMaster />}>
            <Route index element={<MasterVisaoGeral />} />
            <Route path="organizacoes" element={<MasterOrganizacoes />} />
            <Route path="usuarios" element={<MasterUsuarios />} />
            <Route path="organizacoes/:id" element={<MasterCliente />} />
            <Route path="conteudo" element={<MasterConteudo />} />
            <Route path="auditoria" element={<MasterAuditoria />} />
            <Route path="suporte" element={<Suporte master />} />
            <Route path="avisos" element={<Avisos master />} />
            <Route path="relatorios" element={<RelatoriosMaster />} />
            <Route path="planos" element={<Planos />} />
            <Route path="financeiro" element={<MasterFinanceiro />} />
            <Route path="assinaturas" element={<MasterAssinaturas />} />
            <Route path="cobrancas" element={<Cobrancas master />} />
            <Route path="ranking" element={<MasterRanking />} />
            <Route path="funcionalidades" element={<MasterModulos />} />
            <Route path="consumo-ia" element={<MasterConsumoIA />} />
            <Route path="integracoes" element={<Integracoes />} />
            <Route path="configuracoes" element={<ConfiguracoesMaster />} />
            <Route path="atividade" element={<MasterAtividade />} />
            <Route path="cupons" element={<MasterCupons />} />
            <Route path="logs" element={<MasterLogs />} />
            <Route path="som-aviso" element={<MasterSomAviso />} />
          </Route>

          <Route path="*" element={<NaoEncontrada />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
