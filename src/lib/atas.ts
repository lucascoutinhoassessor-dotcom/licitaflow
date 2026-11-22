import { supabase } from './supabase'

export type TipoOcorrencia = 'desclassificacao' | 'inabilitacao' | 'recusa' | 'sem_proposta'
export interface OcorrenciaAta {
  tipo: TipoOcorrencia; empresa: string | null; cnpj: string | null; itens: string | null
  data: string | null; motivo: string; documento: string; url: string; controle?: string
}
export interface DocumentoAta { titulo: string; url: string; lido: boolean; paginas?: number; ocorrencias?: number; aviso?: string }
export interface SituacaoAta { tipo: TipoOcorrencia; itens: string | null; motivo: string }
export interface ParticipanteAta { cnpj: string; nome: string | null; mencoes: number; documento: string; url: string; colocacao?: number | null; situacoes?: SituacaoAta[] }
export interface AtasCompra { controle: string; documentos: DocumentoAta[]; ocorrencias: OcorrenciaAta[]; participantes?: ParticipanteAta[] }
export interface AtasEmpresa { cnpj: string; comprasConsultadas: number; comAta: number; ocorrencias: OcorrenciaAta[] }

export const NOME_TIPO: Record<TipoOcorrencia, string> = { desclassificacao: 'Desclassificação', inabilitacao: 'Inabilitação', recusa: 'Proposta recusada', sem_proposta: 'Não enviou proposta' }

async function chamar<T>(qs: URLSearchParams, signal?: AbortSignal): Promise<T> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Entre na sua conta para ler as atas.')
  const r = await fetch(`/api/atas?${qs}`, { headers: { Authorization: `Bearer ${data.session.access_token}` }, signal })
  const corpo = await r.json().catch(() => null)
  if (!r.ok) throw new Error(corpo?.error ?? 'Não foi possível ler as atas agora.')
  return corpo as T
}

/** Lê as atas publicadas no PNCP de uma compra e separa desclassificações, inabilitações e motivos. */
export const atasDaCompra = (controle: string, signal?: AbortSignal) => chamar<AtasCompra>(new URLSearchParams({ controle }), signal)

/** Lê as atas das compras de uma empresa e devolve só o que fala dela. */
export const atasDaEmpresa = (cnpj: string, nome: string, controles: string[], signal?: AbortSignal) =>
  chamar<AtasEmpresa>(new URLSearchParams({ cnpj, nome, controles: controles.slice(0, 15).join(',') }), signal)
