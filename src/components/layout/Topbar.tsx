import React from 'react';
import { Search, Bell, Menu, RefreshCw } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { mockAlerts } from '../../data/mockData';
import { DemoBanner } from '../DemoBanner';

interface TopbarProps {
  onMenuToggle: () => void;
  onSearch?: (query: string) => void;
}

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/editais': 'Captação de Editais',
  '/funil': 'Funil de Prospecção',
  '/ordens-servico': 'Ordens de Serviço',
  '/clientes': 'Clientes (Gov + Privado)',
  '/fornecedores': 'Fornecedores',
  '/certidoes': 'Certidões e Documentos',
  '/orcamentos': 'Orçamentos',
  '/contratos': 'Contratos',
  '/financeiro': 'Fluxo de Caixa',
  '/configuracoes': 'Configurações',
  '/alertas': 'Central de Alertas',
};

const pageSubtitles: Record<string, string> = {
  '/': 'Visão geral da sua operação',
  '/editais': 'Busca em tempo real via PNCP - Portal Nacional de Contratações Públicas',
  '/funil': 'Gerencie suas oportunidades de negócio',
  '/contratos': 'Acompanhe contratos ativos e encerrados',
};

export function Topbar({ onMenuToggle }: TopbarProps) {
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'LicitaFlow';
  const subtitle = pageSubtitles[location.pathname] || '';
  const unreadAlerts = mockAlerts.filter(a => !a.read).length;

  return (
    <>
      <DemoBanner />
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuToggle}
            className="lg:hidden text-slate-600 hover:text-slate-900 p-1"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div>
            <h1 className="text-base font-semibold text-slate-900">{title}</h1>
            {subtitle && (
              <p className="text-xs text-slate-500 hidden sm:block">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {/* Busca rápida */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg border border-slate-200 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/20 transition-all w-64">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar editais..."
              className="bg-transparent border-none outline-none text-sm text-slate-700 placeholder:text-slate-400 w-full"
            />
          </div>

          {/* Botão de refresh */}
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Atualizar dados"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Atualizar</span>
          </button>

          {/* Notificações */}
          <button
            className="relative p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Alertas"
          >
            <Bell className="w-5 h-5" />
            {unreadAlerts > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">
                {unreadAlerts}
              </span>
            )}
          </button>

          {/* Data atual */}
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500">
            <span>{new Date().toLocaleDateString('pt-BR', { day: '2-digit' })}</span>
            <span>{new Date().toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span>
            <span>{new Date().getFullYear()}</span>
          </div>
        </div>
      </header>
    </>
  );
}