// Tipos das tabelas usadas no frontend (espelham supabase/migrations).
// Quando o projeto Supabase existir, podem ser gerados com:
//   npx supabase gen types typescript --project-id <id> > src/types/supabase.ts

export type Papel = 'owner' | 'admin' | 'membro' | 'leitor'
export type TipoOrg = 'fornecedor' | 'assessoria'

export interface Organizacao {
  id: string
  nome: string
  tipo: TipoOrg
  plano: string
  trial_ate: string
  suspensa: boolean
  motivo_suspensao: string | null
  created_at: string
}

export interface OrganizacaoComPapel extends Organizacao {
  papel: Papel
}

export interface Empresa {
  id: string
  org_id: string
  cnpj: string
  razao_social: string
  nome_fantasia: string | null
  porte: string | null
  optante_simples: boolean | null
  cnae_principal: string | null
  cnaes: { codigo: string; descricao: string }[]
  endereco: Record<string, string | null>
  uf: string | null
  municipio: string | null
  email: string | null
  telefone: string | null
  palavras_chave: string[]
  ativa: boolean
  created_at: string
}

export interface Membro {
  org_id: string
  user_id: string
  papel: Papel
  created_at: string
  profiles: { nome: string | null; email: string | null } | null
}

export interface Convite {
  id: string
  org_id: string
  email: string
  papel: Exclude<Papel, 'owner'>
  token: string
  aceito_em: string | null
  expira_em: string
  created_at: string
}

export const NOME_PAPEL: Record<Papel, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  membro: 'Membro',
  leitor: 'Somente leitura',
}

// ===== F1: operação =====
import type { CategoriaDoc, Etapa, Modalidade, TipoPrazo } from '@/lib/dominio'

export interface Processo {
  id: string
  org_id: string
  empresa_id: string
  modalidade: Modalidade
  etapa: Etapa
  numero: string | null
  objeto: string
  orgao_nome: string | null
  orgao_cnpj: string | null
  uasg: string | null
  uf: string | null
  municipio: string | null
  portal: string | null
  link_edital: string | null
  pncp_controle: string | null
  valor_estimado: number | null
  valor_proposto: number | null
  valor_adjudicado: number | null
  data_publicacao: string | null
  data_abertura: string | null
  data_limite_proposta: string | null
  prioridade: 'baixa' | 'media' | 'alta'
  responsavel_id: string | null
  motivo_perda: string | null
  observacoes: string | null
  /** Arquivado sai do Kanban e da lista (não apaga nada). */
  arquivado_em: string | null
  /** Sentinela ligada neste processo (padrão ligado; o cliente desliga pelo cartão do Kanban). */
  monitorar: boolean
  created_at: string
  updated_at: string
}

export interface ProcessoItem {
  id: string
  org_id: string
  processo_id: string
  numero_item: number | null
  lote: string | null
  descricao: string
  unidade: string | null
  quantidade: number
  valor_ref_unit: number | null
  custo_unit: number | null
  margem_min_pct: number | null
  preco_limite_unit: number | null
  lance_final_unit: number | null
  marca_modelo: string | null
  fornecedor_nome: string | null
  resultado: 'ganho' | 'perdido' | 'fracassado' | 'deserto' | 'cancelado' | null
  colocacao: number | null
}

export interface ProcessoEvento {
  id: string
  processo_id: string
  tipo: string
  titulo: string
  descricao: string | null
  dados: Record<string, unknown>
  origem: 'usuario' | 'sistema' | 'agente'
  autor_id: string | null
  created_at: string
}

export interface Prazo {
  id: string
  org_id: string
  empresa_id: string | null
  processo_id: string | null
  contrato_id: string | null
  tipo: TipoPrazo
  titulo: string
  data_hora: string
  concluido: boolean
  concluido_em: string | null
  responsavel_id: string | null
  created_at: string
}

export interface Documento {
  id: string
  org_id: string
  empresa_id: string | null
  processo_id: string | null
  categoria: CategoriaDoc
  tipo: string | null
  nome: string
  numero: string | null
  emissao: string | null
  validade: string | null
  storage_path: string | null
  tamanho_bytes: number | null
  mime_type: string | null
  created_at: string
}

export interface Contrato {
  id: string
  org_id: string
  empresa_id: string
  processo_id: string | null
  tipo: 'contrato' | 'ata_registro_preco' | 'empenho_direto'
  numero: string | null
  orgao_nome: string | null
  orgao_cnpj: string | null
  objeto: string | null
  valor_total: number | null
  inicio_vigencia: string | null
  fim_vigencia: string | null
  status: 'ativo' | 'suspenso' | 'encerrado' | 'rescindido'
  gestor_orgao: string | null
  observacoes: string | null
  created_at: string
}

export interface Empenho {
  id: string
  org_id: string
  contrato_id: string | null
  processo_id: string | null
  numero: string
  data_emissao: string | null
  valor: number
  prazo_entrega: string | null
  status: 'recebido' | 'em_producao' | 'entregue_parcial' | 'entregue' | 'cancelado'
  observacoes: string | null
  created_at: string
}

export interface Entrega {
  id: string
  org_id: string
  empenho_id: string | null
  data_entrega: string | null
  descricao: string | null
  valor: number | null
  status: 'agendada' | 'entregue' | 'recusada' | 'aceita'
}

export interface Fatura {
  id: string
  org_id: string
  empenho_id: string | null
  contrato_id: string | null
  numero_nf: string | null
  orgao_cnpj: string | null
  data_emissao: string | null
  valor: number
  vencimento: string | null
  data_pagamento: string | null
  status: 'emitida' | 'atestada' | 'liquidada' | 'paga' | 'cancelada'
  created_at: string
}
