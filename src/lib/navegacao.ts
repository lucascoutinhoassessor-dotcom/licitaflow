import {
  Bot,
  Building2,
  CalendarClock,
  FileCheck2,
  FileSignature,
  Gavel,
  LayoutDashboard,
  Radar,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export interface ItemNav {
  rota: string
  rotulo: string
  icone: LucideIcon
  /** fase do plano em que o módulo é entregue; ausente = disponível */
  fase?: string
  descricao?: string
}

export const NAV_PRINCIPAL: ItemNav[] = [
  { rota: '/app', rotulo: 'Painel', icone: LayoutDashboard },
  {
    rota: '/app/oportunidades',
    rotulo: 'Oportunidades',
    icone: Radar,
    fase: 'F2',
    descricao: 'Radar automático no PNCP: pregões e dispensas eletrônicas que combinam com o perfil da sua empresa, com nota de aderência e alerta.',
  },
  {
    rota: '/app/processos',
    rotulo: 'Processos',
    icone: Gavel,
    descricao: 'Funil e kanban dos processos: captação, análise, proposta, disputa, habilitação, recurso e resultado, com itens, preços-limite e linha do tempo.',
  },
  {
    rota: '/app/prazos',
    rotulo: 'Prazos',
    icone: CalendarClock,
    descricao: 'Calendário de sessões, impugnações, esclarecimentos, recursos, entregas e vigências, com alertas por e-mail e WhatsApp.',
  },
  {
    rota: '/app/documentos',
    rotulo: 'Documentos',
    icone: FileCheck2,
    descricao: 'Certidões e documentos de habilitação com controle de validade e aviso antes de vencer.',
  },
  {
    rota: '/app/contratos',
    rotulo: 'Contratos',
    icone: FileSignature,
    descricao: 'Contratos e atas de registro de preço, empenhos, entregas, saldos e vigências do pós-pregão.',
  },
  {
    rota: '/app/financeiro',
    rotulo: 'Financeiro',
    icone: Wallet,
    descricao: 'Faturamento, notas fiscais, recebimentos e prazo médio de pagamento por órgão.',
  },
  {
    rota: '/app/agentes',
    rotulo: 'Agentes de IA',
    icone: Bot,
    fase: 'F2–F5',
    descricao: 'Radar, Leitor de editais, Cotador, Jurídico, Sentinela e Termômetro de Pagamento trabalhando por você todos os dias.',
  },
]

export const NAV_CONTA: ItemNav[] = [
  { rota: '/app/empresas', rotulo: 'Empresas', icone: Building2 },
  { rota: '/app/equipe', rotulo: 'Equipe', icone: Users },
  { rota: '/app/configuracoes', rotulo: 'Configurações', icone: Settings },
]
