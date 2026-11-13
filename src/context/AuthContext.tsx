import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { User, Tenant, Company, AuthState, LoginCredentials } from '../types';
import { mockUser, mockTenant, mockCompanies } from '../data/mockData';
import { stripeService, PLANS, Plan } from '../services/stripeService';
import { supabase, db } from '../lib/supabase';

// Detect demo mode from environment variable
const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

interface Subscription {
  id: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete' | 'none';
  planId: string;
  currentPlan: Plan | null;
  currentPeriodEnd?: number;
}

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (name: string, email: string, password: string, companyName: string) => Promise<boolean>;
  logout: () => void;
  tenant: Tenant;
  user: User;
  companies: Company[];
  selectedCompany: Company | null;
  setSelectedCompany: (company: Company) => void;
  addCompany: (company: Omit<Company, 'id' | 'tenantId' | 'createdAt' | 'active'>) => Promise<Company>;
  updateCompany: (id: string, updates: Partial<Company>) => Promise<void>;
  deleteCompany: (id: string) => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
  companyCount: number;
  maxCompanies: number;
  // Subscription
  subscription: Subscription | null;
  currentPlan: Plan | null;
  hasActiveSubscription: boolean;
  canAddCompany: boolean;
  checkPlanFeature: (feature: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(IS_DEMO_MODE);
  const [isLoading, setIsLoading] = useState(false);
  const [companies, setCompanies] = useState<Company[]>(IS_DEMO_MODE ? mockCompanies : []);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(IS_DEMO_MODE ? mockCompanies[0] : null);
  const [user, setUser] = useState<User>(IS_DEMO_MODE ? mockUser : {} as User);
  const [tenant, setTenant] = useState<Tenant>(IS_DEMO_MODE ? mockTenant : {} as Tenant);

  // Check for active subscription from localStorage
  const subscription = stripeService.getStoredSubscription();
  const planActivated = localStorage.getItem('plan_activated');
  const selectedPlanId = localStorage.getItem('selected_plan') || 'business';
  const currentPlan = PLANS.find(p => p.id === selectedPlanId) || null;
  const hasActiveSubscription = IS_DEMO_MODE || !!planActivated || !!subscription;
  const maxCompanies = currentPlan?.maxCompanies || 3;
  const canAddCompany = companies.length < maxCompanies;

  // Load user session on mount (production mode)
  useEffect(() => {
    if (!IS_DEMO_MODE) {
      const token = localStorage.getItem('licitaflow_token');
      const storedUser = localStorage.getItem('licitaflow_user');
      if (token && storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
          setIsAuthenticated(true);
          // Load companies from Supabase
          loadCompanies(parsedUser.tenant_id);
        } catch (e) {
          console.error('Error parsing user data:', e);
          logout();
        }
      }
    }
  }, []);

  const loadCompanies = async (tenantId: string) => {
    try {
      const companiesData = await db.getCompanies(tenantId);
      setCompanies(companiesData);
      if (companiesData.length > 0) {
        setSelectedCompany(companiesData[0]);
      }
    } catch (error) {
      console.error('Error loading companies:', error);
    }
  };

  const login = useCallback(async (credentials: LoginCredentials) => {
    setIsLoading(true);
    try {
      // Admin fixo para acesso rápido
      if (credentials.email === 'admin@licitaflow.com.br' && credentials.password === 'admin123') {
        const adminData: User = {
          id: 'admin-fixed-id',
          tenantId: 'admin-tenant',
          name: 'Administrador',
          email: 'admin@licitaflow.com.br',
          role: 'admin',
          active: true,
        };
        localStorage.setItem('licitaflow_token', 'admin_token_' + Date.now());
        localStorage.setItem('licitaflow_user', JSON.stringify(adminData));
        setUser(adminData);
        setIsAuthenticated(true);
        setCompanies(mockCompanies);
        setSelectedCompany(mockCompanies[0]);
        window.location.href = '/admin/leads';
        return;
      }

      if (IS_DEMO_MODE) {
        // Demo mode - simulate login
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (credentials.email && credentials.password && credentials.password.length >= 4) {
          const userData = {
            id: 'demo-user-id',
            email: credentials.email,
            full_name: credentials.email?.split('@')[0] || 'Usuário',
            tenant_id: 'demo-tenant-id',
            role: 'admin',
          };
          localStorage.setItem('licitaflow_token', 'demo_token_' + Date.now());
          localStorage.setItem('licitaflow_user', JSON.stringify(userData));
          setUser(mockUser);
          setIsAuthenticated(true);
          setCompanies(mockCompanies);
          setSelectedCompany(mockCompanies[0]);
          window.location.href = '/dashboard';
        } else {
          throw new Error('Credenciais inválidas');
        }
      } else {
        // Production mode - use Supabase auth
        const { data, error } = await supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        });
        
        if (error) throw error;
        
        if (data.user) {
          const userData: User = {
            id: data.user.id,
            tenantId: data.user.user_metadata?.tenant_id || '',
            name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'Usuário',
            email: data.user.email!,
            role: data.user.user_metadata?.role || 'admin',
            active: true,
          };
          localStorage.setItem('licitaflow_token', data.session?.access_token || '');
          localStorage.setItem('licitaflow_user', JSON.stringify(userData));
          setUser(userData);
          setIsAuthenticated(true);
          await loadCompanies(userData.tenantId);
          window.location.href = '/dashboard';
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (
    name: string,
    email: string,
    password: string,
    companyName: string
  ): Promise<boolean> => {
    setIsLoading(true);
    try {
      if (IS_DEMO_MODE) {
        // Demo mode - simulate registration
        await new Promise(resolve => setTimeout(resolve, 2000));
        const userData = {
          id: 'new_user_' + Date.now(),
          email,
          full_name: name,
          tenant_id: 'new_tenant_' + Date.now(),
          role: 'admin',
        };
        localStorage.setItem('licitaflow_token', 'demo_token_' + Date.now());
        localStorage.setItem('licitaflow_user', JSON.stringify(userData));
        setUser(mockUser);
        setIsAuthenticated(true);

        // For demo, activate the selected plan
        const selectedPlan = localStorage.getItem('selected_plan') || 'business';
        localStorage.setItem('plan_activated', 'true');
        localStorage.setItem('subscription_date', new Date().toISOString());

        // Redirect to checkout success page
        window.location.href = '/checkout/success?plan=' + selectedPlan;
        return true;
      } else {
        // Production mode - use Supabase auth
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
              company_name: companyName,
            },
          },
        });

        if (error) throw error;

        if (data.user) {
          // Create tenant
          const tenant = await db.createTenant({
            name: companyName,
            plan: 'basic',
            status: 'active',
          });

          // Create company
          await db.createCompany({
            tenant_id: tenant.id,
            name: companyName,
            cnpj: '',
            email: email,
          });

          const selectedPlan = localStorage.getItem('selected_plan') || 'business';
          window.location.href = '/checkout/success?plan=' + selectedPlan;
          return true;
        }
        return false;
      }
    } catch (error) {
      console.error('Erro no registro:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    localStorage.removeItem('licitaflow_token');
    localStorage.removeItem('licitaflow_user');
    
    if (!IS_DEMO_MODE) {
      await supabase.auth.signOut();
    }
    
    setIsAuthenticated(false);
    setCompanies([]);
    setSelectedCompany(null);
    window.location.href = '/login';
  }, []);

  const addCompany = useCallback(async (company: Omit<Company, 'id' | 'tenantId' | 'createdAt' | 'active'>) => {
    if (!canAddCompany) {
      throw new Error(`Limite de empresas atingido. Seu plano permite até ${maxCompanies} empresas.`);
    }
    
    if (IS_DEMO_MODE) {
      // Demo mode
      const newCompany: Company = {
        ...company,
        id: `company-${Date.now()}`,
        tenantId: mockTenant.id,
        active: true,
        createdAt: new Date().toISOString()
      };
      setCompanies(prev => [...prev, newCompany]);
      return newCompany;
    } else {
      // Production mode - use Supabase
      const newCompany = await db.createCompany({
        ...company,
        tenant_id: tenant.id,
      });
      setCompanies(prev => [...prev, newCompany as Company]);
      return newCompany as Company;
    }
  }, [canAddCompany, maxCompanies, tenant.id]);

  const updateCompany = useCallback(async (id: string, updates: Partial<Company>) => {
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    if (selectedCompany?.id === id) {
      setSelectedCompany(prev => prev ? { ...prev, ...updates } : null);
    }
  }, [selectedCompany]);

  const deleteCompany = useCallback(async (id: string) => {
    setCompanies(prev => prev.filter(c => c.id !== id));
    if (selectedCompany?.id === id) {
      setSelectedCompany(companies.find(c => c.id !== id) || null);
    }
  }, [selectedCompany, companies]);

  const checkPlanFeature = useCallback((feature: string): boolean => {
    if (!hasActiveSubscription) return false;

    // Features by plan level
    const featuresByPlan: Record<string, string[]> = {
      basic: ['editais', 'contratos', 'alertas'],
      business: ['editais', 'contratos', 'alertas', 'ordens_servico', 'funil'],
      enterprise: ['editais', 'contratos', 'alertas', 'ordens_servico', 'funil', 'api', 'white_label']
    };

    const planFeatures = featuresByPlan[selectedPlanId] || featuresByPlan.basic;
    return planFeatures.includes(feature);
  }, [hasActiveSubscription, selectedPlanId]);

  const value: AuthContextType = {
    user: IS_DEMO_MODE ? mockUser : user,
    tenant: IS_DEMO_MODE ? mockTenant : tenant,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    companies,
    selectedCompany,
    setSelectedCompany,
    addCompany,
    updateCompany,
    deleteCompany,
    companyCount: companies.length,
    maxCompanies,
    subscription,
    currentPlan,
    hasActiveSubscription,
    canAddCompany,
    checkPlanFeature,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useCompanies() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useCompanies must be used within an AuthProvider');
  }

  return {
    companies: context.companies,
    selectedCompany: context.selectedCompany,
    setSelectedCompany: context.setSelectedCompany,
    addCompany: context.addCompany,
    updateCompany: context.updateCompany,
    deleteCompany: context.deleteCompany,
    isLoading: context.isLoading,
    companyCount: context.companyCount,
    maxCompanies: context.maxCompanies,
    canAddCompany: context.canAddCompany,
    currentPlan: context.currentPlan,
  };
}
