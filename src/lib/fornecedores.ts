import { supabase } from './supabase'

export interface Fornecedor {
  cnpj: string; nome: string; contratos: number; valor_total: number; maior_valor: number
  primeiro: string | null; ultimo: string | null; orgao_ultimo: string | null; ufs: string[]
}
export interface StatusFornecedores {
  dias_planejados: number; dias_coletados: number; paginas_pendentes: number; ultima_coleta_em: string | null
}
export interface ResultadoFornecedores {
  data: Fornecedor[]; totalRegistros: number; totalPaginas: number; status: StatusFornecedores | null
}

export async function pesquisarFornecedores(termo: string, uf: string, pagina: number, signal?: AbortSignal): Promise<ResultadoFornecedores> {
  const pedido = supabase.rpc('buscar_fornecedores', { p_termo: termo, p_uf: uf, p_pagina: pagina })
  const { data, error } = await (signal ? pedido.abortSignal(signal) : pedido)
  if (error) {
    if (signal?.aborted) throw signal.reason
    if (['PGRST202', 'PGRST205', '42883'].includes(error.code)) throw new Error('A análise de empresas está sendo preparada. Tente novamente em instantes.')
    if (error.message?.includes('Informe um nome')) throw new Error('Informe um nome ou CNPJ para pesquisar.')
    throw new Error('Não foi possível pesquisar as empresas. Tente novamente.')
  }
  if (!data || !Array.isArray(data.data) || !Number.isInteger(data.totalRegistros)) throw new Error('A pesquisa retornou uma resposta inesperada.')
  return { ...data, data: data.data.map((f: Fornecedor) => ({ ...f, valor_total: Number(f.valor_total), maior_valor: Number(f.maior_valor) })) } as ResultadoFornecedores
}

/** Página de busca do PNCP com os contratos da empresa (o detalhe não é guardado no LicitaFlow). */
export function linkContratosPNCP(cnpj: string) {
  return `https://pncp.gov.br/app/contratos?q=${encodeURIComponent(cnpj)}`
}
