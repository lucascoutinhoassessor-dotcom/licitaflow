import React, { useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, CreditCard, ArrowUpRight, ArrowDownRight, Calendar, Download } from 'lucide-react';

export function Financeiro() {
  const [period, setPeriod] = useState('6m');

  const stats = {
    entradas: 890000,
    saidas: 450000,
    saldo: 440000,
   预期: 1250000
  };

  const transacoes = [
    { id: 1, desc: 'Parcela Contrato #012/2024', valor: 37500, tipo: 'entrada', data: '2026-05-10', status: 'previsto' },
    { id: 2, desc: 'Pagamento Fornecedor ABC', valor: -12500, tipo: 'saida', data: '2026-05-08', status: 'pago' },
    { id: 3, desc: 'Parcela Contrato #045/2023', valor: 23333, tipo: 'entrada', data: '2026-05-05', status: 'pago' },
    { id: 4, desc: 'Impostos e taxas', valor: -8500, tipo: 'saida', data: '2026-05-01', status: 'pago' },
    { id: 5, desc: 'Parcela Contrato #012/2024', valor: 37500, tipo: 'entrada', data: '2026-04-10', status: 'pago' },
    { id: 6, desc: 'Salários', valor: -35000, tipo: 'saida', data: '2026-04-05', status: 'pago' },
  ];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(value));
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Fluxo de Caixa</h1>
          <p className="text-sm text-slate-500">Acompanhe suas entradas e saídas</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
          >
            <option value="3m">Últimos 3 meses</option>
            <option value="6m">Últimos 6 meses</option>
            <option value="1y">Último ano</option>
          </select>
          <button className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
            <Download className="w-4 h-4" />
            Exportar
          </button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4 text-green-600" />
            </div>
            <span className="text-xs text-slate-500">Entradas</span>
          </div>
          <div className="text-xl lg:text-2xl font-bold text-green-600">
            {formatCurrency(stats.entradas)}
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
              <ArrowDownRight className="w-4 h-4 text-red-600" />
            </div>
            <span className="text-xs text-slate-500">Saídas</span>
          </div>
          <div className="text-xl lg:text-2xl font-bold text-red-600">
            {formatCurrency(stats.saidas)}
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-blue-600" />
            </div>
            <span className="text-xs text-slate-500">Saldo</span>
          </div>
          <div className="text-xl lg:text-2xl font-bold text-slate-900">
            {formatCurrency(stats.saldo)}
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-purple-600" />
            </div>
            <span className="text-xs text-slate-500">Projeção</span>
          </div>
          <div className="text-xl lg:text-2xl font-bold text-purple-600">
            {formatCurrency(stats.预期)}
          </div>
        </div>
      </div>

      {/* Gráfico simplificado */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-900 mb-4">Visão Geral</h3>
        <div className="h-48 flex items-end gap-2">
          {[65, 80, 55, 90, 75, 85, 70, 95, 80, 88, 72, 92].map((h, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full bg-blue-500 rounded-t"
                style={{ height: `${h}%` }}
              />
              <span className="text-xs text-slate-400">
                {['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][i]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Transações */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">Últimas Transações</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {transacoes.map(trans => (
            <div key={trans.id} className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  trans.tipo === 'entrada' ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  {trans.tipo === 'entrada' ? (
                    <ArrowUpRight className="w-5 h-5 text-green-600" />
                  ) : (
                    <ArrowDownRight className="w-5 h-5 text-red-600" />
                  )}
                </div>
                <div>
                  <div className="font-medium text-slate-900">{trans.desc}</div>
                  <div className="text-xs text-slate-500">{formatDate(trans.data)}</div>
                </div>
              </div>
              <div className="text-right">
                <div className={`font-bold ${trans.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                  {trans.valor > 0 ? '+' : '-'}{formatCurrency(trans.valor)}
                </div>
                <span className={`text-xs ${
                  trans.status === 'pago' ? 'text-green-600' : 'text-yellow-600'
                }`}>
                  {trans.status === 'pago' ? 'Pago' : 'Previsto'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}