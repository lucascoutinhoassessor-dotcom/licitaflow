import { Edital, Company, User, Tenant, Alert, Contract, Budget } from '../types';

// Tenant mock - Empresa licitante
export const mockTenant: Tenant = {
  id: 'tenant-001',
  name: 'Soluções Corporativas Ltda',
  cnpj: '12.345.678/0001-90',
  plan: 'business',
  maxCompanies: 10,
  createdAt: '2023-01-15T10:00:00Z',
  settings: {
    primaryColor: '#2563eb',
    notificationEmail: true,
    notificationWhatsApp: false,
    defaultUFs: ['SP', 'RJ', 'MG'],
    defaultPortals: ['comprasnet', 'compras_pub']
  }
};

// Usuário atual
export const mockUser: User = {
  id: 'user-001',
  tenantId: 'tenant-001',
  name: 'Carlos Eduardo Santos',
  email: 'carlos@solucoescorp.com.br',
  role: 'owner',
  avatar: undefined,
  active: true,
  lastLogin: '2026-05-09T08:30:00Z'
};

// Empresas do tenant
export const mockCompanies: Company[] = [
  {
    id: 'company-001',
    tenantId: 'tenant-001',
    name: 'Soluções Corporativas Ltda - Matriz',
    cnpj: '12.345.678/0001-90',
    ie: '123.456.789.000',
    address: {
      street: 'Av. Brigadeiro Faria Lima',
      number: '3477',
      complement: 'Andar 12',
      neighborhood: 'Itaim Bibi',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '04538-132'
    },
    contacts: [
      { id: 'contact-001', name: 'Carlos Eduardo Santos', email: 'carlos@solucoescorp.com.br', phone: '(11) 99999-0001', role: 'Proprietário' },
      { id: 'contact-002', name: 'Marina Oliveira Silva', email: 'marina@solucoescorp.com.br', phone: '(11) 99999-0002', role: 'Gestora de Licitações' }
    ],
    active: true,
    createdAt: '2023-01-15T10:00:00Z'
  },
  {
    id: 'company-002',
    tenantId: 'tenant-001',
    name: 'Tech Solutions Informatica Ltda',
    cnpj: '98.765.432/0001-10',
    ie: '987.654.321.000',
    address: {
      street: 'Rua das Flores',
      number: '156',
      neighborhood: 'Jardins',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01426-000'
    },
    contacts: [
      { id: 'contact-003', name: 'Roberto Ferreira Lima', email: 'roberto@techsolutions.com.br', phone: '(11) 98888-1234', role: 'Diretor Comercial' }
    ],
    active: true,
    createdAt: '2023-06-20T14:30:00Z'
  },
  {
    id: 'company-003',
    tenantId: 'tenant-001',
    name: 'Distribuidora Mega Star Eireli',
    cnpj: '45.678.123/0001-55',
    ie: '456.789.123.000',
    address: {
      street: 'Av. Marginal',
      number: '2500',
      neighborhood: 'Pq. Industrial',
      city: 'Guarulhos',
      state: 'SP',
      zipCode: '07050-000'
    },
    contacts: [
      { id: 'contact-004', name: 'Patricia Almeida Costa', email: 'patricia@megastar.com.br', phone: '(11) 97777-4567', role: 'Gerente de Operações' }
    ],
    active: true,
    createdAt: '2024-02-10T09:00:00Z'
  }
];

// Modalidades de licitação
const modalidades: Record<string, string> = {
  pregao_eletronico: 'Pregão Eletrônico',
  pregao_presencial: 'Pregão Presencial',
  concurrencia: 'Concorrência',
  tomada_precos: 'Tomada de Preços',
  convite: 'Convite',
  leilao: 'Leilão',
  dispensa_eletronica: 'Dispensa Eletrônica',
  inexigibilidade: 'Inexigibilidade',
  dialogo_competitivo: 'Diálogo Competitivo'
};

