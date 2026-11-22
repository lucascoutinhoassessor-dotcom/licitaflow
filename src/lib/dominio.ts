// Regras e rótulos do domínio de licitações (sem dependência de React/Supabase, testável).
import { diasAte } from './format'

export const MODALIDADES = {
  pregao_eletronico: 'Pregão eletrônico',
  dispensa_eletronica: 'Dispensa eletrônica',
  concorrencia_eletronica: 'Concorrência eletrônica',
  pregao_presencial: 'Pregão presencial',
  dispensa: 'Dispensa',
  inexigibilidade: 'Inexigibilidade',
  concorrencia: 'Concorrência',
  outra: 'Outra',
} as const
export type Modalidade = keyof typeof MODALIDADES

export const ETAPAS = {
  captacao: 'Captação',
  analise: 'Análise',
  proposta: 'Proposta',
  disputa: 'Disputa',
  habilitacao: 'Habilitação',
  recurso: 'Recurso',
  homologado: 'Ganho',
  concluido: 'Concluído',
  perdido: 'Perdido',
  desistencia: 'Desistência',
} as const
export type Etapa = keyof typeof ETAPAS
export const ETAPAS_ATIVAS: Etapa[] = ['captacao', 'analise', 'proposta', 'disputa', 'habilitacao', 'recurso']
export const ETAPAS_FINAIS: Etapa[] = ['homologado', 'concluido', 'perdido', 'desistencia']
export const COR_ETAPA: Record<Etapa, string> = {
  captacao: 'bg-slate-400',
  analise: 'bg-sky-500',
  proposta: 'bg-indigo-500',
  disputa: 'bg-violet-500',
  habilitacao: 'bg-amber-500',
  recurso: 'bg-orange-500',
  homologado: 'bg-emerald-500',
  concluido: 'bg-teal-500',
  perdido: 'bg-red-500',
  desistencia: 'bg-zinc-400',
}

export const PRIORIDADES = { baixa: 'Baixa', media: 'Média', alta: 'Alta' } as const

export const TIPOS_PRAZO = {
  sessao: 'Sessão pública',
  proposta: 'Envio de proposta',
  esclarecimento: 'Pedido de esclarecimento',
  impugnacao: 'Impugnação',
  recurso: 'Recurso',
  contrarrazoes: 'Contrarrazões',
  habilitacao: 'Habilitação / documentos',
  amostra: 'Amostra',
  entrega: 'Entrega',
  assinatura: 'Assinatura de contrato/ata',
  vigencia: 'Fim de vigência',
  certidao: 'Vencimento de certidão',
  outro: 'Outro',
} as const
export type TipoPrazo = keyof typeof TIPOS_PRAZO

export const CATEGORIAS_DOC = {
  certidao: 'Certidão',
  habilitacao_juridica: 'Habilitação jurídica',
  qualificacao_tecnica: 'Qualificação técnica',
  qualificacao_economica: 'Qualificação econômico-financeira',
  declaracao: 'Declaração',
  edital: 'Edital',
  anexo_edital: 'Anexo do edital',
  proposta: 'Proposta',
  ata: 'Ata',
  contrato: 'Contrato',
  nota_fiscal: 'Nota fiscal',
  outro: 'Outro',
} as const
export type CategoriaDoc = keyof typeof CATEGORIAS_DOC

/** Certidões mais exigidas em habilitação (sugestões no formulário). */
export const CERTIDOES_COMUNS = [
  'CND Federal (Receita/PGFN)',
  'CRF FGTS',
  'CNDT (Débitos Trabalhistas)',
  'CND Estadual',
  'CND Municipal',
  'Certidão de Falência e Recuperação Judicial',
  'SICAF',
  'Balanço patrimonial',
  'Atestado de capacidade técnica',
]

export const TIPOS_CONTRATO = { contrato: 'Contrato', ata_registro_preco: 'Ata de registro de preço', empenho_direto: 'Empenho direto' } as const
export const STATUS_CONTRATO = { ativo: 'Ativo', suspenso: 'Suspenso', encerrado: 'Encerrado', rescindido: 'Rescindido' } as const
export const STATUS_EMPENHO = {
  recebido: 'Recebido',
  em_producao: 'Em produção/separação',
  entregue_parcial: 'Entregue parcialmente',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
} as const
export const STATUS_FATURA = { emitida: 'Emitida', atestada: 'Atestada', liquidada: 'Liquidada', paga: 'Paga', cancelada: 'Cancelada' } as const

export type SituacaoValidade = 'sem_validade' | 'vencido' | 'vence_em_breve' | 'valido'

/** Situação de um documento pela data de validade (vence em breve = até `aviso` dias). */
export function situacaoValidade(validade: string | null | undefined, aviso = 15, hoje = new Date()): SituacaoValidade {
  if (!validade) return 'sem_validade'
  const d = diasAte(validade, hoje)
  if (d < 0) return 'vencido'
  if (d <= aviso) return 'vence_em_breve'
  return 'valido'
}

export type SituacaoPrazo = 'concluido' | 'atrasado' | 'hoje' | 'semana' | 'futuro'

export function situacaoPrazo(dataHora: string, concluido: boolean, hoje = new Date()): SituacaoPrazo {
  if (concluido) return 'concluido'
  const d = diasAte(dataHora, hoje)
  if (d < 0) return 'atrasado'
  if (d === 0) return new Date(dataHora) < hoje ? 'atrasado' : 'hoje'
  if (d <= 7) return 'semana'
  return 'futuro'
}

/**
 * Preço-limite unitário: menor valor que ainda garante a margem mínima sobre o custo.
 * limite = custo / (1 - margem%). Retorna null se faltar dado ou margem inválida.
 */
export function precoLimite(custoUnit: number | null | undefined, margemPct: number | null | undefined): number | null {
  if (custoUnit == null || margemPct == null || margemPct >= 100 || custoUnit < 0) return null
  return Math.round((custoUnit / (1 - margemPct / 100)) * 10000) / 10000
}

/** Margem (%) obtida vendendo a `preco` com custo `custo`. */
export function margemSobrePreco(preco: number | null | undefined, custo: number | null | undefined): number | null {
  if (!preco || custo == null) return null
  return Math.round(((preco - custo) / preco) * 10000) / 100
}

/** Desconto (%) do lance em relação ao valor de referência do órgão. */
export function descontoSobreReferencia(lance: number | null | undefined, referencia: number | null | undefined): number | null {
  if (!lance || !referencia) return null
  return Math.round(((referencia - lance) / referencia) * 10000) / 100
}

/** Soma total de itens (quantidade × valor unitário escolhido). */
export function totalItens<T extends { quantidade: number }>(itens: T[], valor: (i: T) => number | null | undefined): number {
  return itens.reduce((acc, i) => acc + (Number(valor(i)) || 0) * Number(i.quantidade || 0), 0)
}
