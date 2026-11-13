import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  TrendingUp,
  CheckCircle,
  AlertTriangle,
  DollarSign,
  Users,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Eye,
  Send,
  XCircle,
  Building2,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCompanies } from '../context/AuthContext';
import { mockEditais, mockContracts, dashboardStats } from '../data/mockData';

interface Edital {
  id: string;
  titulo: string;
  numero_edital: string;
  orgao: string;
  UF: string;
  modalidade: string;
  valor_estimado: number;
  data_publicacao: string;
  data_encerramento: string;
  status: string;
}

interface Contract {
  id: string;
  numero_contrato: string;
  objeto: string;
  contratante: string;
  valor_contratado: number;
  status: string;
  data_inicio: string;
  data_fim: string;
}

export function Dashboard() {
  const { selectedCompany } = useCompanies();
  const now = new Date();

  const [editais, setEditais] = useState<Edital[]>([]);
  const [contratos, setContratos] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingMockData, setUsingMockData] = useState(false);

  // Buscar dados do Supabase
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Buscar editais do Supabase
        const { data: editaisData, error: editaisError } = await supabase
          .from('editais')
          .select('*')
          .order('data_encerramento', { ascending: true })
          .limit(100);

        // Buscar contratos do Supabase
        const { data: contratosData, error: contratosError } = await supabase
          .from('contratos')
          .select('*')
          .order('data_inicio', { ascending: false })
          .limit(50);

        // Se tiver dados reais no Supabase, usar eles
        if (editaisData && editaisData.length > 0 && !editaisError) {
          setEditais(editaisData);
        } else {
          // Fallback: usar dados mock formatados
          const mockFormatted = mockEditais.map(e => ({
            id: e.id,
            titulo: e.objeto,
            numero_edital: e.numeroCompra,
            orgao: e.orgao,
            UF: e.uf,
            modalidade: e.modalidade,
            valor_estimado: e.valorEstimado || 0,
            data_publicacao: e.dataPublicacao,
            data_encerramento: e.dataEncerramento,
            status: mapMockStatusToDb(e.status)
          }));
          setEditais(mockFormatted);
          setUsingMockData(true);
        }

        if (contratosData && contratosData.length > 0 && !contratosError) {
          setContratos(contratosData);
        } else {
          // Fallback: usar contratos mock formatados
          const mockContratosFormatted = mockContracts.map(c => ({
            id: c.id,
            numero_contrato: c.numeroContrato,
            objeto: c.objeto,
            contratante: c.orgao,
            valor_contratado: c.valor,
            status: c.status,
            data_inicio: c.dataInicio,
            data_fim: c.dataFim
          }));
          setContratos(mockContratosFormatted);
        }
      } catch (error) {
        console.error('Erro ao buscar dados:', error);
        // Em caso de erro, usar mock data
        const mockFormatted = mockEditais.map(e => ({
          id: e.id,
          titulo: e.objeto,
          numero_edital: e.numeroCompra,
          orgao: e.orgao,
          UF: e.uf,
          modalidade: e.modalidade,
          valor_estimado: e.valorEstimado || 0,
          data_publicacao: e.dataPublicacao,
          data_encerramento: e.dataEncerramento,
          status: mapMockStatusToDb(e.status)
        }));
        setEditais(mockFormatted);
        setUsingMockData(true);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Mapear status do mock para status do banco
  function mapMockStatusToDb(mockStatus: string): string {
    const mapping: Record<string, string> = {
      'novo': 'draft',
      'em_analise': 'under_analysis',
      'interessado': 'published',
      'proposta_enviada': 'sent',
      'contratado': 'won',
      'perdido': 'lost',
      'encerrado': 'expired'
    };
    return mapping[mockStatus] || 'draft';
  }

  // Estatísticas rápidas
  const editaisAbertos = editais.filter(e => {
    const dataEncerramento = new Date(e.data_encerramento);
    return dataEncerramento > now && ['published', 'draft'].includes(e.status);
  }).length;

  const propostasEnviadas = editais.filter(e => e.status === 'sent' || e.status === 'under_analysis').length;
  const contratosAtivos = contratos.filter(c => c.status === 'active' || c.status === 'ongoing').length;
  const valorContratos = contratos
    .filter(c => c.status === 'active' || c.status === 'ongoing')
    .reduce((sum, c) => sum + (c.valor_contratado || 0), 0);

  // Próximos editais a vencer
  const proximosVencer = editais
    .filter(e => {
      const dataEncerramento = new Date(e.data_encerramento);
      const diff = (dataEncerramento.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return diff > 0 && diff <= 7;
    })
    .slice(0, 5);

  // Editais recentes
  const editaisRecentes = editais.slice(0, 8);

  // Estatísticas do funil
  const funilStats = [
    { label: 'Novo', count: editais.filter(e => e.status === 'draft').length, color: 'bg-blue-500' },
    { label: 'Publicado', count: editais.filter(e => e.status === 'published').length, color: 'bg-cyan-500' },
    { label: 'Em Análise', count: editais.filter(e => e.status === 'under_analysis').length, color: 'bg-yellow-500' },
    { label: 'Proposta Enviada', count: editais.filter(e => e.status === 'sent').length, color: 'bg-orange-500' },
    { label: 'Ganho', count: editais.filter(e => e.status === 'won').length, color: 'bg-green-500' },
    { label: 'Perdido', count: editais.filter(e => e.status === 'lost').length, color: 'bg-red-500' },
  ];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      draft: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Rascunho' },
      published: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Publicado' },
      under_analysis: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Em Análise' },
      sent: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Proposta Enviada' },
      won: { bg: 'bg-green-100', text: 'text-green-700', label: 'Ganho' },
      lost: { bg: 'bg-red-100', text: 'text-red-700', label: 'Perdido' },
      canceled: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Cancelado' },
      expired: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Expirado' },
    };
    const badge = badges[status] || { bg: 'bg-gray-100', text: 'text-gray-700', label: status };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-slate-500">Carregando dados do banco...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Mock data notification banner */}
      {usingMockData && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">Usando dados de demonstração</p>
            <p className="text-xs text-amber-600">O banco de dados ainda não contém editais reais. Dados simulados estão sendo exibidos.</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Visão geral das suas licitações
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedCompany && (
            <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm">
              <Building2 className="w-4 h-4" />
              {selectedCompany.name}
            </span>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Editais Abertos</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{editaisAbertos}</p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Propostas Enviadas</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{propostasEnviadas}</p>
            </div>
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <Send className="w-5 h-5 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Contratos Ativos</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{contratosAtivos}</p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Valor Contratos</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(valorContratos)}</p>
            </div>
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Funil de Vendas */}
        <div className="lg:col-span-2 bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Funil de Licitações</h2>
            <Link to="/funil" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              Ver funil completo →
            </Link>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {funilStats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className={`w-full h-2 rounded-full ${stat.color} mb-2`} />
                <p className="text-2xl font-bold text-slate-900">{stat.count}</p>
                <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Alertas Rápidos */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">⚠️ Editais Urgentes</h2>
          {proximosVencer.length > 0 ? (
            <div className="space-y-3">
              {proximosVencer.map((edital) => (
                <Link
                  key={edital.id}
                  to={`/editais?search=${edital.id}`}
                  className="block p-3 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{edital.titulo}</p>
                      <p className="text-xs text-red-600 mt-1">
                        Encerra em {formatDate(edital.data_encerramento)}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400">
              <CheckCircle className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm">Nenhum edital urgente</p>
            </div>
          )}
        </div>
      </div>

      {/* Tabela de Editais Recentes */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-5 border-b border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h2 className="text-lg font-semibold text-slate-900">Editais Recentes</h2>
            <Link
              to="/editais"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <FileText className="w-4 h-4" />
              Ver todos editais
            </Link>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Edital</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Órgão</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">UF</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Valor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Encerramento</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {editaisRecentes.length > 0 ? (
                editaisRecentes.map((edital) => (
                  <tr key={edital.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{edital.numero_edital || 'N/A'}</p>
                        <p className="text-xs text-slate-500 truncate max-w-[200px]">{edital.titulo}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-600 truncate max-w-[150px]">{edital.orgao}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                        {edital.UF || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-900">
                        {edital.valor_estimado ? formatCurrency(edital.valor_estimado) : '-'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-600">{formatDate(edital.data_encerramento)}</p>
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(edital.status)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/editais?search=${edital.id}`}
                        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                      >
                        <Eye className="w-4 h-4" />
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="text-slate-400">
                      <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">Nenhum edital encontrado</p>
                      <p className="text-xs mt-1">Adicione editais para começar a acompanhar</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;