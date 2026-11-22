import type { EstadoModulo, Estados } from './modulos'

/** Um botão ou ação dentro de uma tela que o master pode liberar, testar, deixar em breve ou ocultar. */
export interface RecursoCatalogo {
  id: `recurso-${string}`
  rotulo: string
  /** Tela onde o recurso aparece (vira o grupo no painel master). */
  tela: string
  descricao?: string
}

/**
 * Recursos controláveis, agrupados pela tela. Recurso novo entra aqui e nasce OCULTO para os clientes
 * até o master liberar (igual aos módulos e filtros). Para controlar um botão: <RecursoLiberado id="recurso-...">.
 */
export const CATALOGO_RECURSOS: RecursoCatalogo[] = [
  { id: 'recurso-localizar-edital', tela: 'Oportunidades', rotulo: 'Localizar edital', descricao: 'Atalho que acha um edital pelo número da compra, processo, UASG, código do Compras.gov, CNPJ do órgão ou link do PNCP.' },
  { id: 'recurso-sem-vencedor', tela: 'Oportunidades', rotulo: 'Itens sem vencedor', descricao: 'Editais com itens desertos (ninguém propôs) ou fracassados (nenhuma proposta aceita) nas sessões recentes.' },
  { id: 'recurso-sem-vencedor-portal', tela: 'Oportunidades', rotulo: 'Itens sem vencedor por portal', descricao: 'Escolher o portal (Portal de Compras Públicas, Compras.gov, Compras MG...).' },
  { id: 'recurso-proximas-disputas', tela: 'Oportunidades', rotulo: 'Próximas disputas', descricao: 'Atalhos para editais que ainda vão abrir: hoje, amanhã, 7 e 30 dias, e por portal.' },
  { id: 'recurso-importar-oportunidade', tela: 'Oportunidades', rotulo: 'Adicionar aos processos', descricao: 'Importar um edital da busca para a lista de processos da empresa.' },
  { id: 'recurso-codigo-comprasnet', tela: 'Oportunidades', rotulo: 'Copiar UASG e número da compra', descricao: 'Botões que copiam a UASG e o número da compra do Compras.gov.' },
  { id: 'recurso-inverter-ordem', tela: 'Listas', rotulo: 'Inverter ordem', descricao: 'Botão que inverte a ordem das listas (mais recentes/mais antigas, mais próximas/mais distantes).' },
  { id: 'recurso-exportar-csv', tela: 'Relatórios', rotulo: 'Exportar CSV', descricao: 'Baixar o funil de processos em planilha CSV.' },
]

/** Atalhos de "Itens sem vencedor" por portal, na ordem do menu (id do portal em portais.ts). */
export const ATALHOS_PORTAIS = ['pcp', 'comprasnet', 'mg', 'bll', 'licitanet'] as const

/**
 * Estado efetivo de um recurso para o cliente. Igual aos filtros: enquanto nenhum recurso estiver cadastrado no banco
 * (migração não aplicada) ou a consulta falhar, todos aparecem; depois disso, recurso sem cadastro nasce oculto.
 * "Em teste" já chega resolvido do banco (liberado para as organizações escolhidas, oculto para as demais).
 */
export function estadoRecurso(estados: Estados, id: string): EstadoModulo {
  if (estados === undefined) return 'liberado'
  if (estados === null) return 'oculto'
  if (!Object.keys(estados).some((k) => k.startsWith('recurso-'))) return 'liberado'
  const e = estados[id]
  return e === 'liberado' || e === 'em_breve' ? e : 'oculto'
}
