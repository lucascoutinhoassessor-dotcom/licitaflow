import { supabase } from './supabase'

export type TipoOcorrencia = 'desclassificacao' | 'inabilitacao' | 'recusa' | 'sem_proposta'
export interface OcorrenciaAta {
  tipo: TipoOcorrencia; empresa: string | null; cnpj: string | null; itens: string | null
  data: string | null; motivo: string; documento: string; url: string; controle?: string
}
export interface DocumentoAta { titulo: string; url: string; lido: boolean; paginas?: number; ocorrencias?: number; aviso?: string }
export interface SituacaoAta { tipo: TipoOcorrencia; itens: string | null; motivo: string }
export interface ParticipanteAta { cnpj: string; nome: string | null; mencoes: number; documento: string; url: string; colocacao?: number | null; situacoes?: SituacaoAta[] }
/** Empresas de um item (ou grupo) lidas no termo de julgamento enviado pelo usuário. */
export interface ItemAta {
  tipo: 'item' | 'grupo'; numero: number
  empresas: { cnpj: string; nome: string | null; valor: number | null; situacao: 'classificada' | 'participou' | 'recusa' | 'desclassificacao' | 'inabilitacao'; motivo: string | null }[]
}
export interface AtasCompra { controle: string; documentos: DocumentoAta[]; ocorrencias: OcorrenciaAta[]; participantes?: ParticipanteAta[]; itens?: ItemAta[] }
export interface AtaEnviada { hash: string; arquivo: string; created_at: string; resultado: Omit<AtasCompra, 'controle'> }
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

async function comLogin() {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Entre na sua conta.')
  return { Authorization: `Bearer ${data.session.access_token}` }
}

/** Termos de julgamento / atas enviados pelos usuários para uma compra federal. */
export async function atasEnviadas(idCompra: string, signal?: AbortSignal): Promise<AtaEnviada[]> {
  const r = await fetch(`/api/atas?acao=enviadas&idCompra=${encodeURIComponent(idCompra)}`, { headers: await comLogin(), signal })
  const corpo = await r.json().catch(() => null)
  if (!r.ok) throw new Error(corpo?.error ?? 'Não foi possível buscar as atas enviadas.')
  return corpo.enviadas as AtaEnviada[]
}

export const MAX_ATA_ENVIO = 3 * 1024 * 1024

/** Envia o PDF baixado no portal da compra; o servidor lê e guarda a leitura para todos. */
export async function enviarAta(idCompra: string, controle: string | null, arquivo: File): Promise<AtaEnviada> {
  if (arquivo.size > MAX_ATA_ENVIO) throw new Error('Envie um PDF de até 3 MB.')
  const bytes = new Uint8Array(await arquivo.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  const r = await fetch(`/api/atas?acao=enviar&idCompra=${encodeURIComponent(idCompra)}`, {
    method: 'POST', headers: { ...(await comLogin()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ arquivo: arquivo.name, controle, pdf: btoa(bin) }),
  })
  const corpo = await r.json().catch(() => null)
  if (!r.ok) throw new Error(corpo?.error ?? 'Não foi possível ler o arquivo.')
  return corpo as AtaEnviada
}

/** Junta as atas do PNCP com as enviadas pelos usuários num só conjunto. */
export function juntarAtas(pncp: AtasCompra | undefined, enviadas: AtaEnviada[] = []): AtasCompra | undefined {
  if (!enviadas.length) return pncp
  const base: AtasCompra = pncp ?? { controle: '', documentos: [], ocorrencias: [], participantes: [] }
  return {
    ...base,
    documentos: [...base.documentos, ...enviadas.flatMap((e) => e.resultado.documentos ?? [])],
    ocorrencias: [...base.ocorrencias, ...enviadas.flatMap((e) => e.resultado.ocorrencias ?? [])],
    participantes: [...(base.participantes ?? []), ...enviadas.flatMap((e) => e.resultado.participantes ?? [])],
    itens: [...(base.itens ?? []), ...enviadas.flatMap((e) => e.resultado.itens ?? [])],
  }
}
