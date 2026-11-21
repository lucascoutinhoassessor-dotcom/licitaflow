import { supabase } from './supabase'
import type { CompraPreco, EstatisticaUnidade } from './precos'

export const UF_NOME: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco',
  PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina',
  SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
}
export const ESFERA_NOME: Record<string, string> = { F: 'Federal', E: 'Estadual', M: 'Municipal' }
export const PODER_NOME: Record<string, string> = { E: 'Executivo', L: 'Legislativo', J: 'Judiciário' }
export const MODALIDADE_NOME: Record<number, string> = { 1: 'Convite', 2: 'Tomada de preços', 3: 'Concorrência', 4: 'Concurso', 5: 'Pregão eletrônico', 6: 'Dispensa', 7: 'Inexigibilidade', 20: 'Concorrência eletrônica', 22: 'Leilão' }

interface Soma { itens: number; valor: number }
export interface AnaliseMercado {
  de: string; ate: string; uf: string; incompleto: boolean; limitePorItem?: number; descartadas: number
  itens: number; compras: number; valorTotal: number
  porUf: (Soma & { uf: string })[]
  porMes: (Soma & { mes: string })[]
  totalOrgaos: number; orgaos: (Soma & { nome: string; unidade: string | null; uasg: string | null; uf: string | null })[]
  totalEmpresas: number; empresas: (Soma & { cnpj: string; nome: string | null })[]
  totalMarcas: number; marcas: (Soma & { marca: string })[]
  catalogo: (Soma & { codigo: string })[]
  esferas: (Soma & { id: string })[]; poderes: (Soma & { id: string })[]; modalidades: (Soma & { id: number })[]
  unidades: EstatisticaUnidade[]
  recentes: (CompraPreco & { codigoCatalogo: string | null })[]
}
export interface FiltrosMercado { codigos: string[]; de: string; ate: string; uf: string; esfera: string; poder: string; modalidade: string }

/** Compras homologadas dos itens do catálogo escolhidos, resumidas por estado, mês, órgão, empresa e marca. */
export async function analisarMercado(f: FiltrosMercado, signal?: AbortSignal): Promise<AnaliseMercado> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Entre na sua conta para ver a análise de mercado.')
  const qs = new URLSearchParams({ codigos: f.codigos.join(','), de: f.de, ate: f.ate })
  for (const k of ['uf', 'esfera', 'poder', 'modalidade'] as const) if (f[k]) qs.set(k, f[k])
  const r = await fetch(`/api/mercado?${qs}`, { headers: { Authorization: `Bearer ${data.session.access_token}` }, signal })
  const corpo = await r.json().catch(() => null)
  if (!r.ok) throw new Error(corpo?.error ?? 'Não foi possível montar a análise de mercado agora.')
  return corpo as AnaliseMercado
}
