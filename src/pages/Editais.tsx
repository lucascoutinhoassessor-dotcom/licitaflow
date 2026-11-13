import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Calendar,
  MapPin,
  Building,
  DollarSign,
  ExternalLink,
  Plus,
  Download,
  RefreshCw,
  X,
  Clock,
  FileText,
  CheckCircle,
  AlertTriangle,
  Eye,
  Send,
  XCircle
} from 'lucide-react';
import { mockEditais, dashboardStats } from '../data/mockData';
import { Edital } from '../types';

// Estados do Brasil
const ESTADOS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

// Modalidades
const MODALIDADES: Record<string, string> = {
  pregao_eletronico: 'Pregão Eletrônico',
  pregao_presencial: 'Pregão Presencial',
  concurrencia: 'Concorrência',
  tomada_precos: 'Tomada de Preços',
  convite: 'Convite',
  leilao: 'Leilão',
  dispensa_eletronica: 'Dispensa Eletrônica',
  inexigibilidade: 'Inexigibilidade',
  dialogo_competitivo: 'Diálogo Competitivo',
};

// Status
const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'novo', label: 'Novo' },
  { value: 'em_analise', label: 'Em Análise' },
  { value: 'interessado', label: 'Interessado' },
  { value: 'proposta_enviada', label: 'Proposta Enviada' },
  { value: 'contratado', label: 'Contratado' },
  { value: 'perdido', label: 'Perdido' },
  { value: 'encerrado', label: 'Encerrado' },
];

// Portais
const PORTAIS = [
  'Comprasnet',
  'Portal de Compras Públicas',
  'Licitações-e',
  'BLL COMPRAS',
  'COMPRAS MG',
  'COMPRAS RS',
];

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const getStatusBadge = (status: string) => {
  const badges: Record<string, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
    novo: { bg: 'bg-blue-100', text: 'text-blue-700', icon: <FileText className="w-3 h-3" />, label: 'Novo' },
    em_analise: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: <Eye className="w-3 h-3" />, label: 'Em Análise' },
    interessado: { bg: 'bg-purple-100', text: 'text-purple-700', icon: <CheckCircle className="w-3 h-3" />, label: 'Interessado' },
    proposta_enviada: { bg: 'bg-orange-100', text: 'text-orange-700', icon: <Send className="w-3 h-3" />, label: 'Proposta Enviada' },
    contratado: { bg: 'bg-green-100', text: 'text-green-700', icon: <CheckCircle className="w-3 h-3" />, label: 'Contratado' },
    perdido: { bg: 'bg-red-100', text: 'text-red-700', icon: <XCircle className="w-3 h-3" />, label: 'Perdido' },
    encerrado: { bg: 'bg-slate-100', text: 'text-slate-700', icon: <Clock className="w-3 h-3" />, label: 'Encerrado' },
  };
  const badge = badges[status] || badges.encerrado;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
      {badge.icon}
      {badge.label}
    </span>
  );
};

