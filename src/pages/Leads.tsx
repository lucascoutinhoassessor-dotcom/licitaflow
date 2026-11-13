import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, Search, Download, Phone, Mail, Building, 
  Calendar, CheckCircle, Clock, XCircle, MoreHorizontal 
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  cnpj: string;
  plan_interest: string;
  message: string;
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';
  source: string;
  created_at: string;
  contacted_at: string | null;
  notes: string;
}

const statusLabels: Record<string, { label: string; color: string }> = {
  new: { label: 'Novo', color: 'bg-blue-500' },
  contacted: { label: 'Contactado', color: 'bg-yellow-500' },
  qualified: { label: 'Qualificado', color: 'bg-purple-500' },
  converted: { label: 'Convertido', color: 'bg-green-500' },
  lost: { label: 'Perdido', color: 'bg-red-500' },
};

export function LeadsPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    loadLeads();
  }, [isAuthenticated, navigate]);

  const loadLeads = async () => {
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLeads(data || []);
    } catch (error) {
      console.error('Error loading leads:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateLeadStatus = async (id: string, status: string) => {
    try {
      const updates: any = { status };
      if (status === 'contacted') {
        updates.contacted_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      loadLeads();
    } catch (error) {
      console.error('Error updating lead:', error);
    }
  };

  const exportToCSV = () => {
    const headers = ['Nome', 'Email', 'Telefone', 'Empresa', 'CNPJ', 'Plano', 'Status', 'Data'];
    const rows = filteredLeads.map(lead => [
      lead.name,
      lead.email,
      lead.phone || '',
      lead.company || '',
      lead.cnpj || '',
      lead.plan_interest || '',
      statusLabels[lead.status]?.label || lead.status,
      new Date(lead.created_at).toLocaleDateString('pt-BR')
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `leads_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = 
      lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.company?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: leads.length,
    new: leads.filter(l => l.status === 'new').length,
    contacted: leads.filter(l => l.status === 'contacted').length,
    converted: leads.filter(l => l.status === 'converted').length,
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leads e Contatos</h1>
          <p className="text-slate-500">Gerencie os contatos do formulário de interesse</p>
        </div>
        <button 
          onClick={exportToCSV}
          className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-sm font-medium text-slate-500">Total de Leads</div>
          <div className="text-2xl font-bold mt-1">{stats.total}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-sm font-medium text-slate-500">Novos</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">{stats.new}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-sm font-medium text-slate-500">Contactados</div>
          <div className="text-2xl font-bold text-yellow-600 mt-1">{stats.contacted}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-sm font-medium text-slate-500">Convertidos</div>
          <div className="text-2xl font-bold text-green-600 mt-1">{stats.converted}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome, email ou empresa..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">Todos os status</option>
          <option value="new">Novo</option>
          <option value="contacted">Contactado</option>
          <option value="qualified">Qualificado</option>
          <option value="converted">Convertido</option>
          <option value="lost">Perdido</option>
        </select>
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Contato</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Empresa</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Plano</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Data</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    Nenhum lead encontrado
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <div className="font-medium text-slate-900">{lead.name}</div>
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <Mail className="w-3 h-3" />
                          {lead.email}
                        </div>
                        {lead.phone && (
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <Phone className="w-3 h-3" />
                            {lead.phone}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {lead.company ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-slate-900">
                            <Building className="w-4 h-4 text-slate-400" />
                            {lead.company}
                          </div>
                          {lead.cnpj && (
                            <div className="text-xs text-slate-500">CNPJ: {lead.cnpj}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {lead.plan_interest ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                          {lead.plan_interest}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white ${statusLabels[lead.status]?.color}`}>
                        {statusLabels[lead.status]?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Calendar className="w-3 h-3" />
                        {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative group">
                        <button className="p-1 hover:bg-slate-100 rounded">
                          <MoreHorizontal className="w-4 h-4 text-slate-500" />
                        </button>
                        <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-slate-200 hidden group-hover:block z-10">
                          <button 
                            onClick={() => updateLeadStatus(lead.id, 'contacted')}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          >
                            <Clock className="w-4 h-4" />
                            Marcar como Contactado
                          </button>
                          <button 
                            onClick={() => updateLeadStatus(lead.id, 'qualified')}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Marcar como Qualificado
                          </button>
                          <button 
                            onClick={() => updateLeadStatus(lead.id, 'converted')}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          >
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            Marcar como Convertido
                          </button>
                          <button 
                            onClick={() => updateLeadStatus(lead.id, 'lost')}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          >
                            <XCircle className="w-4 h-4 text-red-500" />
                            Marcar como Perdido
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