const portais = ['Comprasnet', 'Portal de Compras Públicas', 'Licitações-e', 'BLL COMPRAS', 'COMPRAS MG', 'COMPRAS RS'];

const ufs = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

const orgaos = [
  'Prefeitura Municipal de São Paulo',
  'Governo do Estado de Minas Gerais',
  'Hospital das Clínicas de São Paulo',
  'Universidade Federal do Rio de Janeiro',
  'Prefeitura Municipal de Belo Horizonte',
  'Secretaria de Educação do Distrito Federal',
  'Instituto Federal de Educação, Ciência e Tecnologia',
  'Companhia de Saneamento Básico do Estado de São Paulo',
  'Prefeitura Municipal de Curitiba',
  'Governo do Estado do Rio Grande do Sul',
  'Secretaria de Saúde do Estado de São Paulo',
  'Universidade Federal de São Paulo',
  'Caixa Econômica Federal',
  'Banco do Brasil S.A.',
  'Petrobras S.A.'
];

const objetosBase = [
  'Aquisição de material de escritório',
  'Prestação de serviços de limpeza',
  'Locação de veículos automotores',
  'Fornecimento de refeições escolares',
  'Aquisição de equipamentos de informática',
  'Serviços de manutenção predial',
  'Contratação de serviços de TI',
  'Fornecimento de medicamentos',
  'Obras de pavimentação asfáltica',
  'Locação de equipamentos hospitalares',
  'Serviços de vigilância e segurança',
  'Aquisição de mobiliário corporativo',
  'Fornecimento de gêneros alimentícios',
  'Serviços de consultoria técnica',
  'Locação de máquinas e equipamentos',
  'Aquisição de material de construção',
  'Contratação de serviços de advocacia',
  'Fornecimento de uniformes escolares',
  'Serviços de iluminação pública',
  'Aquisição de equipamentos de segurança'
];

// Função para gerar data aleatória dentro de um período
function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Função para formatar data ISO
function formatDate(date: Date): string {
  return date.toISOString();
}

// Gerar editais para os últimos 6 anos
function generateEditais(): Edital[] {
  const editais: Edital[] = [];
  const now = new Date();
  const sixYearsAgo = new Date(now.getFullYear() - 6, 0, 1);

  // Gerar aproximadamente 500 editais nos últimos 6 anos
  for (let i = 0; i < 500; i++) {
    const dataPublicacao = randomDate(sixYearsAgo, now);
    const daysToOpen = Math.floor(Math.random() * 30) + 5;
    const daysToClose = Math.floor(Math.random() * 60) + daysToOpen + 10;

    const dataAbertura = new Date(dataPublicacao);
    dataAbertura.setDate(dataAbertura.getDate() + daysToOpen);

    const dataEncerramento = new Date(dataPublicacao);
    dataEncerramento.setDate(dataEncerramento.getDate() + daysToClose);

    const modalidadeKeys = Object.keys(modalidades);
    const randomModalidade = modalidadeKeys[Math.floor(Math.random() * modalidadeKeys.length)];
    const randomOrgao = orgaos[Math.floor(Math.random() * orgaos.length)];
    const randomObjeto = objetosBase[Math.floor(Math.random() * objetosBase.length)];
    const randomUf = ufs[Math.floor(Math.random() * ufs.length)];
    const randomPortal = portais[Math.floor(Math.random() * portais.length)];
    const randomCompany = mockCompanies[Math.floor(Math.random() * mockCompanies.length)];

    // Status baseado na data de encerramento
    let status: Edital['status'];
    if (dataEncerramento > now) {
      const random = Math.random();
      if (random < 0.3) status = 'novo';
      else if (random < 0.5) status = 'em_analise';
      else if (random < 0.7) status = 'interessado';
      else if (random < 0.85) status = 'proposta_enviada';
      else status = 'novo';
    } else {
      const random = Math.random();
      if (random < 0.15) status = 'contratado';
      else if (random < 0.35) status = 'perdido';
      else status = 'encerrado';
    }

    const valorEstimado = Math.random() > 0.15 ? Math.floor(Math.random() * 5000000) + 50000 : null;

    editais.push({
      id: `edital-${i + 1}`,
      companyId: randomCompany.id,
      numeroControlePNCP: `${Math.floor(Math.random() * 900000) + 100000}${dataPublicacao.getFullYear()}${String(i).padStart(5, '0')}`,
      numeroCompra: `${Math.floor(Math.random() * 90000) + 10000}/${dataPublicacao.getFullYear()}`,
      objeto: `${randomObjeto} - ${randomOrgao.split(' ').slice(0, 2).join(' ')} - ${dataPublicacao.getFullYear()}`,
      orgao: randomOrgao,
      cnpjOrgao: `${Math.floor(Math.random() * 90) + 10}.${Math.floor(Math.random() * 900) + 100}.${Math.floor(Math.random() * 900) + 100}.${Math.floor(Math.random() * 9000) + 1000}/${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 90) + 10}`,
      unidade: `Unidade ${Math.floor(Math.random() * 20) + 1}`,
      cidade: randomUf === 'SP' ? ['São Paulo', 'Campinas', 'Santos', 'Ribeirão Preto', 'São José dos Campos'][Math.floor(Math.random() * 5)] : `Cidade ${Math.floor(Math.random() * 100) + 1}`,
      uf: randomUf,
      modalidade: randomModalidade as Edital['modalidade'],
      dataPublicacao: formatDate(dataPublicacao),
      dataAbertura: formatDate(dataAbertura),
      dataEncerramento: formatDate(dataEncerramento),
      valorEstimado,
      portal: randomPortal,
      status,
      etapas: [],
      createdAt: formatDate(dataPublicacao),
      updatedAt: formatDate(new Date())
    });
  }

  // Ordenar por data de publicação (mais recente primeiro)
  return editais.sort((a, b) => new Date(b.dataPublicacao).getTime() - new Date(a.dataPublicacao).getTime());
}

