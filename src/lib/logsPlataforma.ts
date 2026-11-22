/** Logs da plataforma (tabela plataforma_logs): criados pelo master; os públicos aparecem para os clientes. */
export interface LogPlataforma { id: string; tipo: 'atualizacao' | 'correcao' | 'incidente' | 'nota'; titulo: string; texto: string; publico: boolean; created_at: string; updated_at: string }
export const TIPOS_LOG: Record<LogPlataforma['tipo'], [string, 'azul' | 'verde' | 'vermelho' | 'neutro']> = {
  atualizacao: ['Atualização', 'azul'], correcao: ['Correção', 'verde'], incidente: ['Incidente', 'vermelho'], nota: ['Nota interna', 'neutro'],
}
