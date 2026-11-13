/**
 * Stripe Service - Integração com Stripe para pagamentos
 * Usa Stripe Checkout para assinaturas mensais
 */

import { loadStripe } from '@stripe/stripe-js';
import type { Stripe } from '@stripe/stripe-js';

// Carregar chave pública do Stripe
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';

// Planos disponíveis com preços em centavos (Stripe usa centavos)
export interface Plan {
  id: string;
  name: string;
  nameBr: string;
  price: number; // Preço em reais
  priceId: string; // Stripe Price ID
  paymentLink: string; // Stripe Payment Link URL
  maxCompanies: number;
  maxUsers: number;
  features: string[];
  popular?: boolean;
  color: string;
  bgGradient: string;
}

export interface Subscription {
  id: string;
  customerId: string;
  priceId: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete';
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  planId: string;
  currentPlan: Plan | null;
}

// Planos do LicitaFlow
export const PLANS: Plan[] = [
  {
    id: 'basic',
    name: 'Básico',
    nameBr: 'Plano Básico',
    price: 97,
    priceId: 'prod_UTwom9490Dwkmb',
    paymentLink: 'https://buy.stripe.com/cNifZhfqI9jK7UE4qg2oE01',
    maxCompanies: 3,
    maxUsers: 3,
    features: [
      'Até 3 empresas',
      ' Até 3 usuários',
      'Busca de editais PNCP',
      'Alertas de novos editais',
      'Gestão de contratos',
      'Relatórios básicos',
    ],
    color: 'blue',
    bgGradient: 'from-blue-500 to-blue-600',
  },
  {
    id: 'business',
    name: 'Business',
    nameBr: 'Plano Business',
    price: 197,
    priceId: 'prod_UTwpF8eKMbDqR5',
    paymentLink: 'https://buy.stripe.com/cNicN53I0eE4caU4qg2oE02',
    maxCompanies: 10,
    maxUsers: 10,
    features: [
      'Até 10 empresas',
      'Até 10 usuários',
      'Busca de editais PNCP + BLL',
      'Alertas personalizados',
      'Gestão completa de contratos',
      'Ordens de serviço',
      'Relatórios avançados',
      'Suporte prioritário',
      'Integrações avançadas',
    ],
    popular: true,
    color: 'emerald',
    bgGradient: 'from-emerald-500 to-emerald-600',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    nameBr: 'Plano Enterprise',
    price: 497,
    priceId: 'prod_UTwqGLzYp587Oo',
    paymentLink: 'https://buy.stripe.com/5kQ9ATguManOgra5uk2oE03',
    maxCompanies: 50,
    maxUsers: 50,
    features: [
      'Até 50 empresas',
      'Até 50 usuários',
      'Todos os portais de licitações',
      'API de integração',
      'Gestão completa de contratos',
      'Ordens de serviço avançadas',
      'Relatórios personalizados',
      'Suporte dedicado',
      'White label disponível',
      'Treinamento exclusivo',
    ],
    color: 'violet',
    bgGradient: 'from-violet-500 to-violet-600',
  },
];

class StripeService {
  private stripe: Stripe | null = null;
  private _isInitialized = false;

  /**
   * Inicializar Stripe.js
   */
  async initialize(): Promise<boolean> {
    if (this._isInitialized) return true;

    if (!STRIPE_PUBLISHABLE_KEY) {
      console.warn('⚠️ Stripe public key não configurada');
      return false;
    }

    try {
      this.stripe = await loadStripe(STRIPE_PUBLISHABLE_KEY);
      this._isInitialized = !!this.stripe;
      return this._isInitialized;
    } catch (error) {
      console.error('❌ Erro ao inicializar Stripe:', error);
      return false;
    }
  }

  /**
   * Verificar se está inicializado
   */
  isReady(): boolean {
    return this._isInitialized && !!this.stripe;
  }

  /**
   * Criar sessão de checkout e redirecionar
   * IMPORTANTE: Requer backend para criar a sessão
   * Por enquanto, redireciona para Stripe Checkout
   */
  async createCheckoutSession(planId: string): Promise<boolean> {
    const plan = PLANS.find(p => p.id === planId);
    if (!plan) {
      console.error('Plano não encontrado:', planId);
      return false;
    }

    // URL base da aplicação
    const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
    const successUrl = `${appUrl}/checkout/success?plan=${planId}`;
    const cancelUrl = `${appUrl}/checkout/cancel?plan=${planId}`;

    // Se tiver backend configurado, usar API
    // Por enquanto, usar Stripe Checkout via Payment Links ou redirect
    try {
      // Verificar se temos um Stripe Price ID configurado
      if (plan.priceId && plan.priceId.startsWith('price_')) {
        // Em produção, criar sessão via backend:
        // const response = await fetch('/api/create-checkout-session', {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({ priceId: plan.priceId, successUrl, cancelUrl }),
        // });
        // const { sessionId } = await response.json();
        // await this.stripe?.redirectToCheckout({ sessionId });

        // Por enquanto, redirecionar para Stripe Checkout
        // Você pode criar Payment Links no Stripe Dashboard e usar aqui
        // Exemplo: window.location.href = 'https://buy.stripe.com/...';

        // Alternativa: Usar Checkout do Stripe via API (requer backend)
        console.log('📋 Checkout para plano:', plan.name, plan.price);
        console.log('📌 URLs:', { successUrl, cancelUrl });

        // Salvar plano selecionado no localStorage
        localStorage.setItem('selected_plan', planId);
        localStorage.setItem('checkout_success_url', successUrl);
        localStorage.setItem('checkout_cancel_url', cancelUrl);

        return true;
      } else {
        // Planos de demonstração (sem preço real)
        console.log('📋 Plano demo:', plan.name);
        localStorage.setItem('selected_plan', planId);
        localStorage.setItem('plan_activated', 'true');
        return true;
      }
    } catch (error) {
      console.error('❌ Erro ao criar checkout:', error);
      return false;
    }
  }

