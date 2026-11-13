import React, { useState } from 'react';
import { FileText, DollarSign, Calendar, CheckCircle, Clock, AlertTriangle, X, Eye, Download, Plus, Building } from 'lucide-react';
import { mockContracts, mockCompanies } from '../data/mockData';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export function Contratos() {
  const [selectedContract, setSelectedContract] = useState<typeof mockContracts[0] | null>(null);
  const [filter, setFilter] = useState<'todos' | 'ativo' | 'encerrado'>('todos');

  const filteredContracts = mockContracts.filter(c => filter === 'todos' || c.status === filter);

  const stats = {
    total: mockContracts.length,
    ativos: mockContracts.filter(c => c.status === 'ativo').length,
    encerrados: mockContracts.filter(c => c.status === 'encerrado').length,
    valorTotal: mockContracts.reduce((sum, c) => sum + c.valor, 0),
    aReceber: mockContracts
      .filter(c => c.status === 'ativo')
      .reduce((sum, c) => sum + c.parcelas.filter(p => p.status === 'pendente').reduce((s, p) => s + p.valor, 0), 0)
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Contratos</h1>
          <p className="text-sm text-slate-500">Acompanhe contratos ativos e encerrados</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus className="w-4 h-4" />
          Novo Contrato
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500">Total</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-xs text-slate-500">Ativos</span>
          </div>
          <div className="text-2xl font-bold text-green-600">{stats.ativos}</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500">Encerrados</span>
          </div>
          <div className="text-2xl font-bold text-slate-600">{stats.encerrados}</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-slate-500">Valor Total</span>
          </div>
          <div className="text-lg lg:text-xl font-bold text-slate-900">{formatCurrency(stats.valorTotal)}</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            <span className="text-xs text-slate-500">A Receber</span>
          </div>
          <div className="text-lg lg:text-xl font-bold text-yellow-600">{formatCurrency(stats.aReceber)}</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {(['todos', 'ativo', 'encerrado'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f ? 'bg-blue-100 text-blue-700' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {f === 'todos' ? 'Todos' : f === 'ativo' ? 'Ativos' : 'Encerrados'}
          </button>
        ))}
      </div>

      {/* Lista de contratos */}
      <div className="space-y-3">
        {filteredContracts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 font-medium">Nenhum contrato encontrado</p>
          </div>
        ) : (
          filteredContracts.map(contract => {
            const company = mockCompanies.find(c => c.id === contract.companyId);
            const parcelasPagas = contract.parcelas.filter(p => p.status === 'pago').length;
            const parcelasPendentes = contract.parcelas.filter(p => p.status === 'pendente').length;
            const parcelasAtrasadas = contract.parcelas.filter(p => p.status === 'atrasado').length;

            return (
              <div
                key={contract.id}
                onClick={() => setSelectedContract(contract)}
                className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:shadow-md hover:border-slate-300 transition-all"
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg font-bold text-slate-900">#{contract.numeroContrato}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        contract.status === 'ativo' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {contract.status === 'ativo' ? 'Ativo' : 'Encerrado'}
                      </span>
                    </div>
                    <h3 className="text-sm font-medium text-slate-900 mb-1 line-clamp-2">{contract.objeto}</h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Building className="w-3 h-3" />
                        {contract.orgao}
                      </span>
                      <span>Empresa: {company?.name?.split(' - ')[0] || 'N/A'}</span>
                    </div>
                  </div>

                  <div className="flex lg:flex-col items-center lg:items-end gap-4">
                    <div className="text-right">
                      <div className="text-2xl font-bold text-slate-900">{formatCurrency(contract.valor)}</div>
                      <div className="text-xs text-slate-500">Valor total</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-slate-700">
                        {parcelasPagas}/{contract.parcelas.length} parcelas
                      </div>
                      <div className="flex gap-1 mt-1">
                        {parcelasAtrasadas > 0 && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">{parcelasAtrasadas} atrasadas</span>
                        )}
                        {parcelasPendentes > 0 && (
                          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">{parcelasPendentes} pendentes</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-500">Vigência</div>
                      <div className="text-sm font-medium text-slate-700">
                        {formatDate(contract.dataInicio)} - {formatDate(contract.dataFim)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal de detalhes */}
      {selectedContract && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setSelectedContract(null)}
        >
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Contrato #{selectedContract.numeroContrato}</h2>
                <p className="text-sm text-slate-500">{selectedContract.objeto}</p>
              </div>
              <button
                onClick={() => setSelectedContract(null)}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Info geral */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-slate-500 mb-1">Órgão</div>
                  <div className="font-medium">{selectedContract.orgao}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Status</div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    selectedContract.status === 'ativo' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {selectedContract.status === 'ativo' ? 'Ativo' : 'Encerrado'}
                  </span>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Valor Total</div>
                  <div className="text-xl font-bold">{formatCurrency(selectedContract.valor)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Vigência</div>
                  <div className="font-medium">{formatDate(selectedContract.dataInicio)} - {formatDate(selectedContract.dataFim)}</div>
                </div>
              </div>

              {/* Parcelas */}
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Parcelas</h3>
                <div className="space-y-2">
                  {selectedContract.parcelas.map(parcela => (
                    <div
                      key={parcela.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        parcela.status === 'pago' ? 'bg-green-50 border-green-200' :
                        parcela.status === 'atrasado' ? 'bg-red-50 border-red-200' :
                        'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          parcela.status === 'pago' ? 'bg-green-500 text-white' :
                          parcela.status === 'atrasado' ? 'bg-red-500 text-white' :
                          'bg-slate-300 text-slate-700'
                        }`}>
                          {parcela.numero}
                        </span>
                        <div>
                          <div className="font-medium text-slate-900">{formatCurrency(parcela.valor)}</div>
                          <div className="text-xs text-slate-500">Vencimento: {formatDate(parcela.dataVencimento)}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          parcela.status === 'pago' ? 'bg-green-100 text-green-700' :
                          parcela.status === 'atrasado' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {parcela.status === 'pago' ? 'Pago' : parcela.status === 'atrasado' ? 'Atrasado' : 'Pendente'}
                        </span>
                        {parcela.dataPagamento && (
                          <div className="text-xs text-slate-500 mt-1">Pago em {formatDate(parcela.dataPagamento)}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center gap-3">
              <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
                <Download className="w-4 h-4" />
                Exportar
              </button>
              <button
                onClick={() => setSelectedContract(null)}
                className="px-4 py-2 bg-slate-100 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-200 ml-auto"
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