import {
  Bot,
  Headphones,
  Bell,
  BarChart3,
  CreditCard,
  Building2,
  CalendarClock,
  FileCheck2,
  FileSignature,
  Gavel,
  LayoutDashboard,
  Radar,
  Radio,
  MonitorDown,
  Settings,
  Users,
  Wallet,
  Briefcase,
  LineChart,
  SearchCheck,
  Tag,
  MapPinned,
  Scale,
  FileText,
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

export interface GrupoNav {
  id: string
  rotulo: string
  /** rótulo da barra inferior do celular, quando o completo não cabe */
  curto?: string
  icone: LucideIcon
  itens: ItemNav[]
}

const PAINEL: ItemNav = { rota: '/app', rotulo: 'Painel', icone: LayoutDashboard }

export const IA: ItemNav = {
  rota: '/app/agentes',
  rotulo: 'Agentes de IA',
  icone: Bot,
  fase: 'F2–F5',
  descricao: 'Radar, Leitor de editais, Cotador, Jurídico, Sentinela e Termômetro de Pagamento trabalhando por você todos os dias.',
}

const JURIDICO = 'Minutas de impugnação, esclarecimento, intenção de recurso, recurso e contrarrazões com base na Lei 14.133, preenchidas com os dados do processo e com o prazo legal calculado.'

/** Menus agrupados da barra superior (computador) e da barra inferior (celular). */
export const GRUPOS_NAV: GrupoNav[] = [
  {
    id: 'oportunidades',
    rotulo: 'Oportunidades',
    curto: 'Editais',
    icone: Radar,
    itens: [
      {
        rota: '/app/oportunidades',
        rotulo: 'Encontrar oportunidades',
        icone: Radar,
        descricao: 'Busca de oportunidades nos portais de compras com filtros e importação para Processos.',
      },
    ],
  },
  {
    id: 'negocios',
    rotulo: 'Negócios',
    icone: Briefcase,
    itens: [
      {
        rota: '/app/processos',
        rotulo: 'Processos',
        icone: Gavel,
        descricao: 'Funil e kanban dos processos: captação, análise, proposta, disputa, habilitação, recurso e resultado, com itens, preços-limite e linha do tempo.',
      },
      {
        rota: '/app/prazos',
        rotulo: 'Agenda e prazos',
        icone: CalendarClock,
        descricao: 'Calendário de sessões, impugnações, esclarecimentos, recursos, entregas e vigências, com alertas por e-mail e WhatsApp.',
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
    ],
  },
  {
    id: 'analise',
    rotulo: 'Análise',
    icone: LineChart,
    itens: [
      {
        rota: '/app/analise-mercado',
        rotulo: 'Análise de mercado',
        icone: MapPinned,
        descricao: 'Valor contratado por estado e por mês, principais órgãos, empresas vencedoras e marcas de um produto ou serviço.',
      },
      {
        rota: '/app/analise-empresas',
        rotulo: 'Análise de empresas',
        icone: SearchCheck,
        descricao: 'Por CNPJ: contratos ganhos, valores, órgãos e estados onde cada empresa vende para o governo.',
      },
      {
        rota: '/app/historico-precos',
        rotulo: 'Histórico de preços',
        icone: Tag,
        descricao: 'Preços homologados nas compras públicas, com marca, fornecedor e órgão.',
      },
      { rota: '/app/relatorios', rotulo: 'Relatórios', icone: BarChart3 },
    ],
  },
  {
    id: 'juridico',
    rotulo: 'Jurídico',
    icone: Scale,
    itens: [
      { rota: '/app/juridico/impugnacao', rotulo: 'Impugnação', icone: FileText, descricao: JURIDICO },
      { rota: '/app/juridico/esclarecimento', rotulo: 'Esclarecimento', icone: FileText, descricao: JURIDICO },
      { rota: '/app/juridico/intencao-recurso', rotulo: 'Intenção de recurso', icone: FileText, descricao: JURIDICO },
      { rota: '/app/juridico/recurso', rotulo: 'Recurso', icone: FileText, descricao: JURIDICO },
      { rota: '/app/juridico/contrarrazoes', rotulo: 'Contrarrazões', icone: FileText, descricao: JURIDICO },
    ],
  },
  {
    id: 'disputa',
    rotulo: 'Disputa',
    icone: Radio,
    itens: [
      {
        rota: '/app/pregao-ao-vivo',
        rotulo: 'Pregão ao Vivo',
        icone: Radio,
        descricao: 'Programa instalado que acompanha a sala de disputa em tempo real e dá os lances: mensagens do pregoeiro, convocações com prazo, fases, lances e posição.',
      },
      {
        rota: '/app/pregao-ao-vivo/instalar',
        rotulo: 'Instalar o programa',
        icone: MonitorDown,
        descricao: 'Baixe o instalador do Pregão ao Vivo para Windows: um arquivo só, que abre e instala tudo.',
      },
    ],
  },
]

/** Menu do usuário (canto superior direito) e "Mais" no celular. */
export const NAV_CONTA: ItemNav[] = [
  {
    rota: '/app/documentos',
    rotulo: 'Documentos',
    icone: FileCheck2,
    descricao: 'Certidões e documentos de habilitação com controle de validade e aviso antes de vencer.',
  },
  { rota: '/app/empresas', rotulo: 'Minhas empresas', icone: Building2 },
  { rota: '/app/equipe', rotulo: 'Equipe', icone: Users },
  { rota: '/app/plano', rotulo: 'Meu plano e uso', icone: CreditCard },
  { rota: '/cobrancas', rotulo: 'Cobranças do LicitaForce', icone: Wallet },
  { rota: '/app/quadro', rotulo: 'Quadro informativo', icone: Bell },
  { rota: '/app/sugestoes', rotulo: 'Minhas sugestões', icone: Headphones },
  { rota: '/app/avisos', rotulo: 'Avisos', icone: Bell },
  { rota: '/suporte', rotulo: 'Suporte e sugestões', icone: Headphones },
  { rota: '/app/configuracoes', rotulo: 'Configurações', icone: Settings },
]

/** Lista plana de todos os módulos (usada pela página "em breve"). */
export const NAV_PRINCIPAL: ItemNav[] = [PAINEL, ...GRUPOS_NAV.flatMap((g) => g.itens), IA, ...NAV_CONTA]

export function rotaAtiva(rota: string, pathname: string) {
  return rota === '/app' ? pathname === '/app' || pathname === '/app/' : pathname === rota || pathname.startsWith(rota + '/')
}