export const mockEditais: Edital[] = generateEditais();

// Alertas do sistema
export const mockAlerts: Alert[] = [
  {
    id: 'alert-001',
    tenantId: 'tenant-001',
    type: 'vencimento',
    title: 'Edital encerrando em 2 dias',
    message: 'Pregão Eletrônico - Material de Escritório (Prefeitura de São Paulo) encerra em 2 dias',
    read: false,
    createdAt: '2026-05-09T07:00:00Z'
  },
  {
    id: 'alert-002',
    tenantId: 'tenant-001',
    type: 'nova_publicacao',
    title: 'Novo edital disponível',
    message: 'Contratação de serviços de TI - Hospital das Clínicas',
    read: false,
    createdAt: '2026-05-09T06:30:00Z'
  },
  {
    id: 'alert-003',
    tenantId: 'tenant-001',
    type: 'certidao_vencendo',
    title: 'Certidão vencendo',
    message: 'Certidão Negativa de Débitos vence em 15 dias',
    read: true,
    createdAt: '2026-05-08T14:00:00Z'
  },
  {
    id: 'alert-004',
    tenantId: 'tenant-001',
    type: 'parcela_atrasada',
    title: 'Parcela em atraso',
    message: 'Contrato N° 2024/001 - Parcela de fevereiro em atraso',
    read: false,
    createdAt: '2026-05-08T09:00:00Z'
  }
];