  /**
   * Redirecionar para Stripe Payment Link
   */
  async redirectToPaymentLink(planId: string): Promise<boolean> {
    const plan = PLANS.find(p => p.id === planId);
    if (!plan || !plan.paymentLink) {
      console.error('Plano ou Payment Link não encontrado:', planId);
      return false;
    }

    // Salvar plano selecionado antes de redirecionar
    localStorage.setItem('pending_plan', planId);

    // Redirecionar para o Stripe Payment Link
    window.location.href = plan.paymentLink;
    return true;
  }

  /**
   * Verificar se Payment Link foi completado (chamado na página de sucesso)
   */
  async checkPaymentStatus(): Promise<{ success: boolean; planId: string | null }> {
    const pendingPlan = localStorage.getItem('pending_plan');
    const urlParams = new URLSearchParams(window.location.search);
    const paymentSuccess = urlParams.get('payment') === 'success';
    const sessionId = urlParams.get('session_id');

    if (paymentSuccess && pendingPlan) {
      // Ativar assinatura
      localStorage.setItem('selected_plan', pendingPlan);
      localStorage.setItem('plan_activated', 'true');
      localStorage.setItem('subscription_date', new Date().toISOString());
      localStorage.removeItem('pending_plan');

      return { success: true, planId: pendingPlan };
    }

    // Verificar se há sessão do Stripe
    if (sessionId) {
      // Em produção, verificar status da sessão via API
      // Por enquanto, marcar como ativo
      localStorage.setItem('plan_activated', 'true');
      return { success: true, planId: localStorage.getItem('selected_plan') };
    }

    return { success: false, planId: null };
  }

  /**
   * Criar sessão de checkout via API do backend
   */
  async createCheckoutSessionAPI(planId: string): Promise<{ sessionId?: string; url?: string }> {
    const plan = PLANS.find(p => p.id === planId);
    if (!plan) {
      throw new Error('Plano não encontrado');
    }

    const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;

    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: plan.priceId,
          planId: plan.id,
          successUrl: `${appUrl}/checkout/success`,
          cancelUrl: `${appUrl}/checkout/cancel`,
        }),
      });

      if (!response.ok) {
        throw new Error('Erro ao criar sessão');
      }

      return await response.json();
    } catch (error) {
      console.error('Erro ao criar sessão de checkout:', error);
      throw error;
    }
  }

  /**
   * Verificar status da assinatura
   */
  async getSubscriptionStatus(): Promise<Subscription | null> {
    // Em produção, buscar do backend
    const storedPlan = localStorage.getItem('selected_plan');
    const planActivated = localStorage.getItem('plan_activated');

    if (!planActivated) {
      return null;
    }

    const currentPlan = PLANS.find(p => p.id === storedPlan) || null;

    return {
      id: 'sub_demo_' + Date.now(),
      customerId: 'cus_demo',
      priceId: storedPlan || '',
      status: 'active',
      currentPeriodStart: Date.now(),
      currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
      cancelAtPeriodEnd: false,
      planId: storedPlan || 'basic',
      currentPlan,
    };
  }

  /**
   * Verificar se tem acesso ao recurso baseado no plano
   */
  hasAccess(planId: string, requiredPlan: string[]): boolean {
    const planOrder = ['basic', 'business', 'enterprise'];
    const userPlanIndex = planOrder.indexOf(planId);
    const requiredIndex = requiredPlan.reduce((max, plan) =>
      Math.max(max, planOrder.indexOf(plan)), 0);

    return userPlanIndex >= requiredIndex;
  }

  /**
   * Obter plano atual do usuário
   */
  getCurrentPlan(): Plan | null {
    const storedPlan = localStorage.getItem('selected_plan');
    if (!storedPlan) return null;
    return PLANS.find(p => p.id === storedPlan) || null;
  }

  /**
   * Obter features disponíveis no plano atual
   */
  getPlanFeatures(planId: string): string[] {
    const plan = PLANS.find(p => p.id === planId);
    return plan?.features || [];
  }

  /**
   * Salvar informação de assinatura
   */
  saveSubscriptionData(data: {
    subscriptionId: string;
    customerId: string;
    priceId: string;
    status: string;
    planId: string;
  }): void {
    localStorage.setItem('stripe_subscription', JSON.stringify(data));
  }

  /**
   * Obter dados de assinatura salvos
   */
  getStoredSubscription(): Subscription | null {
    const data = localStorage.getItem('stripe_subscription');
    if (!data) return null;

    try {
      const parsed = JSON.parse(data);
      const currentPlan = PLANS.find(p => p.id === parsed.planId) || null;
      return {
        ...parsed,
        currentPeriodStart: parsed.currentPeriodStart || Date.now(),
        currentPeriodEnd: parsed.currentPeriodEnd || Date.now() + 30 * 24 * 60 * 60 * 1000,
        cancelAtPeriodEnd: parsed.cancelAtPeriodEnd || false,
        currentPlan,
      };
    } catch {
      return null;
    }
  }
}

export const stripeService = new StripeService();
export default stripeService;
