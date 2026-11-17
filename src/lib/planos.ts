// Planos exibidos na landing page.
// ⚠️ PREÇOS PROVISÓRIOS: ajuste os valores aqui antes de divulgar o site.
export interface Plano {
  id: 'essencial' | 'profissional' | 'assessoria'
  nome: string
  publico: string
  mensal: number
  /** preço mensal equivalente no plano anual */
  anual: number
  destaque?: boolean
  itens: string[]
}

export const PLANOS: Plano[] = [
  {
    id: 'essencial',
    nome: 'Essencial',
    publico: 'Para quem está começando a disputar licitações',
    mensal: 197,
    anual: 164,
    itens: ['1 empresa (CNPJ)', 'Até 3 usuários', 'Busca de oportunidades nos portais de compras', 'Funil de processos e prazos', 'Controle de certidões com alertas', 'Suporte por e-mail'],
  },
  {
    id: 'profissional',
    nome: 'Profissional',
    publico: 'Para fornecedores que disputam todo dia',
    mensal: 397,
    anual: 331,
    destaque: true,
    itens: [
      'Tudo do Essencial',
      'Até 10 usuários',
      'Leitor de editais com IA',
      'Sentinela: monitoramento dos seus processos',
      'Contratos, empenhos e faturamento',
      'Alertas por WhatsApp',
      'Suporte prioritário',
    ],
  },
  {
    id: 'assessoria',
    nome: 'Assessoria',
    publico: 'Para assessorias que atendem várias empresas',
    mensal: 797,
    anual: 664,
    itens: ['Tudo do Profissional', 'Até 15 empresas clientes', 'Usuários ilimitados', 'Visão consolidada de todas as empresas', 'Agentes Cotador e Jurídico', 'Onboarding assistido'],
  },
]

export const DIAS_TESTE = 14