// Contratos mock
export const mockContracts: Contract[] = [
  {
    id: 'contract-001',
    companyId: 'company-001',
    editalId: 'edital-050',
    numeroContrato: '012/2024',
    objeto: 'Prestação de serviços de limpeza predial',
    orgao: 'Prefeitura Municipal de São Paulo',
    valor: 450000,
    dataInicio: '2024-03-01',
    dataFim: '2025-02-28',
    status: 'ativo',
    parcelas: [
      { id: 'p1', numero: 1, valor: 37500, dataVencimento: '2024-04-10', dataPagamento: '2024-04-08', status: 'pago' },
      { id: 'p2', numero: 2, valor: 37500, dataVencimento: '2024-05-10', dataPagamento: '2024-05-12', status: 'pago' },
      { id: 'p3', numero: 3, valor: 37500, dataVencimento: '2024-06-10', dataPagamento: '2024-06-10', status: 'pago' },
      { id: 'p4', numero: 4, valor: 37500, dataVencimento: '2024-07-10', dataPagamento: '2024-07-09', status: 'pago' },
      { id: 'p5', numero: 5, valor: 37500, dataVencimento: '2024-08-10', dataPagamento: '2024-08-10', status: 'pago' },
      { id: 'p6', numero: 6, valor: 37500, dataVencimento: '2024-09-10', dataPagamento: '2024-09-11', status: 'pago' },
      { id: 'p7', numero: 7, valor: 37500, dataVencimento: '2024-10-10', dataPagamento: '2024-10-10', status: 'pago' },
      { id: 'p8', numero: 8, valor: 37500, dataVencimento: '2024-11-10', dataPagamento: '2024-11-10', status: 'pago' },
      { id: 'p9', numero: 9, valor: 37500, dataVencimento: '2024-12-10', dataPagamento: '2024-12-10', status: 'pago' },
      { id: 'p10', numero: 10, valor: 37500, dataVencimento: '2025-01-10', dataPagamento: '2025-01-10', status: 'pago' },
      { id: 'p11', numero: 11, valor: 37500, dataVencimento: '2025-02-10', dataPagamento: '2025-02-08', status: 'pago' },
      { id: 'p12', numero: 12, valor: 37500, dataVencimento: '2025-03-10', dataPagamento: undefined, status: 'pendente' }
    ]
  },
  {
    id: 'contract-002',
    companyId: 'company-002',
    editalId: 'edital-120',
    numeroContrato: '045/2023',
    objeto: 'Locação de equipamentos de informática',
    orgao: 'Universidade Federal de São Paulo',
    valor: 280000,
    dataInicio: '2023-08-01',
    dataFim: '2024-07-31',
    status: 'encerrado',
    parcelas: [
      { id: 'p13', numero: 1, valor: 23333, dataVencimento: '2023-09-01', dataPagamento: '2023-09-01', status: 'pago' },
      { id: 'p14', numero: 2, valor: 23333, dataVencimento: '2023-10-01', dataPagamento: '2023-10-01', status: 'pago' },
      { id: 'p15', numero: 3, valor: 23333, dataVencimento: '2023-11-01', dataPagamento: '2023-11-01', status: 'pago' },
      { id: 'p16', numero: 4, valor: 23333, dataVencimento: '2023-12-01', dataPagamento: '2023-12-01', status: 'pago' },
      { id: 'p17', numero: 5, valor: 23333, dataVencimento: '2024-01-01', dataPagamento: '2024-01-02', status: 'pago' },
      { id: 'p18', numero: 6, valor: 23333, dataVencimento: '2024-02-01', dataPagamento: '2024-02-01', status: 'pago' },
      { id: 'p19', numero: 7, valor: 23333, dataVencimento: '2024-03-01', dataPagamento: '2024-03-01', status: 'pago' },
      { id: 'p20', numero: 8, valor: 23333, dataVencimento: '2024-04-01', dataPagamento: '2024-04-01', status: 'pago' },
      { id: 'p21', numero: 9, valor: 23333, dataVencimento: '2024-05-01', dataPagamento: '2024-05-01', status: 'pago' },
      { id: 'p22', numero: 10, valor: 23333, dataVencimento: '2024-06-01', dataPagamento: '2024-06-01', status: 'pago' },
      { id: 'p23', numero: 11, valor: 23333, dataVencimento: '2024-07-01', dataPagamento: '2024-07-01', status: 'pago' },
      { id: 'p24', numero: 12, valor: 23334, dataVencimento: '2024-08-01', dataPagamento: '2024-08-01', status: 'pago' }
    ]
  }
];

