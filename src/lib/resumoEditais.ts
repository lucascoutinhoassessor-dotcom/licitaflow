export interface ResumoEditais {
  data: string; editais: number; itens: number; editaisComItens: number; servicos: number; materiais: number;
  ate50mil: number; ate250mil: number; acima250mil: number; atualizadoEm: string | null;
  cargaCompleta: boolean; pausadoAte: string | null;
  /** Campos novos: opcionais para aceitar respostas de uma versão anterior do servidor. */
  naoDivulgado?: number; valorTotal?: number; abremHoje?: number; ufs?: { uf: string; n: number }[];
  perfil?: { data: string; compativeis: number; limitado: boolean } | null;
}
export const diaBrasilia = (agora = new Date()) => agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

/** Palavras-chave da empresa no formato da busca (alternativas separadas por ";"), até 10 termos e 300 caracteres. */
export function termosPerfil(palavras: string[] | undefined): string {
  let r = ''
  for (const p of (palavras ?? []).map(p => p.replace(/;/g, ' ').trim()).filter(Boolean).slice(0, 10)) {
    const prox = r ? `${r};${p}` : p
    if (prox.length > 300) break
    r = prox
  }
  return r
}

export function filtrosResumoHoje(parametros: URLSearchParams, dia: string) {
  if (parametros.get('publicadas') !== 'hoje') return null
  const tipo = parametros.get('tipo'), faixa = parametros.get('faixa')
  const uf = parametros.get('uf') ?? '', busca = (parametros.get('busca') ?? '').slice(0, 300).trim()
  const tipoItem: '' | 'M' | 'S' = tipo === 'materiais' ? 'M' : tipo === 'servicos' ? 'S' : ''
  const valores = faixa === 'ate50mil' ? { minimo: '', maximo: '50000' }
    : faixa === 'ate250mil' ? { minimo: '50000.01', maximo: '250000' }
      : faixa === 'acima250mil' ? { minimo: '250000.01', maximo: '' } : { minimo: '', maximo: '' }
  const estado = /^[A-Z]{2}$/.test(uf) ? uf : ''
  return {
    inicio: dia, fim: dia, situacao: 'publicacoes' as const, aberturaDe: '', aberturaAte: '', diasUteis: false, tipoItem, ...valores,
    uf: estado, ufs: estado ? [estado] : [] as string[], ...(busca ? { busca } : {}),
  }
}
