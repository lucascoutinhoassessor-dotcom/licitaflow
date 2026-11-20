import { supabase } from './supabase'

export interface ResultadoItem {
  controle: string; item: number; data: string | null; uf: string | null; orgaoCnpj: string | null
  quantidade: number | null; valorUnitario: number | null; valorTotal: number | null; meEpp: boolean
}
export interface Sancao { cadastro: string; tipo: string | null; orgao: string | null; inicio: string | null; fim: string | null }
export interface AnaliseEmpresa {
  cnpj: string; de: string; ate: string; incompleto: boolean; nome: string | null; porte: string | null
  itensVencidos: number; editaisVencidos: number; valorHomologado: number; itensComBeneficioMeEpp: number
  porUf: { uf: string; valor: number }[]; principaisOrgaos: { cnpj: string; itens: number; valor: number }[]
  ultimos: ResultadoItem[]; sancoes: Sancao[] | null; sancoesDisponiveis: boolean
}

/** Itens vencidos e sanções de uma empresa, consultados na hora nas fontes oficiais. */
export async function analisarEmpresa(cnpj: string, de: string, ate: string, signal?: AbortSignal): Promise<AnaliseEmpresa> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Entre na sua conta para ver a análise.')
  const qs = new URLSearchParams({ cnpj, de, ate })
  const r = await fetch(`/api/resultados?${qs}`, { headers: { Authorization: `Bearer ${data.session.access_token}` }, signal })
  const corpo = await r.json().catch(() => null)
  if (!r.ok) throw new Error(corpo?.error ?? 'Não foi possível montar a análise agora.')
  return corpo as AnaliseEmpresa
}

/** Converte o número de controle do PNCP (CNPJ-1-SEQ/ANO) no endereço da página do edital. */
export function rotaPorControle(controle: string) {
  const m = /^(\d{14})-\d+-0*(\d+)\/(\d{4})$/.exec(controle)
  return m ? `/app/oportunidades/${m[1]}/${m[3]}/${m[2]}` : null
}
