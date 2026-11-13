import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { Dashboard } from './pages/Dashboard';
import { Editais } from './pages/Editais';
import { Funil } from './pages/Funil';
import { Configuracoes } from './pages/Configuracoes';
import { Contratos } from './pages/Contratos';
import { Financeiro } from './pages/Financeiro';
import { OrdensServico } from './pages/OrdensServico';
import { AuthPage } from './pages/AuthPage';
import { Landing } from './pages/Landing';
import { CheckoutSuccess, CheckoutCancel } from './pages/Checkout';
import { LeadsPage } from './pages/Leads';
import { AdminLeadsPage } from './pages/AdminLeads';
import { DemoAccessPage } from './pages/DemoAccess';

// Layout principal da aplicação
function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

// Página placeholder para módulos ainda não implementados
function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-4 lg:p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h1 className="text-xl font-semibold text-slate-900 mb-2">{title}</h1>
      <p className="text-sm text-slate-500 max-w-md">{description}</p>
      <div className="mt-6 flex items-center gap-2 text-xs text-slate-400">
        <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
        Módulo em desenvolvimento
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Landing page */}
          <Route path="/" element={<Landing />} />
          <Route path="/landing" element={<Landing />} />

          {/* Checkout pages */}
          <Route path="/checkout/success" element={<CheckoutSuccess />} />
          <Route path="/checkout/cancel" element={<CheckoutCancel />} />

          {/* Auth pages */}
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/reset-password" element={<AuthPage mode="reset" />} />

          {/* Demo Access Page */}
          <Route path="/demo-access" element={<DemoAccessPage />} />

          {/* Páginas principais - sem proteção para demo */}
          <Route path="/dashboard" element={<AppLayout><Dashboard /></AppLayout>} />
          <Route path="/editais" element={<AppLayout><Editais /></AppLayout>} />
          <Route path="/funil" element={<AppLayout><Funil /></AppLayout>} />
          <Route path="/ordens-servico" element={<AppLayout><OrdensServico /></AppLayout>} />
          <Route path="/clientes" element={<AppLayout><PlaceholderPage title="Clientes" description="Gerencie seus clientes governamentais e privados" /></AppLayout>} />
          <Route path="/fornecedores" element={<AppLayout><PlaceholderPage title="Fornecedores" description="Cadastro e gestão de fornecedores" /></AppLayout>} />
          <Route path="/certidoes" element={<AppLayout><PlaceholderPage title="Certidões e Documentos" description="Gerencie certidões e documentos da empresa" /></AppLayout>} />
          <Route path="/orcamentos" element={<AppLayout><PlaceholderPage title="Orçamentos" description="Crie e gerencie orçamentos para editais" /></AppLayout>} />
          <Route path="/contratos" element={<AppLayout><Contratos /></AppLayout>} />
          <Route path="/financeiro" element={<AppLayout><Financeiro /></AppLayout>} />
          <Route path="/configuracoes" element={<AppLayout><Configuracoes /></AppLayout>} />
          <Route path="/leads" element={<AppLayout><LeadsPage /></AppLayout>} />
          <Route path="/admin/leads" element={<AppLayout><AdminLeadsPage /></AppLayout>} />
          <Route path="/alertas" element={<AppLayout><PlaceholderPage title="Central de Alertas" description="Visualize todos os alertas do sistema" /></AppLayout>} />

          {/* Redirecionar para dashboard */}
          <Route path="*" element={<Landing />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}