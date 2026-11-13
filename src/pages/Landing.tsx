import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Check,
  Star,
  Shield,
  Users,
  TrendingUp,
  Database,
  Bell,
  FileText,
  ChevronRight,
  ArrowRight,
  CreditCard,
  Sparkles,
  Building2,
  Target,
  Award,
  Zap,
  Heart,
  MessageCircle,
  Rocket,
  ThumbsUp,
  Clock,
  Globe,
  Send,
  User,
  Mail,
  Phone,
  Building,
} from 'lucide-react';
import { PLANS, stripeService } from '../services/stripeService';
import { supabase } from '../lib/supabase';
import { resendService } from '../services/resendService';

// Animated counter component
function AnimatedCounter({ end, duration = 2000 }: { end: string; duration?: number }) {
  const [count, setCount] = useState('0');
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isVisible) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;

    const numericEnd = parseInt(end.replace(/[^0-9]/g, ''));
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(numericEnd * easeOut);

      setCount(current.toString());

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setCount(numericEnd.toString());
      }
    };

    requestAnimationFrame(animate);
  }, [isVisible, end, duration]);

  return (
    <div ref={ref} className="text-4xl md:text-5xl font-bold text-white">
      {count}
    </div>
  );
}

// Floating animation component
function FloatingElement({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <div
      className="animate-float"
      style={{
        animationDelay: `${delay}s`,
        animationDuration: '3s',
        animationIterationCount: 'infinite',
      }}
    >
      {children}
    </div>
  );
}

