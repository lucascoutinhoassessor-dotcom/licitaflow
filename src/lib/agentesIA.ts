/**
 * Catálogo dos agentes de IA cobrados por uso. O id é o mesmo gravado em ia_uso.agente e nas chaves de
 * plataforma_planos.limites_ia. Para criar um agente novo, acrescente-o aqui: ele aparece nos planos,
 * na ficha do cliente, no consumo do master e em "Meu plano".
 */
export interface AgenteIA { id: string; nome: string; unidade: string }
export const AGENTES_IA: AgenteIA[] = [
  { id: 'leitor-editais', nome: 'Leitor de editais', unidade: 'leituras' },
]
export const nomeAgente = (id: string) => AGENTES_IA.find((a) => a.id === id)?.nome ?? id

/** Limite efetivo de um agente: número por mês, null = sem limite, 0 = fora do plano. */
export interface LimiteIA { limite: number | null; origem: 'plano' | 'cliente'; usadas?: number }

/** Texto curto do limite: "10 por mês", "Sem limite" ou "Não incluído". */
export function textoLimite(limite: number | null | undefined) {
  if (limite === null) return 'Sem limite'
  if (!limite) return 'Não incluído'
  return `${limite} por mês`
}

/** Limite do plano para o agente (chave ausente = 0). */
export function limiteDoPlano(limites: Record<string, number | null> | null | undefined, agente: string): number | null {
  if (!limites || !(agente in limites)) return 0
  return limites[agente]
}

/** Campo de formulário → limite: vazio = sem limite (null); senão inteiro ≥ 0. undefined = inválido. */
export function lerLimite(texto: string): number | null | undefined {
  const t = texto.trim()
  if (t === '') return null
  if (!/^\d{1,7}$/.test(t)) return undefined
  return Number(t)
}
