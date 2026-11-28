/**
 * LicitaForce Pregão ao Vivo: o programa instalado (pasta desktop/) acompanha a sala de disputa com a sessão
 * do próprio usuário e grava os eventos em pav_eventos. O site só lê e assiste em tempo real.
 */
export interface Computador { id: string; nome: string; versao: string | null; sinal_em: string; user_id: string }
export interface SessaoPav {
  id: string; processo_id: string | null; portal: Portal; chave: string; titulo: string | null
  situacao: 'acompanhando' | 'pausada' | 'encerrada'; sinal_em: string; ultimo_evento_em: string | null; created_at: string
  processos?: { objeto: string; numero: string | null } | null
}
export type TipoEvento = 'mensagem' | 'convocacao' | 'fase' | 'lance' | 'posicao' | 'situacao' | 'aviso'
export interface EventoPav {
  id: string; sessao_id: string; tipo: TipoEvento; item: string | null; autor: string | null; texto: string
  prazo: string | null; cita_cliente: boolean; quando: string; created_at: string
}
export type Portal = 'comprasgov' | 'bll' | 'bnc' | 'licitanet' | 'pcp'

export const PORTAIS: Record<Portal, { nome: string; disponivel: boolean }> = {
  comprasgov: { nome: 'Compras.gov.br', disponivel: true },
  bll: { nome: 'BLL Compras', disponivel: false },
  bnc: { nome: 'BNC', disponivel: false },
  licitanet: { nome: 'Licitanet', disponivel: false },
  pcp: { nome: 'Portal de Compras Públicas', disponivel: false },
}

export const ROTULO_EVENTO: Record<TipoEvento, string> = {
  mensagem: 'Mensagem', convocacao: 'Convocação', fase: 'Fase do item', lance: 'Lance', posicao: 'Posição', situacao: 'Sessão', aviso: 'Aviso',
}

/** Instalador publicado nas versões do GitHub (o programa se atualiza sozinho a partir de lá). */
export const LINK_DOWNLOAD = 'https://github.com/lucascoutinhoassessor-dotcom/licitaflow/releases/latest'

/** O programa manda sinal a cada minuto; até 3 minutos sem sinal ainda conta como conectado. */
export function conectado(sinal: string | null | undefined, agora = Date.now()) {
  if (!sinal) return false
  const t = new Date(sinal).getTime()
  return Number.isFinite(t) && agora - t < 3 * 60_000
}

/** Eventos que pedem atenção do usuário (destacados na linha do tempo). */
export function importante(e: Pick<EventoPav, 'tipo' | 'autor' | 'cita_cliente' | 'texto'>) {
  return e.tipo === 'convocacao' || e.tipo === 'situacao' || e.cita_cliente || (e.tipo === 'mensagem' && e.autor === 'Pregoeiro') ||
    (e.tipo === 'fase' && /aleat|encerr|aceit|habilit|recurso|suspens|desempate|adjudic|negocia/i.test(e.texto))
}

/** Junta eventos novos (tempo real) aos já carregados, sem repetir, do mais novo para o mais antigo. */
export function juntarEventos(atuais: EventoPav[], novos: EventoPav[], limite = 300) {
  const vistos = new Set<string>()
  return [...novos, ...atuais]
    .filter((e) => (vistos.has(e.id) ? false : (vistos.add(e.id), true)))
    .sort((a, b) => b.quando.localeCompare(a.quando) || b.created_at.localeCompare(a.created_at))
    .slice(0, limite)
}