export function Landing() {
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState<string>('business');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  
  // Estado do formulário de demonstração
  const [demoForm, setDemoForm] = useState({
    name: '',
    email: '',
    whatsapp: '',
    company: '',
    cargo: '',
    cnpj: '',
    segmento: '',
    licitacoesPorMes: '',
    etapas: [] as string[],
    controleAtual: '',
    desafio: '',
    website: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const handleDemoFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checkbox = e.target as HTMLInputElement;
      if (checkbox.checked) {
        setDemoForm({ ...demoForm, etapas: [...demoForm.etapas, value] });
      } else {
        setDemoForm({ ...demoForm, etapas: demoForm.etapas.filter(item => item !== value) });
      }
    } else {
      setDemoForm({ ...demoForm, [name]: value });
    }
  };

  const handleDemoFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError('');

    try {
      // Criar mensagem completa com todos os dados
      const mensagemCompleta = `
Cargo: ${demoForm.cargo}
Segmento: ${demoForm.segmento}
Licitações por mês: ${demoForm.licitacoesPorMes}
Etapas que quer controlar: ${demoForm.etapas.join(', ')}
Como controla hoje: ${demoForm.controleAtual}
Desafio: ${demoForm.desafio}
Website: ${demoForm.website}
      `.trim();

      // Salvar no Supabase
      let savedToSupabase = false;
      try {
        const { error: dbError } = await supabase
          .from('leads')
          .insert({
            name: demoForm.name,
            email: demoForm.email,
            phone: demoForm.whatsapp,
            company: demoForm.company,
            cnpj: demoForm.cnpj,
            message: mensagemCompleta,
            plan_interest: 'Demo Request',
            source: 'landing_page_demo',
            status: 'new',
          });

        if (!dbError) {
          savedToSupabase = true;
        }
      } catch (supabaseError) {
        console.error('Supabase error:', supabaseError);
      }

      // Se não salvou no Supabase, salvar localmente
      if (!savedToSupabase) {
        const localLeads = JSON.parse(localStorage.getItem('licitaflow_local_leads') || '[]');
        localLeads.push({
          id: 'local_' + Date.now(),
          name: demoForm.name,
          email: demoForm.email,
          phone: demoForm.whatsapp,
          company: demoForm.company,
          cnpj: demoForm.cnpj,
          message: mensagemCompleta,
          plan_interest: 'Demo Request',
          source: 'landing_page_demo',
          status: 'new',
          created_at: new Date().toISOString(),
        });
        localStorage.setItem('licitaflow_local_leads', JSON.stringify(localLeads));
      }

      // Enviar email de notificação (tentar via Resend, se falhar, mostrar dados)
      try {
        await resendService.sendNewLeadNotification({
          name: demoForm.name,
          email: demoForm.email,
          phone: demoForm.whatsapp,
          company: demoForm.company,
          cnpj: demoForm.cnpj,
          message: mensagemCompleta,
        });
      } catch (emailError) {
        console.error('Email error:', emailError);
      }

      setSubmitSuccess(true);
      setDemoForm({ 
        name: '', 
        email: '', 
        whatsapp: '', 
        company: '', 
        cargo: '', 
        cnpj: '', 
        segmento: '', 
        licitacoesPorMes: '', 
        etapas: [], 
        controleAtual: '', 
        desafio: '', 
        website: '' 
      });
      
      // Redirecionar para dashboard após 2 segundos
      setTimeout(() => {
        handleDemoAccess();
      }, 2000);
    } catch (error) {
      console.error('Erro ao enviar formulário:', error);
      setSubmitError('Erro ao enviar formulário. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectPlan = async (planId: string) => {
    setSelectedPlan(planId);
    setIsProcessing(true);

    try {
      await stripeService.redirectToPaymentLink(planId);
    } catch (error) {
      console.error('Erro no checkout:', error);
      setIsProcessing(false);
    }
  };

  const handleDemoAccess = () => {
    localStorage.setItem('licitaflow_token', 'demo_token_' + Date.now());
    localStorage.setItem('selected_plan', 'business');
    localStorage.setItem('plan_activated', 'true');
    navigate('/dashboard');
  };

  const features = [
    {
      icon: FileText,
      title: 'Gestão de Editais',
      description: 'Acompanhe todos os editais do PNCP em tempo real com alertas personalizados',
      color: 'blue',
    },
    {
      icon: TrendingUp,
      title: 'Funil de Vendas',
      description: 'Gerencie o pipeline completo da proposta até a contratação',
      color: 'emerald',
    },
    {
      icon: Database,
      title: 'Multi-empresa',
      description: 'Gerencie até 50 empresas em uma única plataforma',
      color: 'violet',
    },
    {
      icon: Bell,
      title: 'Alertas Inteligentes',
      description: 'Receba notificações sobre editais que interessam ao seu negócio',
      color: 'amber',
    },
    {
      icon: Shield,
      title: 'Segurança Total',
      description: 'Seus dados protegidos com criptografia de ponta',
      color: 'rose',
    },
    {
      icon: Users,
      title: 'Times Colaborativos',
      description: 'Trabalhe em equipe com permissões granulares',
      color: 'cyan',
    },
  ];

  const testimonials = [
    {
      name: 'Maria Silva',
      role: 'Diretora Comercial',
      company: 'TechSolutions Ltda',
      text: 'O LicitaFlow revolucionou nossa forma de participar de licitações. Economizamos 60% do tempo na busca de editais.',
      avatar: 'MS',
    },
    {
      name: 'João Santos',
      role: 'Gerente de Contratos',
      company: 'Construtora Omega',
      text: 'Finalmente uma ferramenta completa que realmente entende as necessidades do mercado público brasileiro.',
      avatar: 'JS',
    },
    {
      name: 'Ana Costa',
      role: 'CEO',
      company: 'Innovatech',
      text: 'Conseguimos aumentar em 300% nossa participação em licitações desde que começamos a usar o LicitaFlow.',
      avatar: 'AC',
    },
  ];

  const benefits = [
    { icon: Clock, text: 'Economize 20+ horas por semana' },
    { icon: Target, text: 'Encontre editais em segundos' },
    { icon: Award, text: 'Aumente suas chances de vencer' },
    { icon: Heart, text: 'Suporte humanizado 24/7' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 overflow-hidden">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-1/4 w-[600px] h-[600px] bg-blue-500/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 -right-1/4 w-[600px] h-[600px] bg-emerald-500/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-violet-500/10 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Navigation */}
      <nav className="relative z-50 border-b border-white/10 backdrop-blur-md bg-slate-900/50 sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="text-xl font-bold text-white">LicitaFlow</span>
            </div>
            <div className="flex items-center gap-4">
              <Link to="/login" className="text-sm text-blue-200 hover:text-white transition-all duration-300 hover:scale-105">
                Entrar
              </Link>
              <button
                onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-sm font-medium rounded-lg transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/30 hover:scale-105"
              >
                Começar agora
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section ref={heroRef} className="relative pt-20 pb-32 overflow-hidden">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={`text-center max-w-4xl mx-auto transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            <FloatingElement delay={0}>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 rounded-full mb-8 hover:scale-105 transition-transform">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-emerald-300 font-medium">Nova versão 2.0 disponível</span>
              </div>
            </FloatingElement>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
              Gestão completa de{' '}
              <span className="relative">
                <span className="bg-gradient-to-r from-blue-400 via-emerald-400 to-blue-400 bg-clip-text text-transparent bg-[length:200%_100%] animate-gradient">
                  licitações públicas
                </span>
              </span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-slate-300 leading-relaxed max-w-2xl mx-auto">
              A plataforma que transforma a forma como sua empresa conquista contratos públicos.
              Acompanhe editais, gerencie propostas e feche negócios com eficiência.
            </p>

            {/* Benefits badges */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              {benefits.map((benefit, index) => (
                <FloatingElement key={index} delay={index * 0.2}>
                  <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all hover:scale-105">
                    <benefit.icon className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm text-slate-300">{benefit.text}</span>
                  </div>
                </FloatingElement>
              ))}
            </div>

            {/* CTA Buttons */}
            <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
                className="group w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all duration-300 hover:scale-105 flex items-center justify-center gap-2"
              >
                <Rocket className="w-5 h-5 group-hover:animate-bounce" />
                Começar teste gratis
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={handleDemoAccess}
                className="group w-full sm:w-auto px-8 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-medium rounded-xl transition-all duration-300 hover:scale-105 flex items-center justify-center gap-2"
              >
                <Zap className="w-5 h-5 text-amber-400" />
                Ver demonstracao
              </button>
            </div>

            {/* Trust badges */}
            <div className="mt-12 flex items-center justify-center gap-6 text-sm text-slate-400">
              <div className="flex items-center gap-2 hover:text-emerald-400 transition-colors">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>14 dias gratis</span>
              </div>
              <div className="w-1 h-1 bg-slate-600 rounded-full" />
              <div className="flex items-center gap-2 hover:text-emerald-400 transition-colors">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                <span>Sem cartao de credito</span>
              </div>
              <div className="w-1 h-1 bg-slate-600 rounded-full" />
              <div className="flex items-center gap-2 hover:text-emerald-400 transition-colors">
                <ThumbsUp className="w-4 h-4 text-emerald-400" />
                <span>Cancele quando quiser</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-slate-900/50 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              O que nossos clientes dizem
            </h2>
            <p className="text-lg text-slate-400">
              Empresas que ja transformaram seus resultados com o LicitaFlow
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <div
                key={index}
                className="p-6 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 hover:border-emerald-500/30 transition-all duration-300 hover:scale-105 group"
              >
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-slate-300 mb-6 italic">"{testimonial.text}"</p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-full flex items-center justify-center text-white font-bold">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{testimonial.name}</div>
                    <div className="text-sm text-slate-400">{testimonial.role}</div>
                    <div className="text-sm text-emerald-400">{testimonial.company}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Tudo que voce precisa para vencer licitacoes
            </h2>
            <p className="mt-4 text-lg text-slate-400">
              Funcionalidades completas para gerenciar todo o processo de licitacao
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="group p-6 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 hover:border-blue-500/30 transition-all duration-500 hover:scale-105 hover:shadow-xl hover:shadow-blue-500/10"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className={`w-14 h-14 bg-${feature.color}-500/20 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-all duration-300 group-hover:rotate-3`}>
                  <feature.icon className={`w-7 h-7 text-${feature.color}-400`} />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-blue-400 transition-colors">
                  {feature.title}
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Request Section */}
      <section id="demonstracao" className="py-20 bg-slate-900/50 border-t border-white/5">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-emerald-400 text-sm font-medium mb-2">SOLICITAR ACESSO ANTECIPADO</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Solicite acesso antecipado ao <span className="text-blue-400">LicitaFlow</span>
            </h2>
            <p className="text-lg text-slate-400">
              Preencha as informações abaixo para entendermos sua operação e indicarmos o melhor caminho.
            </p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8">
            {submitSuccess ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  Solicitação enviada com sucesso!
                </h3>
                <p className="text-slate-400">
                  Você será redirecionado para o dashboard em instantes...
                </p>
              </div>
            ) : (
              <form onSubmit={handleDemoFormSubmit} className="space-y-6">
                {/* Linha 1: Nome e Email */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Nome</label>
                    <input
                      type="text"
                      name="name"
                      required
                      value={demoForm.name}
                      onChange={handleDemoFormChange}
                      className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">E-mail corporativo</label>
                    <input
                      type="email"
                      name="email"
                      required
                      value={demoForm.email}
                      onChange={handleDemoFormChange}
                      className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Linha 2: WhatsApp e Empresa */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">WhatsApp</label>
                    <input
                      type="tel"
                      name="whatsapp"
                      value={demoForm.whatsapp}
                      onChange={handleDemoFormChange}
                      className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Empresa</label>
                    <input
                      type="text"
                      name="company"
                      value={demoForm.company}
                      onChange={handleDemoFormChange}
                      className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Linha 3: Cargo e CNPJ */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Cargo</label>
                    <input
                      type="text"
                      name="cargo"
                      value={demoForm.cargo}
                      onChange={handleDemoFormChange}
                      className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">CNPJ da empresa</label>
                    <input
                      type="text"
                      name="cnpj"
                      value={demoForm.cnpj}
                      onChange={handleDemoFormChange}
                      className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Linha 4: Segmento e Licitações por mês */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Segmento de atuação</label>
                    <input
                      type="text"
                      name="segmento"
                      value={demoForm.segmento}
                      onChange={handleDemoFormChange}
                      className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Licitações acompanhadas por mês</label>
                    <select
                      name="licitacoesPorMes"
                      value={demoForm.licitacoesPorMes}
                      onChange={handleDemoFormChange}
                      className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                    >
                      <option value="">Selecione...</option>
                      <option value="1-5">1 a 5</option>
                      <option value="6-15">6 a 15</option>
                      <option value="16-30">16 a 30</option>
                      <option value="31-50">31 a 50</option>
                      <option value="50+">Mais de 50</option>
                    </select>
                  </div>
                </div>

                {/* Etapas que quer controlar */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-3">
                    Quais etapas sua empresa quer controlar melhor?
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      'Busca de oportunidades',
                      'Análise de editais',
                      'Cadastro e acompanhamento de processos',
                      'Propostas',
                      'Documentos e amostras',
                      'Gestão de contratos',
                      'Controle de pedidos',
                      'Faturamento',
                      'Relatórios gerenciais',
                      'Análise de Concorrência'
                    ].map((etapa) => (
                      <label key={etapa} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          name="etapas"
                          value={etapa}
                          checked={demoForm.etapas.includes(etapa)}
                          onChange={handleDemoFormChange}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-900/50 text-blue-500 focus:ring-blue-500"
                        />
                        <span className="text-xs">{etapa}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Como controla hoje */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-3">
                    Como você controlam licitações hoje?
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {['Planilhas', 'Sistema interno', 'ERP', 'E-mails e pastas', 'Controle manual', 'Outro'].map((opcao) => (
                      <label key={opcao} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                        <input
                          type="radio"
                          name="controleAtual"
                          value={opcao}
                          checked={demoForm.controleAtual === opcao}
                          onChange={handleDemoFormChange}
                          className="w-4 h-4 border-slate-600 bg-slate-900/50 text-blue-500 focus:ring-blue-500"
                        />
                        <span className="text-xs">{opcao}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Desafio */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Conta rapidamente o principal desafio da sua operação hoje
                  </label>
                  <textarea
                    name="desafio"
                    rows={3}
                    value={demoForm.desafio}
                    onChange={handleDemoFormChange}
                    className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>

                {/* Website */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Link do site da empresa (opcional)
                  </label>
                  <input
                    type="url"
                    name="website"
                    value={demoForm.website}
                    onChange={handleDemoFormChange}
                    placeholder="https://"
                    className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {submitError && (
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                    {submitError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-auto px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Enviar solicitação
                    </>
                  )}
                </button>

                <p className="text-xs text-slate-500">
                  Ao enviar, você concorda em ser contactado pela equipe LicitaFlow
                </p>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Escolha seu plano
            </h2>
            <p className="mt-4 text-lg text-slate-400">
              Comece agora e escale conforme seu negocio cresce
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {PLANS.map((plan, index) => (
              <div
                key={plan.id}
                className={`relative p-8 bg-white/5 border rounded-3xl transition-all duration-500 hover:scale-105 ${
                  plan.popular
                    ? 'border-emerald-500/50 bg-gradient-to-b from-emerald-500/10 to-transparent ring-2 ring-emerald-500/30'
                    : 'border-white/10 hover:border-blue-500/30'
                } ${selectedPlan === plan.id ? 'ring-2 ring-blue-500 scale-105' : ''}`}
                onClick={() => handleSelectPlan(plan.id)}
                style={{ animationDelay: `${index * 0.15}s` }}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-sm font-bold rounded-full shadow-lg shadow-emerald-500/30 flex items-center gap-2">
                      <Star className="w-4 h-4" />
                      Mais popular
                    </span>
                  </div>
                )}

                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-5xl font-bold text-white">R$ {plan.price}</span>
                    <span className="text-slate-400">/mes</span>
                  </div>
                </div>

                <ul className="space-y-4 mb-8">
                  <li className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-emerald-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                      <Check className="w-4 h-4 text-emerald-400" />
                    </div>
                    <span className="text-slate-300">ate {plan.maxCompanies} empresas</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-emerald-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                      <Check className="w-4 h-4 text-emerald-400" />
                    </div>
                    <span className="text-slate-300">ate {plan.maxUsers} usuarios</span>
                  </li>
                  {plan.features.slice(0, 4).map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-emerald-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                        <Check className="w-4 h-4 text-emerald-400" />
                      </div>
                      <span className="text-slate-300 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectPlan(plan.id);
                  }}
                  className={`w-full py-4 rounded-xl font-bold transition-all duration-300 flex items-center justify-center gap-2 ${
                    plan.popular
                      ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50'
                      : 'bg-white/10 hover:bg-white/20 text-white border border-white/20 hover:border-white/30'
                  }`}
                >
                  <CreditCard className="w-5 h-5" />
                  Assinar agora
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-sm text-slate-400 flex items-center justify-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              Pagamento 100% seguro processado pelo Stripe
            </p>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center group">
              <AnimatedCounter end="500+" />
              <div className="text-sm text-slate-400 mt-2 group-hover:text-emerald-400 transition-colors">Empresas ativas</div>
            </div>
            <div className="text-center group">
              <div className="text-4xl md:text-5xl font-bold text-white">R$ 50M+</div>
              <div className="text-sm text-slate-400 mt-2 group-hover:text-emerald-400 transition-colors">Em contratos</div>
            </div>
            <div className="text-center group">
              <AnimatedCounter end="98%" />
              <div className="text-sm text-slate-400 mt-2 group-hover:text-emerald-400 transition-colors">Satisfacao</div>
            </div>
            <div className="text-center group">
              <div className="text-4xl md:text-5xl font-bold text-white">24/7</div>
              <div className="text-sm text-slate-400 mt-2 group-hover:text-emerald-400 transition-colors">Suporte</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="p-12 bg-gradient-to-r from-blue-500/20 to-emerald-500/20 border border-blue-500/30 rounded-3xl">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Pronto para vencer mais licitacoes?
            </h2>
            <p className="text-lg text-slate-300 mb-8">
              Junte-se a centenas de empresas que ja estao usando o LicitaFlow para crescer no mercado de compras publicas.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
                className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-bold rounded-xl shadow-lg transition-all duration-300 hover:scale-105 flex items-center justify-center gap-2"
              >
                <Rocket className="w-5 h-5" />
                Comecar agora
              </button>
              <Link
                to="/login"
                className="w-full sm:w-auto px-8 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-medium rounded-xl transition-all duration-300 hover:scale-105 flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-5 h-5" />
                Fale conosco
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-white/10 bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="text-xl font-bold text-white">LicitaFlow</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-400">
              <a href="#" className="hover:text-white transition-colors">Termos de Uso</a>
              <a href="#" className="hover:text-white transition-colors">Privacidade</a>
              <a href="#" className="hover:text-white transition-colors">Contato</a>
            </div>
            <p className="text-sm text-slate-500">
              2024 LicitaFlow. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>

      {/* Loading overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white font-medium">Redirecionando para pagamento...</p>
          </div>
        </div>
      )}

      {/* CSS for animations */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient {
          animation: gradient 3s ease infinite;
        }
      `}</style>
    </div>
  );
}

export default Landing;