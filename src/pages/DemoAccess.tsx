import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  CheckCircle, ArrowRight, Building2, Users, FileText, 
  TrendingUp, Shield, Sparkles, Loader2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export function DemoAccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');
  const [leadData, setLeadData] = useState<any>(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    password: '',
    confirmPassword: '',
  });
  const [registering, setRegistering] = useState(false);

  const token = searchParams.get('token');
  const leadId = searchParams.get('lead');

  useEffect(() => {
    validateAccess();
  }, []);

  const validateAccess = async () => {
    if (!token || !leadId) {
      setError('Link de acesso inválido');
      setLoading(false);
      return;
    }

    try {
      // Verificar se o lead existe e está aprovado
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .eq('status', 'approved')
        .single();

      if (leadError || !lead) {
        setError('Link de acesso inválido ou expirado');
        setLoading(false);
        return;
      }

      // Verificar se o link não expirou
      if (lead.access_link_expires && new Date(lead.access_link_expires) < new Date()) {
        setError('Este link de acesso expirou. Solicite um novo convite.');
        setLoading(false);
        return;
      }

      setLeadData(lead);
      setLoading(false);
    } catch (error) {
      console.error('Error validating access:', error);
      setError('Erro ao validar acesso');
      setLoading(false);
    }
  };

  const handleStartDemo = async () => {
    setValidating(true);
    
    // Login automático como usuário demo
    try {
      await login({ 
        email: `demo-${leadId}@licitaflow.temp`, 
        password: 'demo-access-temp' 
      });
      navigate('/dashboard');
    } catch (error) {
      // Se falhar, criar sessão demo local
      localStorage.setItem('licitaflow_demo_access', 'true');
      localStorage.setItem('licitaflow_demo_lead_id', leadId || '');
      navigate('/dashboard');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (registerForm.password !== registerForm.confirmPassword) {
      alert('As senhas não coincidem');
      return;
    }

    if (registerForm.password.length < 6) {
      alert('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    setRegistering(true);

    try {
      // Criar usuário no Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: leadData.email,
        password: registerForm.password,
        options: {
          data: {
            full_name: leadData.name,
            company_name: leadData.company,
            lead_id: leadId,
            source: 'early_access',
          },
        },
      });

      if (authError) throw authError;

      // Criar tenant para o cliente
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          name: leadData.company || leadData.name,
          plan: 'business', // Plano de trial
          status: 'active',
          trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 dias de trial
        })
        .select()
        .single();

      if (tenantError) throw tenantError;

      // Criar empresa
      await supabase
        .from('companies')
        .insert({
          tenant_id: tenant.id,
          name: leadData.company || leadData.name,
          cnpj: leadData.cnpj,
          email: leadData.email,
          phone: leadData.phone,
        });

      // Atualizar lead como convertido
      await supabase
        .from('leads')
        .update({ status: 'converted' })
        .eq('id', leadId);

      alert('Cadastro realizado com sucesso! Faça login para acessar sua conta.');
      navigate('/login');
    } catch (error: any) {
      console.error('Error registering:', error);
      alert('Erro ao criar conta: ' + error.message);
    } finally {
      setRegistering(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex items-center gap-3 text-white">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Validando acesso...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Acesso Negado</h2>
          <p className="text-slate-400 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            Voltar para o início
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-white/10 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">LicitaFlow</span>
          </div>
          <div className="text-sm text-slate-400">
            Acesso Antecipado
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Welcome Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-emerald-400 text-sm mb-6">
            <CheckCircle className="w-4 h-4" />
            Acesso Aprovado
          </div>
          
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Bem-vindo, {leadData?.name?.split(' ')[0] || 'Visitante'}!
          </h1>
          
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Você foi selecionado para testar o LicitaFlow antes do lançamento oficial. 
            Explore a plataforma e veja como podemos ajudar sua empresa a ganhar mais licitações.
          </p>
        </div>

        {/* Demo Features */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
          {[
            { icon: Building2, title: 'Gestão Multi-Empresa', desc: 'Gerencie várias empresas em um único lugar' },
            { icon: FileText, title: 'Captação de Editais', desc: 'Integração com PNCP e alertas automáticos' },
            { icon: TrendingUp, title: 'Funil de Vendas', desc: 'Acompanhe todo o processo de prospecção' },
            { icon: Users, title: 'Gestão de Clientes', desc: 'Organize clientes governamentais e privados' },
          ].map((feature) => (
            <div key={feature.title} className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
              <feature.icon className="w-8 h-8 text-blue-400 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-slate-400">{feature.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA Section */}
        <div className="bg-gradient-to-r from-blue-600/20 to-emerald-600/20 border border-blue-500/30 rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Pronto para começar?</h2>
          <p className="text-slate-400 mb-8">
            Acesse a demonstração agora e explore todos os recursos do LicitaFlow.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleStartDemo}
              disabled={validating}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-semibold rounded-xl transition-all hover:scale-105 disabled:opacity-50"
            >
              {validating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Acessando...
                </>
              ) : (
                <>
                  Acessar Demonstração
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
            
            <button
              onClick={() => setShowRegisterModal(true)}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl transition-all border border-white/20"
            >
              Criar Minha Conta
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
          
          <p className="text-sm text-slate-500 mt-4">
            A demonstração é gratuita e sem compromisso
          </p>
        </div>
      </div>

      {/* Register Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl max-w-md w-full p-6 space-y-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold text-white">Criar sua Conta</h3>
              <p className="text-slate-400 text-sm mt-2">
                Complete seu cadastro para ter acesso permanente ao LicitaFlow
              </p>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
                <input
                  type="email"
                  value={leadData?.email}
                  disabled
                  className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-400 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Senha *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={registerForm.password}
                  onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                  className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirmar Senha *</label>
                <input
                  type="password"
                  required
                  value={registerForm.confirmPassword}
                  onChange={(e) => setRegisterForm({ ...registerForm, confirmPassword: e.target.value })}
                  className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  placeholder="Digite a senha novamente"
                />
              </div>

              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <p className="text-sm text-blue-300">
                  <strong>🎁 Benefícios do cadastro:</strong><br/>
                  • 14 dias de trial gratuito<br/>
                  • Dados salvos na nuvem<br/>
                  • Acesso a todos os recursos<br/>
                  • Suporte prioritário
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={registering}
                  className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {registering ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Criando conta...
                    </>
                  ) : (
                    'Criar Conta Gratuita'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-4 py-2.5 border border-slate-600 text-slate-300 font-medium rounded-lg hover:bg-slate-700 transition-colors"
                >
                  Voltar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
