import { supabase } from './supabase'

/** Trecho do edital que comprova um item. `conferido`: achado no texto (true), não achado (false), PDF escaneado (null). */
export interface TrechoEdital { texto: string; documento: string; pagina: number | null; conferido: boolean | null }
export type CategoriaHabilitacao = 'juridica' | 'fiscal_trabalhista' | 'economico_financeira' | 'tecnica' | 'declaracoes' | 'outros'
export interface ResultadoLeitor {
  resumo: string
  datas: { evento: string; data: string; trecho: TrechoEdital }[]
  habilitacao: { categoria: CategoriaHabilitacao; exigencia: string; detalhe: string; trecho: TrechoEdital }[]
  proposta: { exigencia: string; detalhe: string; trecho: TrechoEdital }[]
  participacao: { tema: string; situacao: string; trecho: TrechoEdital }[]
  riscos: { nivel: 'alto' | 'medio' | 'baixo'; titulo: string; detalhe: string; trecho: TrechoEdital }[]
}
export interface DocumentoLido { id: string | null; titulo: string; url: string; lido: boolean; escaneado?: boolean; paginas?: number; paginasLidas?: number; aviso?: string }
export interface LeituraEdital { controle: string; objeto: string | null; resultado: ResultadoLeitor; documentos: DocumentoLido[]; modelo: string; created_at: string }
export interface UsoLeitor { usadas: number; limite: number }
export interface RespostaLeitor { leitura: LeituraEdital | null; uso: UsoLeitor; reaproveitada?: boolean }

export const NOME_CATEGORIA: Record<CategoriaHabilitacao, string> = {
  juridica: 'Habilitação jurídica', fiscal_trabalhista: 'Regularidade fiscal e trabalhista', economico_financeira: 'Qualificação econômico-financeira',
  tecnica: 'Qualificação técnica', declaracoes: 'Declarações', outros: 'Outros documentos',
}
export const NOME_TEMA: Record<string, string> = {
  me_epp: 'ME/EPP', consorcio: 'Consórcio', subcontratacao: 'Subcontratação', visita_tecnica: 'Visita técnica', garantia_proposta: 'Garantia da proposta',
  garantia_contrato: 'Garantia contratual', amostra: 'Amostra', criterio_julgamento: 'Critério de julgamento', modo_disputa: 'Modo de disputa', pagamento: 'Pagamento', outros: 'Outros',
}

/**
 * Número de controle PNCP (CNPJ-1-SEQ/ANO) a partir do que o cliente colar: o próprio número
 * ou o link do edital no PNCP (pncp.gov.br/app/editais/CNPJ/ANO/SEQ). null se não reconhecer.
 */
export function controleDe(entrada: string): string | null {
  const s = entrada.trim()
  const c = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})-1-0*(\d{1,9})\/(\d{4})/.exec(s)
  if (c) return `${c[1].replace(/\D/g, '')}-1-${c[2].padStart(6, '0')}/${c[3]}`
  const u = /editais\/(\d{14})\/(\d{4})\/(\d{1,9})/.exec(s)
  if (u) return `${u[1]}-1-${u[3].padStart(6, '0')}/${u[2]}`
  return null
}

/** Partes do número de controle para montar a rota do app. */
export function partesControle(controle: string) {
  const m = /^(\d{14})-1-0*(\d+)\/(\d{4})$/.exec(controle)
  return m ? { cnpj: m[1], seq: m[2], ano: m[3] } : null
}
export const rotaLeitor = (controle: string) => {
  const p = partesControle(controle)
  return p ? `/app/agentes/leitor/${p.cnpj}/${p.ano}/${p.seq}` : '/app/agentes'
}

async function chamar(metodo: 'GET' | 'POST', org: string, controle: string, signal?: AbortSignal): Promise<RespostaLeitor> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Entre na sua conta para usar o Leitor de editais.')
  const qs = new URLSearchParams({ agente: 'leitor', org, controle })
  const r = await fetch(`/api/agentes?${qs}`, { method: metodo, headers: { Authorization: `Bearer ${data.session.access_token}` }, signal })
  const corpo = await r.json().catch(() => null)
  if (!r.ok) throw Object.assign(new Error(corpo?.error ?? 'Não foi possível ler o edital agora.'), { documentos: corpo?.documentos as DocumentoLido[] | undefined })
  return corpo as RespostaLeitor
}

/** Leitura já guardada deste edital (sem custo) e o consumo do mês. */
export const leituraGuardada = (org: string, controle: string, signal?: AbortSignal) => chamar('GET', org, controle, signal)
/** Lê o edital com a IA (ou reaproveita a leitura guardada). Pode levar alguns minutos. */
export const lerEditalIA = (org: string, controle: string) => chamar('POST', org, controle)
