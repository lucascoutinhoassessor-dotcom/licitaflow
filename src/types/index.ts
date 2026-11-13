// Tipos principais para o sistema multi-tenant de licitações

export interface Tenant {
  id: string;
  name: string;
  cnpj: string;
  logo?: string;
  plan: 'starter' | 'profissional' | 'business' | 'enterprise';
  maxCompanies: number;
  createdAt: string;
  settings: TenantSettings;
}

export interface TenantSettings {
  primaryColor: string;
  notificationEmail: boolean;
  notificationWhatsApp: boolean;
  defaultUFs: string[];
  defaultPortals: string[];
}

export interface Company {
  id: string;
  tenantId: string;
  name: string;
  cnpj: string;
  ie?: string;
  address?: Address;
  contacts: Contact[];
  active: boolean;
  createdAt: string;
}

export interface Address {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
}

export interface User {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'manager' | 'analyst';
  avatar?: string;
  active: boolean;
  lastLogin?: string;
}

export interface Edital {
  id: string;
  companyId: string;
  numeroControlePNCP: string;
  numeroCompra: string;
  objeto: string;
  orgao: string;
  cnpjOrgao: string;
  unidade: string;
  cidade: string;
  uf: string;
  modalidade: Modalidade;
  dataPublicacao: string;
  dataAbertura: string;
  dataEncerramento: string;
  valorEstimado: number | null;
  portal: string;
  status: 'novo' | 'em_analise' | 'interessado' | 'proposta_enviada' | 'contratado' | 'perdido' | 'encerrado';
  etapas: EtapaEdital[];
  observacoes?: string;
  createdAt: string;
  updatedAt: string;
}

export type Modalidade =
  | 'pregao_eletronico'
  | 'pregao_presencial'
  | 'concorrencia'
  | 'tomada_precos'
  | 'convite'
  | 'leilao'
  | 'dispensa_eletronica'
  | 'inexigibilidade'
  | 'dialogo_competitivo';

export interface EtapaEdital {
  id: string;
  nome: string;
  status: 'pendente' | 'em_andamento' | 'concluido';
  dataPrevista?: string;
  dataConclusao?: string;
}

export interface FunilEtapa {
  id: string;
  name: string;
  color: string;
  order: number;
}

export interface Budget {
  id: string;
  companyId: string;
  editalId: string;
  description: string;
  cost: number;
  profitMargin: number;
  finalPrice: number;
  materials: BudgetItem[];
  services: BudgetItem[];
  createdAt: string;
}

export interface BudgetItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  type?: 'material' | 'service';
}

export interface Contract {
  id: string;
  companyId: string;
  editalId: string;
  numeroContrato: string;
  objeto: string;
  orgao: string;
  valor: number;
  dataInicio: string;
  dataFim: string;
  status: 'ativo' | 'encerrado' | 'rescindido';
  parcelas: Parcela[];
}

export interface Parcela {
  id: string;
  numero: number;
  valor: number;
  dataVencimento: string;
  dataPagamento?: string;
  status: 'pendente' | 'pago' | 'atrasado';
}

export interface Alert {
  id: string;
  tenantId: string;
  companyId?: string;
  type: 'vencimento' | 'nova_publicacao' | 'certidao_vencendo' | 'parcela_atrasada';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  createdAt: string;
}

// Payload para criação de empresa
export interface CreateCompanyPayload {
  name: string;
  cnpj: string;
  ie?: string;
  address?: Address;
  contacts: Omit<Contact, 'id'>[];
}

// Payload para atualização de empresa
export interface UpdateCompanyPayload extends Partial<CreateCompanyPayload> {
  active?: boolean;
}

// Dados para login
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}