import React, { useState } from 'react';
import { Plus, X, Eye, Send, CheckCircle, XCircle, Clock, FileText, AlertTriangle, Filter } from 'lucide-react';
import { mockEditais } from '../data/mockData';
import { Edital } from '../types';

// Funil stages
const STAGES = [
  { id: 'novo', label: 'Novo', color: 'bg-blue-500', icon: <FileText className="w-4 h-4" /> },
  { id: 'em_analise', label: 'Em Análise', color: 'bg-yellow-500', icon: <Eye className="w-4 h-4" /> },
  { id: 'interessado', label: 'Interessado', color: 'bg-purple-500', icon: <Filter className="w-4 h-4" /> },
  { id: 'proposta_enviada', label: 'Proposta Enviada', color: 'bg-orange-500', icon: <Send className="w-4 h-4" /> },
  { id: 'contratado', label: 'Contratado', color: 'bg-green-500', icon: <CheckCircle className="w-4 h-4" /> },
  { id: 'perdido', label: 'Perdido', color: 'bg-red-500', icon: <XCircle className="w-4 h-4" /> },
];

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export function Funil() {
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [selectedEdital, setSelectedEdital] = useState<Edital | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Agrupar editais por status
  const editaisByStage = STAGES.reduce((acc, stage) => {
    acc[stage.id] = mockEditais.filter(e => e.status === stage.id);
    return acc;
  }, {} as Record<string, Edital[]>);

  const handleDragStart = (e: React.DragEvent, editalId: string) => {
    e.dataTransfer.setData('editalId', editalId);
  };

  const handleDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    const editalId = e.dataTransfer.getData('editableId');
    // Aqui você moveria o edital para o novo estágio
    alert(`Edital movido para: ${STAGES.find(s => s.id === stageId)?.label}`);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Funil de Prospecção</h1>
          <p className="text-sm text-slate-500">Gerencie suas oportunidades de negócio em licitações</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Adicionar ao Funil
        </button>
      </div>

      {/* Resumo do funil */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {STAGES.map(stage => {
          const count = editaisByStage[stage.id]?.length || 0;
          return (
            <div
              key={stage.id}
              onClick={() => setSelectedStage(selectedStage === stage.id ? null : stage.id)}
              className={`p-3 bg-white rounded-xl border cursor-pointer transition-all ${
                selectedStage === stage.id ? 'border-blue-500 shadow-md' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-3 h-3 rounded-full ${stage.color}`} />
                <span className="text-xs text-slate-500">{stage.label}</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">{count}</div>
              <div className="text-xs text-slate-400">
                {formatCurrency(editaisByStage[stage.id]?.reduce((sum, e) => sum + (e.valorEstimado || 0), 0) || 0)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 overflow-x-auto pb-4">
        {STAGES.filter(s => !selectedStage || s.id === selectedStage).map(stage => {
          const editais = editaisByStage[stage.id] || [];
          return (
            <div
              key={stage.id}
              onDrop={e => handleDrop(e, stage.id)}
              onDragOver={handleDragOver}
              className="bg-slate-50 rounded-xl p-3 min-w-[240px]"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${stage.color}`} />
                  <span className="text-sm font-medium text-slate-700">{stage.label}</span>
                </div>
                <span className="text-xs text-slate-400 bg-white px-2 py-0.5 rounded-full">
                  {editais.length}
                </span>
              </div>

              <div className="space-y-2">
                {editais.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400">
                    Nenhum edital
                  </div>
                ) : (
                  editais.slice(0, 5).map(edital => {
                    const diff = Math.ceil((new Date(edital.dataEncerramento).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <div
                        key={edital.id}
                        draggable
                        onDragStart={e => handleDragStart(e, edital.id)}
                        onClick={() => setSelectedEdital(edital)}
                        className="bg-white p-3 rounded-lg border border-slate-200 cursor-pointer hover:shadow-md hover:border-slate-300 transition-all"
                      >
                        <div className="text-xs text-slate-500 mb-1">{edital.numeroCompra}</div>
                        <div className="text-sm font-medium text-slate-900 line-clamp-2 mb-2">
                          {edital.objeto}
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">{edital.uf}</span>
                          <span className={`font-medium ${
                            diff < 0 ? 'text-slate-400' :
                            diff <= 3 ? 'text-red-600' :
                            diff <= 7 ? 'text-yellow-600' :
                            'text-green-600'
                          }`}>
                            {diff < 0 ? 'Encerrado' : `${diff}d`}
                          </span>
                        </div>
                        {edital.valorEstimado && (
                          <div className="text-xs font-medium text-slate-700 mt-1">
                            {formatCurrency(edital.valorEstimado)}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {editais.length > 5 && (
                <button className="w-full mt-2 py-2 text-xs text-blue-600 hover:bg-blue-50 rounded-lg">
                  Ver todos ({editais.length})
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal de detalhes */}
      {selectedEdital && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setSelectedEdital(null)}
        >
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selectedEdital.objeto}</h2>
                <p className="text-sm text-slate-500">{selectedEdital.numeroCompra}</p>
              </div>
              <button
                onClick={() => setSelectedEdital(null)}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-slate-500 mb-1">Órgão</div>
                  <div className="font-medium">{selectedEdital.orgao}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">UF</div>
                  <div className="font-medium">{selectedEdital.uf}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Valor Estimado</div>
                  <div className="font-bold text-lg">
                    {selectedEdital.valorEstimado ? formatCurrency(selectedEdital.valorEstimado) : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Encerramento</div>
                  <div className="font-medium">{formatDate(selectedEdital.dataEncerramento)}</div>
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500 mb-2">Mover para:</div>
                <div className="flex flex-wrap gap-2">
                  {STAGES.map(stage => (
                    <button
                      key={stage.id}
                      onClick={() => {
                        alert(`Edital movido para: ${stage.label}`);
                        setSelectedEdital(null);
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                        stage.id === selectedEdital.status
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                      disabled={stage.id === selectedEdital.status}
                    >
                      <div className={`w-2 h-2 rounded-full ${stage.color}`} />
                      {stage.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center gap-3">
              <button
                onClick={() => alert('Abrindo portal...')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                Abrir no Portal
              </button>
              <button
                onClick={() => setSelectedEdital(null)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 ml-auto"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal adicionar */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowAddModal(false)}
        >
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
            <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Adicionar ao Funil</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Número do Edital
                </label>
                <input
                  type="text"
                  placeholder="Ex: 0001/2024"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Objeto
                </label>
                <textarea
                  rows={3}
                  placeholder="Descrição do objeto da licitação..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Status Inicial
                </label>
                <select className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20">
                  {STAGES.map(stage => (
                    <option key={stage.id} value={stage.id}>{stage.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border-t border-slate-200 px-6 py-4 flex items-center gap-3">
              <button
                onClick={() => {
                  alert('Edital adicionado ao funil!');
                  setShowAddModal(false);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                Adicionar
              </button>
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}