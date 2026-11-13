import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, ArrowRight, Building2, Download, Sparkles } from 'lucide-react';
import { stripeService, PLANS } from '../services/stripeService';

export function CheckoutSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isActivating, setIsActivating] = useState(true);
  const [plan, setPlan] = useState<any>(null);

  useEffect(() => {
    const activatePlan = async () => {
      const planId = searchParams.get('plan') || localStorage.getItem('selected_plan') || 'basic';
      const selectedPlan = PLANS.find(p => p.id === planId);

      if (selectedPlan) {
        setPlan(selectedPlan);

        // Salvar dados da assinatura
        localStorage.setItem('selected_plan', planId);
        localStorage.setItem('plan_activated', 'true');
        localStorage.setItem('subscription_date', new Date().toISOString());

        // Simular ativação
        await new Promise(resolve => setTimeout(resolve, 2000));
        setIsActivating(false);
      }
    };

    activatePlan();
  }, [searchParams]);

  const handleGoToDashboard = () => {
    navigate('/dashboard');
  };

  if (isActivating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-white mb-2">Ativando sua assinatura...</h2>
          <p className="text-slate-400">Preparando tudo para você</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-emerald-400" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Assinatura ativada com sucesso!
          </h1>
          <p className="text-lg text-slate-300">
            Bem-vindo ao LicitaFlow! Sua assinatura do plano {plan?.name} está ativa.
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Detalhes da assinatura</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-3 border-b border-white/10">
              <span className="text-slate-400">Plano</span>
              <span className="text-white font-medium">{plan?.name}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-white/10">
              <span className="text-slate-400">Valor mensal</span>
              <span className="text-white font-medium">R$ {plan?.price}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-white/10">
              <span className="text-slate-400">Empresas</span>
              <span className="text-white font-medium">Até {plan?.maxCompanies}</span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-slate-400">Próximo pagamento</span>
              <span className="text-white font-medium">Em 30 dias</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-blue-500/20 to-emerald-500/20 border border-blue-500/30 rounded-xl p-6 mb-8">
          <div className="flex items-start gap-4">
            <Sparkles className="w-6 h-6 text-blue-400 flex-shrink-0 mt-1" />
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Próximos passos</h3>
              <ul className="space-y-2 text-sm text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  Configure suas empresas na plataforma
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  Adicione contatos e fornecedores
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  Comece a acompanhar editais
                </li>
              </ul>
            </div>
          </div>
        </div>

        <button
          onClick={handleGoToDashboard}
          className="w-full py-4 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
        >
          <Building2 className="w-5 h-5" />
          Acessar plataforma
          <ArrowRight className="w-5 h-5" />
        </button>

        <p className="mt-4 text-center text-sm text-slate-400">
          Um e-mail de confirmação foi enviado para sua caixa de entrada.
        </p>
      </div>
    </div>
  );
}

export function CheckoutCancel() {
  const navigate = useNavigate();

  const handleGoBack = () => {
    navigate('/');
  };

  const handleTryAgain = () => {
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md text-center">
        <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-white mb-4">
          Checkout cancelado
        </h1>
        <p className="text-lg text-slate-300 mb-8">
          O pagamento não foi concluído. Você pode tentar novamente quando estiver pronto.
        </p>

        <div className="space-y-3">
          <button
            onClick={handleTryAgain}
            className="w-full py-4 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
          >
            Tentar novamente
            <ArrowRight className="w-5 h-5" />
          </button>

          <button
            onClick={handleGoBack}
            className="w-full py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-medium rounded-xl transition-all"
          >
            Voltar para página inicial
          </button>
        </div>

        <p className="mt-6 text-sm text-slate-400">
          Precisa de ajuda? Entre em contato com nosso suporte.
        </p>
      </div>
    </div>
  );
}

export default CheckoutSuccess;
