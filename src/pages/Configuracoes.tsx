import React, { useState, useEffect } from 'react';
import { Building2, Users, CreditCard, Bell, Database, Plus, Edit, Trash2, Check, X, Shield, Loader2, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Tab = 'empresas' | 'equipe' | 'plano' | 'integracoes' | 'notificacoes';

interface Company {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  inscricao_estadual: string;
  endereco: string;
  cidade: string;
  UF: string;
  CEP: string;
  telefone: string;
  email: string;
  porte: string;
  status: string;
}

interface NewCompanyForm {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  inscricao_estadual: string;
  endereco: string;
  cidade: string;
  UF: string;
  CEP: string;
  telefone: string;
  email: string;
  porte: string;
}

export function Configuracoes() {
  const [activeTab, setActiveTab] = useState<Tab>('empresas');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState<NewCompanyForm>({
    cnpj: '',
    razao_social: '',
    nome_fantasia: '',
    inscricao_estadual: '',
    endereco: '',
    cidade: '',
    UF: '',
    CEP: '',
    telefone: '',
    email: '',
    porte: 'ME-EPP',
  });

  const maxCompanies = 10;

  // Buscar empresas do Supabase
  useEffect(() => {
    async function fetchCompanies() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setCompanies(data || []);
      } catch (error) {
        console.error('Erro ao buscar empresas:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchCompanies();
  }, []);

  // Salvar empresa (criar ou atualizar)
  const handleSaveCompany = async () => {
    setSaving(true);
    try {
      if (editingId) {
        // Atualizar empresa existente
        const { error } = await supabase
          .from('companies')
          .update({
            cnpj: formData.cnpj,
            razao_social: formData.razao_social,
            nome_fantasia: formData.nome_fantasia,
            inscricao_estadual: formData.inscricao_estadual,
            endereco: formData.endereco,
            cidade: formData.cidade,
            UF: formData.UF,
            CEP: formData.CEP,
            telefone: formData.telefone,
            email: formData.email,
            porte: formData.porte,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingId);

        if (error) throw error;
      } else {
        // Criar nova empresa
        const { error } = await supabase
          .from('companies')
          .insert({
            cnpj: formData.cnpj,
            razao_social: formData.razao_social,
            nome_fantasia: formData.nome_fantasia,
            inscricao_estadual: formData.inscricao_estadual,
            endereco: formData.endereco,
            cidade: formData.cidade,
            UF: formData.UF,
            CEP: formData.CEP,
            telefone: formData.telefone,
            email: formData.email,
            porte: formData.porte,
          });

        if (error) throw error;
      }

      // Recarregar lista
      const { data } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });
      setCompanies(data || []);

      // Fechar modal e limpar form
      setShowAddModal(false);
      setEditingId(null);
      setFormData({
        cnpj: '',
        razao_social: '',
        nome_fantasia: '',
        inscricao_estadual: '',
        endereco: '',
        cidade: '',
        UF: '',
        CEP: '',
        telefone: '',
        email: '',
        porte: 'ME-EPP',
      });
    } catch (error) {
      console.error('Erro ao salvar empresa:', error);
      alert('Erro ao salvar empresa. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  // Excluir empresa
  const handleDeleteCompany = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta empresa?')) return;

    try {
      const { error } = await supabase.from('companies').delete().eq('id', id);
      if (error) throw error;

      setCompanies(companies.filter(c => c.id !== id));
    } catch (error) {
      console.error('Erro ao excluir empresa:', error);
      alert('Erro ao excluir empresa.');
    }
  };

  // Editar empresa
  const handleEditCompany = (company: Company) => {
    setFormData({
      cnpj: company.cnpj || '',
      razao_social: company.razao_social || '',
      nome_fantasia: company.nome_fantasia || '',
      inscricao_estadual: company.inscricao_estadual || '',
      endereco: company.endereco || '',
      cidade: company.cidade || '',
      UF: company.UF || '',
      CEP: company.CEP || '',
      telefone: company.telefone || '',
      email: company.email || '',
      porte: company.porte || 'ME-EPP',
    });
    setEditingId(company.id);
    setShowAddModal(true);
  };

  const tabs = [
    { id: 'empresas' as Tab, label: 'Empresas', icon: <Building2 className="w-4 h-4" /> },
    { id: 'equipe' as Tab, label: 'Equipe', icon: <Users className="w-4 h-4" /> },
    { id: 'plano' as Tab, label: 'Plano', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'integracoes' as Tab, label: 'Integrações', icon: <Database className="w-4 h-4" /> },
    { id: 'notificacoes' as Tab, label: 'Notificações', icon: <Bell className="w-4 h-4" /> },
  ];

  if (loading) {
    return (
      <div className="p-4 lg:p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-slate-500">Carregando configurações...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Configurações</h1>
        <p className="text-sm text-slate-500">Gerencie suas empresas, equipe e preferências</p>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto gap-1 pb-2 border-b border-slate-200">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-100 text-blue-700'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Empresas */}
      {activeTab === 'empresas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Empresas</h2>
              <p className="text-sm text-slate-500">
                {companies.length} de {maxCompanies} empresas cadastradas
              </p>
            </div>
            <button
              onClick={() => {
                setFormData({
                  cnpj: '',
                  razao_social: '',
                  nome_fantasia: '',
                  inscricao_estadual: '',
                  endereco: '',
                  cidade: '',
                  UF: '',
                  CEP: '',
                  telefone: '',
                  email: '',
                  porte: 'ME-EPP',
                });
                setEditingId(null);
                setShowAddModal(true);
              }}
              disabled={companies.length >= maxCompanies}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              Adicionar Empresa
            </button>
          </div>

          {companies.length >= maxCompanies && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                <Shield className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-yellow-800">Limite atingido</p>
                <p className="text-xs text-yellow-600">
                  Seu plano permite até {maxCompanies} empresas. Faça upgrade para adicionar mais.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {companies.map(company => (
              <div
                key={company.id}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <span className="text-blue-600 font-bold text-lg">
                        {company.nome_fantasia?.charAt(0) || company.razao_social?.charAt(0) || 'E'}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-medium text-slate-900 text-sm line-clamp-1">
                        {company.nome_fantasia || company.razao_social}
                      </h3>
                      <span className="text-xs text-slate-500">{company.cnpj}</span>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    company.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {company.status === 'active' ? 'Ativa' : 'Inativa'}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-slate-500 mb-3">
                  <p>{company.cidade}/{company.UF}</p>
                  <p>{company.email}</p>
                  <p>{company.telefone}</p>
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => handleEditCompany(company)}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-medium transition-colors"
                  >
                    <Edit className="w-3 h-3" />
                    Editar
                  </button>
                  <button
                    onClick={() => handleDeleteCompany(company.id)}
                    className="flex items-center justify-center gap-1 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-xs font-medium transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}

            {companies.length === 0 && (
              <div className="col-span-full text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
                <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">Nenhuma empresa cadastrada</p>
                <p className="text-xs text-slate-400 mt-1">Clique em "Adicionar Empresa" para começar</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Equipe */}
      {activeTab === 'equipe' && (
        <div className="bg-white rounded-xl p-6 border border-slate-200 text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">Gestão de Equipe</h3>
          <p className="text-sm text-slate-500">Convide membros para sua conta e gerencie permissões.</p>
          <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            Convidar Membro
          </button>
        </div>
      )}

      {/* Tab: Plano */}
      {activeTab === 'plano' && (
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-slate-900">Plano Business</h3>
              <p className="text-sm text-slate-500">R$ 197/mês • Renovação em 30 dias</p>
            </div>
          </div>
          <div className="p-4 bg-green-50 rounded-lg mb-4">
            <p className="text-sm text-green-700">
              <Check className="w-4 h-4 inline mr-1" />
              Você tem acesso a todas as funcionalidades premium
            </p>
          </div>
          <button className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">
            Fazer Upgrade
          </button>
        </div>
      )}

      {/* Tab: Integrações */}
      {activeTab === 'integracoes' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-6 border border-slate-200">
            <h3 className="font-medium text-slate-900 mb-4">Portais de Licitação</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center text-xs font-bold text-blue-600">PN</div>
                  <span className="text-sm font-medium">PNCP - Portal Nacional</span>
                </div>
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Conectado</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-orange-100 rounded flex items-center justify-center text-xs font-bold text-orange-600">BL</div>
                  <span className="text-sm font-medium">BLL - Licitações</span>
                </div>
                <button className="px-3 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded">Conectar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Notificações */}
      {activeTab === 'notificacoes' && (
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <h3 className="font-medium text-slate-900 mb-4">Preferências de Notificação</h3>
          <div className="space-y-4">
            {[
              { label: 'Novos editais encontrados', desc: 'Receba alertas quando encontrar editais que matching seus critérios' },
              { label: 'Editais próximos do encerramento', desc: 'Lembrete 3 dias antes do prazo de entrega' },
              { label: 'Resultado de propostas', desc: 'Notificação quando sair o resultado' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-slate-900">{item.label}</p>
                  <p className="text-xs text-slate-500">{item.desc}</p>
                </div>
                <input type="checkbox" defaultChecked className="w-5 h-5 text-blue-600 rounded" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de Adicionar/Editar Empresa */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingId ? 'Editar Empresa' : 'Adicionar Empresa'}
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">CNPJ *</label>
                <input
                  type="text"
                  value={formData.cnpj}
                  onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                  placeholder="00.000.000/0001-00"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Razão Social *</label>
                <input
                  type="text"
                  value={formData.razao_social}
                  onChange={(e) => setFormData({ ...formData, razao_social: e.target.value })}
                  placeholder="Nome empresarial completo"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome Fantasia</label>
                <input
                  type="text"
                  value={formData.nome_fantasia}
                  onChange={(e) => setFormData({ ...formData, nome_fantasia: e.target.value })}
                  placeholder="Nome fantasia (opcional)"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">IE</label>
                  <input
                    type="text"
                    value={formData.inscricao_estadual}
                    onChange={(e) => setFormData({ ...formData, inscricao_estadual: e.target.value })}
                    placeholder="Inscrição Estadual"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Porte</label>
                  <select
                    value={formData.porte}
                    onChange={(e) => setFormData({ ...formData, porte: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="ME-EPP">ME/EPP</option>
                    <option value=" Pequena">Pequena</option>
                    <option value="Média">Média</option>
                    <option value="Grande">Grande</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Endereço</label>
                <input
                  type="text"
                  value={formData.endereco}
                  onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                  placeholder="Endereço completo"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cidade</label>
                  <input
                    type="text"
                    value={formData.cidade}
                    onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                    placeholder="Cidade"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">UF</label>
                  <input
                    type="text"
                    value={formData.UF}
                    onChange={(e) => setFormData({ ...formData, UF: e.target.value.toUpperCase() })}
                    placeholder="SP"
                    maxLength={2}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">CEP</label>
                  <input
                    type="text"
                    value={formData.CEP}
                    onChange={(e) => setFormData({ ...formData, CEP: e.target.value })}
                    placeholder="00000-000"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Telefone</label>
                  <input
                    type="text"
                    value={formData.telefone}
                    onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                    placeholder="(00) 00000-0000"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@empresa.com"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingId(null);
                }}
                className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveCompany}
                disabled={saving || !formData.cnpj || !formData.razao_social}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Salvar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Configuracoes;