// Orçamentos mock
export const mockBudgets: Budget[] = [
  {
    id: 'budget-001',
    companyId: 'company-001',
    editalId: 'edital-200',
    description: 'Proposta - Material de Escritório',
    cost: 85000,
    profitMargin: 18,
    finalPrice: 100300,
    materials: [
      { id: 'm1', description: 'Papel A4 (resma)', quantity: 500, unitPrice: 28, total: 14000 },
      { id: 'm2', description: 'Caneta esferográfica (caixa com 50)', quantity: 100, unitPrice: 45, total: 4500 },
      { id: 'm3', description: 'Clips galvanizados (caixa 100)', quantity: 80, unitPrice: 12, total: 960 },
      { id: 'm4', description: 'Grampo galvanizado (caixa 5000)', quantity: 60, unitPrice: 18, total: 1080 },
      { id: 'm5', description: 'Lápis preto (caixa com 100)', quantity: 50, unitPrice: 35, total: 1750 },
      { id: 'm6', description: 'Borracha branca (pacote 40)', quantity: 40, unitPrice: 22, total: 880 },
      { id: 'm7', description: 'Fita adesiva transparente (rolos)', quantity: 100, unitPrice: 8, total: 800 },
      { id: 'm8', description: 'Cola bastão 40g (unidade)', quantity: 80, unitPrice: 6, total: 480 }
    ],
    services: [
      { id: 's1', description: 'Frete e entrega', quantity: 1, unitPrice: 2500, total: 2500 },
      { id: 's2', description: 'Embalagem e identificação', quantity: 1, unitPrice: 1500, total: 1500 }
    ],
    createdAt: '2026-05-01T10:00:00Z'
  }
];

// Estatísticas para dashboard
export const dashboardStats = {
  totalEditais: mockEditais.length,
  editaisAbertos: mockEditais.filter(e => new Date(e.dataEncerramento) > new Date()).length,
  propostasEnviadas: mockEditais.filter(e => e.status === 'proposta_enviada').length,
  contratosAtivos: mockContracts.filter(c => c.status === 'ativo').length,
  valorContratosAtivos: mockContracts.filter(c => c.status === 'ativo').reduce((sum, c) => sum + c.valor, 0),
  editaisPorModalidade: {
    pregao_eletronico: mockEditais.filter(e => e.modalidade === 'pregao_eletronico').length,
    tomada_precos: mockEditais.filter(e => e.modalidade === 'tomada_precos').length,
    inexigibilidade: mockEditais.filter(e => e.modalidade === 'inexigibilidade').length,
    dispensa_eletronica: mockEditais.filter(e => e.modalidade === 'dispensa_eletronica').length,
    outra: mockEditais.filter(e => !['pregao_eletronico', 'tomada_precos', 'inexigibilidade', 'dispensa_eletronica'].includes(e.modalidade)).length
  },
  editaisPorStatus: {
    novo: mockEditais.filter(e => e.status === 'novo').length,
    em_analise: mockEditais.filter(e => e.status === 'em_analise').length,
    interessado: mockEditais.filter(e => e.status === 'interessado').length,
    proposta_enviada: mockEditais.filter(e => e.status === 'proposta_enviada').length,
    contratado: mockEditais.filter(e => e.status === 'contratado').length,
    perdido: mockEditais.filter(e => e.status === 'perdido').length,
    encerrado: mockEditais.filter(e => e.status === 'encerrado').length
  },
  valoresPorMes: [
    { mes: 'Nov/25', valor: 125000 },
    { mes: 'Dez/25', valor: 89000 },
    { mes: 'Jan/26', valor: 156000 },
    { mes: 'Fev/26', valor: 78000 },
    { mes: 'Mar/26', valor: 234000 },
    { mes: 'Abr/26', valor: 198000 }
  ],
  topUFs: [
    { uf: 'SP', count: 180 },
    { uf: 'MG', count: 85 },
    { uf: 'RJ', count: 62 },
    { uf: 'PR', count: 48 },
    { uf: 'RS', count: 35 }
  ]
};