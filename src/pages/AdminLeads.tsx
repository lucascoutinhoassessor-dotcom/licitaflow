import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, Search, Mail, CheckCircle, XCircle, Key, Send,
  Calendar, Building, Phone, Copy, Check
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { resendService } from '../services/resendService';
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
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost' | 'approved';
  source: string;
  created_at: string;
  access_link?: string;
  access_link_expires?: string;
}

const statusLabels: Record<string, { label: string; color: string }> = {
  new: { label: 'Novo', color: 'bg-blue-500' },
  contacted: { label: 'Contactado', color: 'bg-yellow-500' },
  qualified: { label: 'Qualificado', color: 'bg-purple-500' },
  converted: { label: 'Convertido', color: 'bg-green-500' },
  approved: { label: 'Aprovado', color: 'bg-emerald-500' },
  lost: { label: 'Perdido', color: 'bg-red-500' },
};

export function AdminLeadsPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

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

  const generateAccessLink = (leadId: string) => {
    // Gerar token único
    const token = btoa(`${leadId}-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    const baseUrl = window.location.origin;
    return `${baseUrl}/demo-access?token=${token}&lead=${leadId}`;
  };

  const approveLead = async (lead: Lead) => {
    const accessLink = generateAccessLink(lead.id);
    setGeneratedLink(accessLink);
    setSelectedLead(lead);
    setShowApproveModal(true);

    // Salvar link no banco
    try {
      await supabase
        .from('leads')
        .update({
          status: 'approved',
          access_link: accessLink,
          access_link_expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq('id', lead.id);
      
      loadLeads();
    } catch (error) {
      console.error('Error approving lead:', error);
    }
  };

  const sendInviteEmail = async () => {
    if (!selectedLead) return;
    
    setSendingEmail(true);
    try {
      const success = await resendService.sendEarlyAccessInvite(
        selectedLead.email,
        selectedLead.name,
        generatedLink
      );
      
      if (success) {
        alert('Email enviado com sucesso!');
        setShowApproveModal(false);
      } else {
        alert('Erro ao enviar email. Tente novamente.');
      }
    } catch (error) {
      console.error('Error sending invite:', error);
      alert('Erro ao enviar email.');
    } finally {
      setSendingEmail(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const updateLeadStatus = async (id: string, status: string) => {
    try {
      await supabase
        .from('leads')
        .update({ status })
        .eq('id', id);
      loadLeads();
    } catch (error) {
      console.error('Error updating lead:', error);
    }
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
    approved: leads.filter(l => l.status === 'approved').length,
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
          <h1 className="text-2xl font-bold text-slate-900">Gerenciar Acessos Antecipados</h1>
          <p className="text-slate-500">Aprove leads e envie convites de acesso à plataforma</p>
        </div>
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
          <div className="text-sm font-medium text-slate-500">Aprovados</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{stats.approved}</div>
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
          <option value="approved">Aprovado</option>
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
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Data</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-500">
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
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white ${statusLabels[lead.status]?.color}`}>
                        {statusLabels[lead.status]?.label}
                      </span>
                      {lead.access_link && (
                        <div className="text-xs text-slate-500 mt-1">
                          Link gerado ✓
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Calendar className="w-3 h-3" />
                        {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {(lead.status === 'new' || lead.status === 'contacted' || lead.status === 'qualified') && (
                          <button
                            onClick={() => approveLead(lead)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg transition-colors"
                          >
                            <Key className="w-3 h-3" />
                            Aprovar Acesso
                          </button>
                        )}
                        {lead.status === 'approved' && lead.access_link && (
                          <>
                            <button
                              onClick={() => {
                                setGeneratedLink(lead.access_link!);
                                setSelectedLead(lead);
                                setShowApproveModal(true);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors"
                            >
                              <Send className="w-3 h-3" />
                              Reenviar Email
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Approve Modal */}
      {showApproveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Aprovar Acesso Antecipado</h3>
                <p className="text-sm text-slate-500">{selectedLead?.name} - {selectedLead?.email}</p>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Link de Acesso Gerado:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={generatedLink}
                  readOnly
                  className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-600"
                />
                <button
                  onClick={copyLink}
                  className="px-3 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg transition-colors"
                  title="Copiar link"
                >
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                O link é válido por 7 dias. O cliente poderá acessar a plataforma diretamente.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={sendInviteEmail}
                disabled={sendingEmail}
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {sendingEmail ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Enviar Email de Convite
                  </>
                )}
              </button>
              <button
                onClick={() => setShowApproveModal(false)}
                className="px-4 py-2.5 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
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
