/**
 * Catálogo dos agentes de IA cobrados por uso. O id é o mesmo gravado em ia_uso.agente e nas chaves de
 * plataforma_planos.limites_ia. Para criar um agente novo, acrescente-o aqui: ele aparece nos planos,
 * na ficha do cliente, no consumo do master e em "Meu plano".
 */
/**
 * tipo 'mensal': o limite é de usos novos por mês (renova no dia 1º).
 * tipo 'simultaneo': o limite é de itens acompanhados ao mesmo tempo (ex.: processos vigiados pela Sentinela).
 * O modelo de IA de cada agente fica no servidor (MODELOS em server/agentes.js).
 */
export interface AgenteIA { id: string; nome: string; unidade: string; tipo: 'mensal' | 'simultaneo'; semContagem?: boolean }
export const AGENTES_IA: AgenteIA[] = [
  { id: 'leitor-editais', nome: 'Leitor de editais', unidade: 'leituras', tipo: 'mensal' },
  { id: 'sentinela', nome: 'Sentinela', unidade: 'processos vigiados', tipo: 'simultaneo' },
  { id: 'radar', nome: 'Radar', unidade: 'empresas monitoradas', tipo: 'simultaneo' },
  { id: 'cotador', nome: 'Cotador', unidade: 'processos cotados', tipo: 'mensal' },
  // Consulta sem custo: não conta uso; o plano só define se está incluído (sem limite) ou não (0).
  { id: 'termometro', nome: 'Termômetro de Pagamento', unidade: 'consultas', tipo: 'mensal', semContagem: true },
]
export const nomeAgente = (id: string) => AGENTES_IA.find((a) => a.id === id)?.nome ?? id
export const agente = (id: string) => AGENTES_IA.find((a) => a.id === id)

/** Limite efetivo de um agente: número, null = sem limite, 0 = fora do plano. */
export interface LimiteIA { limite: number | null; origem: 'plano' | 'cliente'; usadas?: number }

/** Texto curto do limite: "10 por mês", "20 ao mesmo tempo", "Sem limite" ou "Não incluído". */
export function textoLimite(limite: number | null | undefined, tipo: AgenteIA['tipo'] = 'mensal') {
  if (limite === null) return 'Sem limite'
  if (!limite) return 'Não incluído'
  return tipo === 'simultaneo' ? `${limite} ao mesmo tempo` : `${limite} por mês`
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
