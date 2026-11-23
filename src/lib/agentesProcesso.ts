/**
 * Estado real de cada agente de IA num processo, calculado no banco (agentes_estado_processos):
 * leva em conta o módulo "agentes" liberado, o limite do plano, a opção do processo e o que o agente já fez.
 */
export type EstadoAgente = 'ativo' | 'na_fila' | 'falha' | 'parado' | 'desligado' | 'indisponivel'
export interface StatusAgente { estado: EstadoAgente; motivo: string; verificado_em?: string; proxima_em?: string; alterado_em?: string; lido_em?: string }
/** processo_id → agente → status */
export type EstadosAgentes = Record<string, Record<string, StatusAgente>>

/** Como cada agente aparece no cartão. Para um agente novo, acrescente aqui o rótulo de cada estado. */
export const ROTULOS: Record<string, Partial<Record<EstadoAgente, string>>> = {
  sentinela: { ativo: 'Monitorando com IA', na_fila: 'Monitoramento ligado', falha: 'Monitoramento com falha', parado: 'Monitoramento parado' },
  'leitor-editais': { ativo: 'Edital lido pela IA' },
  radar: { ativo: 'Encontrado pelo Radar' },
  cotador: { ativo: 'Cotação em andamento' },
}

/** Estados que aparecem no cartão. Desligado e indisponível ficam só no menu, para não poluir o Kanban. */
export const visivelNoCartao = (s?: StatusAgente) => !!s && ['ativo', 'na_fila', 'falha', 'parado'].includes(s.estado)

/** Cor do selo: verde trabalhando, azul na fila, âmbar com problema. */
export function corDoEstado(e: EstadoAgente): 'verde' | 'azul' | 'ambar' | 'cinza' {
  if (e === 'ativo') return 'verde'
  if (e === 'na_fila') return 'azul'
  if (e === 'falha' || e === 'parado') return 'ambar'
  return 'cinza'
}

/** "há 5 min", "há 3 h", "há 2 dias". */
export function haQuanto(iso?: string, agora = Date.now()) {
  if (!iso) return ''
  const min = Math.max(0, Math.round((agora - Date.parse(iso)) / 60e3))
  if (min < 1) return 'agora há pouco'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  return `há ${Math.round(h / 24)} dia${Math.round(h / 24) > 1 ? 's' : ''}`
}

/** Texto de ajuda do selo (aparece ao passar o mouse e no menu do cartão). */
export function detalheDoEstado(s: StatusAgente, agora = Date.now()) {
  if (s.estado === 'ativo' && s.verificado_em) return `${s.motivo} · verificado ${haQuanto(s.verificado_em, agora)}`
  if (s.estado === 'ativo' && s.lido_em) return `${s.motivo} ${haQuanto(s.lido_em, agora)}`
  return s.motivo
}
