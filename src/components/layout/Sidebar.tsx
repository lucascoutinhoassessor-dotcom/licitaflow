import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Search,
  FileText,
  CheckSquare,
  Users,
  UserPlus,
  CreditCard,
  BarChart3,
  Settings,
  Building2,
  Bell,
  LogOut,
  ChevronDown,
  Menu
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCompanies } from '../../context/AuthContext';
import { mockAlerts } from '../../data/mockData';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const menuItems = [
  { section: 'Principal', items: [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    { icon: Search, label: 'Captação de Editais', path: '/editais' },
    { icon: FileText, label: 'Funil de Prospecção', path: '/funil' },
    { icon: CheckSquare, label: 'Ordens de Serviço', path: '/ordens-servico' },
  ]},
  { section: 'Cadastros', items: [
    { icon: Users, label: 'Clientes (Gov + Privado)', path: '/clientes' },
    { icon: Building2, label: 'Fornecedores', path: '/fornecedores' },
    { icon: FileText, label: 'Certidões e Documentos', path: '/certidoes' },
  ]},
  { section: 'Financeiro', items: [
    { icon: CreditCard, label: 'Orçamentos', path: '/orcamentos' },
    { icon: BarChart3, label: 'Contratos', path: '/contratos' },
    { icon: BarChart3, label: 'Fluxo de Caixa', path: '/financeiro' },
  ]},
  { section: 'Marketing', items: [
    { icon: UserPlus, label: 'Leads', path: '/leads' },
  ]},
  { section: 'Sistema', items: [
    { icon: Settings, label: 'Configurações', path: '/configuracoes' },
  ]},
];

export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const location = useLocation();
  const { user, tenant } = useAuth();
  const { companies, selectedCompany, setSelectedCompany } = useCompanies();
  const [companiesOpen, setCompaniesOpen] = React.useState(false);
  const unreadAlerts = mockAlerts.filter(a => !a.read).length;

  return (
    <>
      {/* Overlay para mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-slate-900 flex flex-col transform transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-700/50">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-bold text-base">LicitaFlow</span>
          </Link>
          <button
            onClick={onToggle}
            className="lg:hidden text-slate-400 hover:text-white p-1"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        {/* Empresa Selecionada */}
        <div className="px-3 py-3 border-b border-slate-700/50">
          <button
            onClick={() => setCompaniesOpen(!companiesOpen)}
            className="w-full flex items-center gap-2 p-2 rounded-lg bg-slate-800 hover:bg-slate-700/70 transition-colors"
          >
            <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center text-blue-400 text-xs font-bold">
              {selectedCompany?.name.charAt(0) || 'E'}
            </div>
            <div className="flex-1 text-left min-w-0">
              <div className="text-white text-xs font-medium truncate">{selectedCompany?.name?.split(' - ')[0] || 'Selecione'}</div>
              <div className="text-slate-400 text-xs">{companies.length}/{tenant.maxCompanies} empresas</div>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${companiesOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown de empresas */}
          {companiesOpen && (
            <div className="mt-2 bg-slate-800 rounded-lg border border-slate-700/50 overflow-hidden">
              {companies.map(company => (
                <button
                  key={company.id}
                  onClick={() => {
                    setSelectedCompany(company);
                    setCompaniesOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 p-2 text-left hover:bg-slate-700/50 transition-colors ${
                    selectedCompany?.id === company.id ? 'bg-blue-600/10' : ''
                  }`}
                >
                  <div className="w-6 h-6 bg-slate-600 rounded flex items-center justify-center text-white text-xs font-bold">
                    {company.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-xs truncate">{company?.name?.split(' - ')[0] || 'Empresa'}</div>
                    <div className="text-slate-400 text-xs">{company.cnpj}</div>
                  </div>
                </button>
              ))}
              <Link
                to="/configuracoes?tab=empresas"
                className="flex items-center gap-2 p-2 text-blue-400 hover:bg-slate-700/50 text-xs border-t border-slate-700/50"
              >
                + Adicionar empresa
              </Link>
            </div>
          )}
        </div>

        {/* Menu de navegação */}
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {menuItems.map((section, idx) => (
            <div key={idx} className="mb-4">
              <div className="px-2 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {section.section}
              </div>
              {section.items.map(item => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-colors mb-0.5 ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer com alertas e usuário */}
        <div className="border-t border-slate-700/50">
          <Link
            to="/alertas"
            className="flex items-center gap-2 px-4 py-3 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <div className="relative">
              <Bell className="w-4 h-4" />
              {unreadAlerts > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">
                  {unreadAlerts}
                </span>
              )}
            </div>
            <span className="text-sm">Alertas</span>
          </Link>

          <div className="flex items-center gap-2 px-4 py-3">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
              {user?.name?.split(' ').map(n => n[0]).slice(0, 2).join('') || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-xs font-medium truncate">{user?.name}</div>
              <div className="text-slate-400 text-xs capitalize">{user?.role === 'owner' ? 'Proprietário' : user?.role}</div>
            </div>
            <button
              onClick={() => {}}
              className="text-slate-400 hover:text-white p-1"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}