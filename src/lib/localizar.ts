import { supabase } from './supabase'
import type { CompraPNCP } from './pncp'

/** Edital do PNCP identificado direto pelo texto (nº de controle ou link), sem precisar consultar o banco. */
export interface EditalDireto { cnpj: string; ano: string; seq: string }

/**
 * Reconhece o número de controle do PNCP (00394460000141-1-000123/2026) ou um link de edital do PNCP
 * (pncp.gov.br/app/editais/00394460000141/2026/123). Devolve a rota interna do edital.
 */
export function editalDireto(texto: string): EditalDireto | null {
  const t = texto.trim()
  const controle = /^(\d{14})-1-0*(\d{1,9})\/(\d{4})$/.exec(t)
  if (controle) return { cnpj: controle[1], seq: String(Number(controle[2])), ano: controle[3] }
  const link = /pncp\.gov\.br\/app\/editais\/(\d{14})\/(\d{4})\/0*(\d{1,9})(?:[/?#]|$)/i.exec(t)
  if (link) return { cnpj: link[1], ano: link[2], seq: String(Number(link[3])) }
  return null
}

export function rotaEditalDireto(e: EditalDireto) {
  return `/app/oportunidades/${e.cnpj}/${e.ano}/${e.seq}`
}

/** Valida o texto antes de consultar: precisa ter algum número e no máximo 200 caracteres. */
export function validarLocalizar(texto: string): string | null {
  const t = texto.trim()
  if (!t) return 'Informe o número do edital, do processo, a UASG ou cole o link.'
  if (t.length > 200) return 'Use no máximo 200 caracteres.'
  if (!/\d/.test(t)) return 'Informe um número (ex.: 90012/2026).'
  return null
}

export interface ResultadoLocalizar { data: CompraPNCP[]; total: number }

/** Procura no catálogo do LicitaFlow por número da compra, processo, UASG, código do Compras.gov ou CNPJ do órgão. */
export async function localizarEdital(texto: string, uf: string, signal?: AbortSignal): Promise<ResultadoLocalizar> {
  const erro = validarLocalizar(texto)
  if (erro) throw new Error(erro)
  const pedido = supabase.rpc('localizar_edital', { p_termo: texto.trim(), p_uf: uf })
  const { data, error } = await (signal ? pedido.abortSignal(signal) : pedido)
  if (error) {
    if (signal?.aborted) throw signal.reason
    if (['PGRST202', 'PGRST205', '42883'].includes(error.code)) throw new Error('A busca por número está sendo preparada. Tente novamente em instantes.')
    throw new Error('Não foi possível localizar o edital. Tente novamente.')
  }
  if (!data || !Array.isArray(data.data) || !Number.isInteger(data.total)) throw new Error('A busca retornou uma resposta inesperada.')
  return data as ResultadoLocalizar
}
