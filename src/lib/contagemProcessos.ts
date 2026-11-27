// Regra única de contagem e soma de processos (Kanban e painel inicial).
// Processo arquivado continua visível onde o app mostra arquivados, mas nunca entra na quantidade nem no valor total.

type ProcessoContavel = { arquivado_em: string | null; valor_estimado: number | null }

/** Arquivado fica fora de qualquer contagem ou soma. */
export const contaNoTotal = (p: Pick<ProcessoContavel, 'arquivado_em'>) => !p.arquivado_em

/** Só os processos que contam (sem os arquivados). */
export const semArquivados = <T extends Pick<ProcessoContavel, 'arquivado_em'>>(lista: readonly T[]): T[] => lista.filter(contaNoTotal)

/** Quantidade e valor estimado somado, ignorando os arquivados. */
export function resumoProcessos(lista: readonly ProcessoContavel[]): { quantidade: number; total: number } {
  const validos = semArquivados(lista)
  return { quantidade: validos.length, total: validos.reduce((a, p) => a + (p.valor_estimado ?? 0), 0) }
}