export function Editais() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUFs, setSelectedUFs] = useState<string[]>(ESTADOS);
  const [selectedModalities, setSelectedModalities] = useState<string[]>(Object.keys(MODALIDADES));
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedPortals, setSelectedPortals] = useState<string[]>(PORTAIS);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const [sortBy, setSortBy] = useState<'prazo' | 'valor' | 'recente'>('prazo');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedEdital, setSelectedEdital] = useState<Edital | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const itemsPerPage = 20;

  // Filtrar editais
  const filteredEditais = useMemo(() => {
    let result = [...mockEditais];

    // Busca por texto
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(e =>
        e.objeto.toLowerCase().includes(query) ||
        e.orgao.toLowerCase().includes(query) ||
        e.numeroCompra.toLowerCase().includes(query) ||
        e.numeroControlePNCP.toLowerCase().includes(query)
      );
    }

    // Filtro por UF
    if (selectedUFs.length > 0 && selectedUFs.length < 27) {
      result = result.filter(e => selectedUFs.includes(e.uf));
    }

    // Filtro por modalidade
    if (selectedModalities.length > 0 && selectedModalities.length < Object.keys(MODALIDADES).length) {
      result = result.filter(e => selectedModalities.includes(e.modalidade));
    }

    // Filtro por status
    if (selectedStatus) {
      result = result.filter(e => e.status === selectedStatus);
    }

    // Filtro por portal
    if (selectedPortals.length > 0 && selectedPortals.length < PORTAIS.length) {
      result = result.filter(e => selectedPortals.includes(e.portal));
    }

    // Filtro por data
    if (dateRange.start) {
      result = result.filter(e => new Date(e.dataPublicacao) >= new Date(dateRange.start));
    }
    if (dateRange.end) {
      result = result.filter(e => new Date(e.dataPublicacao) <= new Date(dateRange.end));
    }

    // Ordenação
    const now = new Date();
    if (sortBy === 'prazo') {
      result.sort((a, b) => new Date(a.dataEncerramento).getTime() - new Date(b.dataEncerramento).getTime());
    } else if (sortBy === 'valor') {
      result.sort((a, b) => (b.valorEstimado || 0) - (a.valorEstimado || 0));
    } else {
      result.sort((a, b) => new Date(b.dataPublicacao).getTime() - new Date(a.dataPublicacao).getTime());
    }

    return result;
  }, [searchQuery, selectedUFs, selectedModalities, selectedStatus, selectedPortals, dateRange, sortBy]);

  // Paginação
  const totalPages = Math.ceil(filteredEditais.length / itemsPerPage);
  const paginatedEditais = filteredEditais.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Estatísticas
  const stats = useMemo(() => {
    const urgente = filteredEditais.filter(e => {
      const diff = (new Date(e.dataEncerramento).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
      return diff > 0 && diff <= 3;
    }).length;

    const emBreve = filteredEditais.filter(e => {
      const diff = (new Date(e.dataEncerramento).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
      return diff > 0 && diff <= 7;
    }).length;

    const valorTotal = filteredEditais.reduce((sum, e) => sum + (e.valorEstimado || 0), 0);

    return { urgente, emBreve, valorTotal };
  }, [filteredEditais]);

  const toggleUF = (uf: string) => {
    setSelectedUFs(prev =>
      prev.includes(uf) ? prev.filter(u => u !== uf) : [...prev, uf]
    );
    setCurrentPage(1);
  };

  const selectAllUFs = () => {
    setSelectedUFs(ESTADOS);
    setCurrentPage(1);
  };

  const deselectAllUFs = () => {
    setSelectedUFs([]);
    setCurrentPage(1);
  };

  const toggleModality = (mod: string) => {
    setSelectedModalities(prev =>
      prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]
    );
    setCurrentPage(1);
  };

  const togglePortal = (portal: string) => {
    setSelectedPortals(prev =>
      prev.includes(portal) ? prev.filter(p => p !== portal) : [...prev, portal]
    );
    setCurrentPage(1);
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsLoading(false);
  };

  const handleExport = () => {
    // Exportar para CSV
    const csv = [
      ['Número', 'Objeto', 'Órgão', 'UF', 'Modalidade', 'Valor', 'Data Encerramento', 'Status'],
      ...filteredEditais.map(e => [
        e.numeroCompra,
        e.objeto,
        e.orgao,
        e.uf,
        MODALIDADES[e.modalidade] || e.modalidade,
        e.valorEstimado?.toString() || '',
        formatDate(e.dataEncerramento),
        e.status
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `editais_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Captação de Editais</h1>
          <p className="text-sm text-slate-500">Dados via PNCP — Portal Nacional de Contratações Públicas</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar</span>
          </button>
        </div>
      </div>

      {/* Filtros mobile */}
      <div className="lg:hidden">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700"
        >
          <Filter className="w-4 h-4" />
          Filtros
          <span className="text-slate-400">({selectedUFs.length < 27 || selectedStatus || selectedModalities.length < 9 ? 'ativos' : 'todos'})</span>
        </button>
      </div>

      {/* Painel de filtros */}
      <div className={`bg-slate-800 rounded-xl p-4 space-y-4 ${showFilters ? 'block' : 'hidden lg:block'}`}>
        {/* Estados */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-200">
              📍 Estados ({selectedUFs.length}/27)
            </span>
            <div className="flex gap-2">
              <button onClick={selectAllUFs} className="text-xs text-blue-400 hover:text-blue-300">todos</button>
              <button onClick={deselectAllUFs} className="text-xs text-blue-400 hover:text-blue-300">limpar</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ESTADOS.map(uf => (
              <button
                key={uf}
                onClick={() => toggleUF(uf)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  selectedUFs.includes(uf)
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
              >
                {uf}
              </button>
            ))}
          </div>
        </div>

        {/* Portais */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-200">
              🔗 Portais de Compra ({selectedPortals.length}/{PORTAIS.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PORTAIS.map(portal => (
              <button
                key={portal}
                onClick={() => togglePortal(portal)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  selectedPortals.includes(portal)
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
              >
                {portal}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Busca e controles */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por objeto, órgão, número do edital..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="flex-1 border-none outline-none text-sm text-slate-700 placeholder:text-slate-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dateRange.start}
            onChange={e => { setDateRange(prev => ({ ...prev, start: e.target.value })); setCurrentPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
          <span className="text-slate-400">até</span>
          <input
            type="date"
            value={dateRange.end}
            onChange={e => { setDateRange(prev => ({ ...prev, end: e.target.value })); setCurrentPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />

          <select
            value={selectedStatus}
            onChange={e => { setSelectedStatus(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          >
            {STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="prazo">Prazo (mais urgente)</option>
            <option value="valor">Maior valor</option>
            <option value="recente">Mais recente</option>
          </select>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="flex flex-wrap items-center gap-4 p-3 bg-white border border-slate-200 rounded-xl">
        <div className="flex flex-col">
          <span className="text-lg font-bold text-slate-900">{filteredEditais.length.toLocaleString('pt-BR')}</span>
          <span className="text-xs text-slate-500">Total de editais</span>
        </div>
        <div className="w-px h-8 bg-slate-200" />
        <div className="flex flex-col">
          <span className="text-lg font-bold text-red-600">{stats.urgente}</span>
          <span className="text-xs text-slate-500">Sessão em ≤ 3 dias</span>
        </div>
        <div className="w-px h-8 bg-slate-200" />
        <div className="flex flex-col">
          <span className="text-lg font-bold text-yellow-600">{stats.emBreve}</span>
          <span className="text-xs text-slate-500">Em até 7 dias</span>
        </div>
        <div className="w-px h-8 bg-slate-200" />
        <div className="flex flex-col">
          <span className="text-lg font-bold text-slate-900">
            {stats.valorTotal > 0 ? formatCurrency(stats.valorTotal) : '—'}
          </span>
          <span className="text-xs text-slate-500">Valor total estimado</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-green-600">
          <span className="w-2 h-2 bg-green-500 rounded-full" />
          PNCP — API Oficial
        </div>
      </div>

      {/* Lista de editais */}
      <div className="space-y-2">
        {paginatedEditais.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 font-medium">Nenhum edital encontrado</p>
            <p className="text-sm text-slate-400 mt-1">Tente ajustar os filtros ou ampliar o período</p>
          </div>
        ) : (
          paginatedEditais.map(edital => {
            const diff = Math.ceil((new Date(edital.dataEncerramento).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
            const isUrgente = diff > 0 && diff <= 3;
            const isEmBreve = diff > 3 && diff <= 7;

            return (
              <div
                key={edital.id}
                onClick={() => setSelectedEdital(edital)}
                className={`bg-white rounded-xl border p-4 cursor-pointer hover:shadow-md transition-all ${
                  isUrgente ? 'border-l-4 border-l-red-500 border-slate-200' :
                  isEmBreve ? 'border-l-4 border-l-yellow-500 border-slate-200' :
                  'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-start gap-3">
                  {/* Info principal */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-xs font-mono text-slate-500">Nº {edital.numeroCompra}</span>
                      <span className="text-xs text-blue-600 font-medium">{edital.numeroControlePNCP.slice(0, 15)}...</span>
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                        {MODALIDADES[edital.modalidade] || edital.modalidade}
                      </span>
                      {getStatusBadge(edital.status)}
                    </div>

                    <h3 className="text-sm font-medium text-slate-900 mb-1 line-clamp-2">
                      {edital.objeto}
                    </h3>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Building className="w-3 h-3" />
                        {edital.orgao.slice(0, 40)}...
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {edital.cidade} — {edital.uf}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Pub. {formatDate(edital.dataPublicacao)}
                      </span>
                    </div>
                  </div>

                  {/* Info lateral */}
                  <div className="flex lg:flex-col items-center lg:items-end gap-3 lg:gap-1">
                    <div className="text-right">
                      {edital.valorEstimado ? (
                        <>
                          <div className="text-lg font-bold text-slate-900">
                            {formatCurrency(edital.valorEstimado)}
                          </div>
                          <div className="text-xs text-slate-500">valor estimado</div>
                        </>
                      ) : (
                        <div className="text-sm text-slate-400">Sigiloso</div>
                      )}
                    </div>

                    <div className="text-right lg:text-center">
                      <div className="text-xs text-slate-500 mb-0.5">Encerramento</div>
                      <div className={`text-sm font-semibold ${
                        diff < 0 ? 'text-slate-400' :
                        diff <= 3 ? 'text-red-600' :
                        diff <= 7 ? 'text-yellow-600' :
                        'text-green-600'
                      }`}>
                        {diff < 0 ? 'Encerrado' :
                         diff === 0 ? 'Hoje!' :
                         diff === 1 ? 'Amanhã' :
                         `Em ${diff}d`}
                      </div>
                      <div className="text-xs text-slate-400">{formatDate(edital.dataEncerramento)}</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between py-4">
          <div className="text-sm text-slate-500">
            Mostrando {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filteredEditais.length)} de {filteredEditais.length}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ‹
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let page = i + 1;
              if (totalPages > 5) {
                if (currentPage > 3) {
                  page = currentPage - 2 + i;
                }
                if (page > totalPages) {
                  page = totalPages - 4 + i;
                }
              }
              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium ${
                    currentPage === page
                      ? 'bg-blue-600 text-white'
                      : 'border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {page}
                </button>
              );
            })}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ›
            </button>
          </div>
        </div>
      )}

      {/* Modal de detalhes */}
      {selectedEdital && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setSelectedEdital(null)}
        >
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 line-clamp-2 pr-4">{selectedEdital.objeto}</h2>
              <button
                onClick={() => setSelectedEdital(null)}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Identificação */}
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 pb-2 border-b border-slate-100">
                  Identificação
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Número de Controle PNCP</div>
                    <div className="font-mono text-slate-700">{selectedEdital.numeroControlePNCP}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Número da Compra</div>
                    <div className="font-medium text-slate-700">{selectedEdital.numeroCompra}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Modalidade</div>
                    <div className="mt-1">
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                        {MODALIDADES[selectedEdital.modalidade] || selectedEdital.modalidade}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Status</div>
                    <div className="mt-1">
                      {getStatusBadge(selectedEdital.status)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Órgão */}
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 pb-2 border-b border-slate-100">
                  Órgão / Entidade
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Razão Social</div>
                    <div className="font-medium text-slate-700">{selectedEdital.orgao}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">CNPJ</div>
                    <div className="font-mono text-slate-700">{selectedEdital.cnpjOrgao}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Unidade</div>
                    <div className="text-slate-700">{selectedEdital.unidade}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Localização</div>
                    <div className="text-slate-700">{selectedEdital.cidade} — {selectedEdital.uf}</div>
                  </div>
                </div>
              </div>

              {/* Datas e Valores */}
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 pb-2 border-b border-slate-100">
                  Datas e Valores
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Publicação</div>
                    <div className="text-slate-700">{formatDate(selectedEdital.dataPublicacao)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Encerramento das Propostas</div>
                    <div className={`font-semibold ${
                      (new Date(selectedEdital.dataEncerramento).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24) <= 3
                        ? 'text-red-600' : 'text-slate-700'
                    }`}>
                      {formatDate(selectedEdital.dataEncerramento)}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs text-slate-500 mb-1">Valor Total Estimado</div>
                    <div className="text-xl font-bold text-slate-900">
                      {selectedEdital.valorEstimado ? formatCurrency(selectedEdital.valorEstimado) : 'Sigiloso / Não informado'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Objeto completo */}
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 pb-2 border-b border-slate-100">
                  Objeto Completo
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed">{selectedEdital.objeto}</p>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center gap-3">
              <button
                onClick={() => window.open('https://pncp.gov.br', '_blank')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                <ExternalLink className="w-4 h-4" />
                Abrir no Portal
              </button>
              <button
                onClick={() => {
                  alert('Edital adicionado ao funil!');
                  setSelectedEdital(null);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
              >
                <Plus className="w-4 h-4" />
                Adicionar ao Funil
              </button>
              <button
                onClick={() => setSelectedEdital(null)}
                className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 ml-auto"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}