import React, { useState } from 'react';
import { Plus, CheckCircle, Clock, AlertCircle, FileText, X, Send, User, Calendar } from 'lucide-react';

const OS_STATUS = [
  { id: 'pendente', label: 'Pendente', color: 'bg-slate-100 text-slate-600', icon: Clock },
  { id: 'em_andamento', label: 'Em Andamento', color: 'bg-blue-100 text-blue-600', icon: Clock },
  { id: 'concluida', label: 'Concluída', color: 'bg-green-100 text-green-600', icon: CheckCircle },
];

const mockOrdens = [
  {
    id: 'os-001',
    numero: 'OS-2026-0001',
    titulo: 'Elaboração de proposta - Pregão Material Escritório',
    edital: 'Prefeitura de São Paulo',
    responsavel: 'Marina Silva',
    status: 'em_andamento',
    prazo: '2026-05-15',
    checklist: [
      { item: 'Análise do edital', done: true },
      { item: 'Levantamento de custos', done: true },
      { item: 'Elaboração da proposta', done: false },
      { item: 'Revisão final', done: false },
      { item: 'Envio da proposta', done: false },
    ],
  },
  {
    id: 'os-002',
    numero: 'OS-2026-0002',
    titulo: 'Análise de viabilidade - Contratação de TI',
    edital: 'Hospital das Clínicas',
    responsavel: 'Carlos Santos',
    status: 'pendente',
    prazo: '2026-05-20',
    checklist: [
      { item: 'Verificar requisitos técnicos', done: false },
      { item: 'Verificar regularidade fiscal', done: false },
      { item: 'Avaliar capacidade operacional', done: false },
      { item: 'Decisão de participação', done: false },
    ],
  },
  {
    id: 'os-003',
    numero: 'OS-2026-0003',
    titulo: 'Follow-up proposta enviada',
    edital: 'Universidade Federal',
    responsavel: 'Marina Silva',
    status: 'concluida',
    prazo: '2026-05-05',
    checklist: [
      { item: 'Verificar resultado', done: true },
      { item: 'Contatar órgão', done: true },
      { item: 'Documentar resposta', done: true },
    ],
  },
];

export function OrdensServico() {
  const [showModal, setShowModal] = useState(false);
  const [selectedOS, setSelectedOS] = useState<typeof mockOrdens[0] | null>(null);
  const [filter, setFilter] = useState<string>('todos');

  const filteredOS = mockOrdens.filter(os => filter === 'todos' || os.status === filter);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Ordens de Serviço</h1>
          <p className="text-sm text-slate-500">Gerencie tarefas e follow-ups de licitações</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Nova OS
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {OS_STATUS.map(status => {
          const count = mockOrdens.filter(os => os.status === status.id).length;
          return (
            <button
              key={status.id}
              onClick={() => setFilter(status.id)}
              className={`bg-white rounded-xl p-4 border text-left transition-all ${
                filter === status.id ? 'border-blue-500 shadow-md' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <status.icon className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-500">{status.label}</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">{count}</div>
            </button>
          );
        })}
      </div>

      {/* Filtro rápido */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilter('todos')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === 'todos' ? 'bg-blue-100 text-blue-700' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Todas ({mockOrdens.length})
        </button>
        {OS_STATUS.map(status => (
          <button
            key={status.id}
            onClick={() => setFilter(status.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === status.id ? 'bg-blue-100 text-blue-700' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {status.label} ({mockOrdens.filter(os => os.status === status.id).length})
          </button>
        ))}
      </div>

      {/* Lista de OS */}
      <div className="space-y-3">
        {filteredOS.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 font-medium">Nenhuma ordem de serviço</p>
          </div>
        ) : (
          filteredOS.map(os => {
            const progress = os.checklist.filter(c => c.done).length / os.checklist.length * 100;
            const statusInfo = OS_STATUS.find(s => s.id === os.status);

            return (
              <div
                key={os.id}
                onClick={() => setSelectedOS(os)}
                className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:shadow-md hover:border-slate-300 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className="text-xs font-mono text-slate-500">{os.numero}</span>
                    <h3 className="font-medium text-slate-900 mt-1">{os.titulo}</h3>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo?.color}`}>
                    {statusInfo?.label}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    {os.edital}
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {os.responsavel}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Prazo: {formatDate(os.prazo)}
                  </span>
                </div>

                {/* Progresso */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Progresso</span>
                    <span className="font-medium text-slate-700">{Math.round(progress)}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal de detalhes */}
      {selectedOS && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setSelectedOS(null)}
        >
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl">
            <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-mono text-slate-500">{selectedOS.numero}</span>
                <h2 className="text-lg font-semibold text-slate-900">{selectedOS.titulo}</h2>
              </div>
              <button
                onClick={() => setSelectedOS(null)}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-slate-500 mb-1">Edital</div>
                  <div className="font-medium">{selectedOS.edital}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Responsável</div>
                  <div className="font-medium">{selectedOS.responsavel}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Prazo</div>
                  <div className="font-medium">{formatDate(selectedOS.prazo)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Status</div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${OS_STATUS.find(s => s.id === selectedOS.status)?.color}`}>
                    {OS_STATUS.find(s => s.id === selectedOS.status)?.label}
                  </span>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Checklist</h3>
                <div className="space-y-2">
                  {selectedOS.checklist.map((item, i) => (
                    <label key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        defaultChecked={item.done}
                        className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className={`text-sm ${item.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                        {item.item}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 px-6 py-4 flex items-center gap-3">
              <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                <CheckCircle className="w-4 h-4" />
                Marcar Concluída
              </button>
              <button
                onClick={() => setSelectedOS(null)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 ml-auto"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nova OS */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
            <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Nova Ordem de Serviço</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Título</label>
                <input
                  type="text"
                  placeholder="Descreva a tarefa..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Edital Relacionado</label>
                <select className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20">
                  <option>Selecione...</option>
                  <option>Pregão Material Escritório - Prefeitura SP</option>
                  <option>Contratação de TI - Hospital das Clínicas</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Responsável</label>
                  <select className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20">
                    <option>Marina Silva</option>
                    <option>Carlos Santos</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Prazo</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 px-6 py-4 flex items-center gap-3">
              <button
                onClick={() => {
                  alert('OS criada com sucesso!');
                  setShowModal(false);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                Criar OS
              </button>
              <button
                onClick={() => setShowModal(false)}
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