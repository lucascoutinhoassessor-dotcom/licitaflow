import { filtrosExtras, MODALIDADES, type FiltrosOportunidades } from './filtrosOportunidades'
import type { EstadoModulo, Estados } from './modulos'

/** Um filtro que o master pode liberar, testar, deixar em breve ou ocultar para os clientes. */
export interface FiltroCatalogo {
  id: `filtro-${string}`
  rotulo: string
  descricao?: string
  /** Campos da busca que este filtro controla: voltam ao padrão quando o filtro não está liberado. */
  campos: (keyof FiltrosOportunidades)[]
}

/** Filtros da tela Oportunidades, na ordem em que aparecem para o cliente. Filtro novo entra aqui e nasce oculto. */
export const CATALOGO_FILTROS: FiltroCatalogo[] = [
  { id: 'filtro-uf', rotulo: 'UF', descricao: 'Escolher um estado em vez do Brasil inteiro.', campos: ['uf'] },
  { id: 'filtro-publicacao', rotulo: 'Busca por data de publicação', descricao: 'Alternar de "por data de abertura" para "por data de publicação".', campos: ['situacao'] },
  { id: 'filtro-dias-uteis', rotulo: 'Só dias úteis', descricao: 'Limitar às sessões de segunda a sexta, fora de feriados.', campos: ['diasUteis'] },
  { id: 'filtro-excluir-palavras', rotulo: 'Excluir palavras', descricao: 'Tirar editais que tenham certas palavras no objeto.', campos: ['excluir'] },
  { id: 'filtro-tipo-item', rotulo: 'Tipo de item', descricao: 'Somente materiais ou somente serviços.', campos: ['tipoItem'] },
  { id: 'filtro-modo-disputa', rotulo: 'Modo de disputa', descricao: 'Aberto, fechado, aberto-fechado etc.', campos: ['modosDisputa'] },
  { id: 'filtro-portais', rotulo: 'Portais de compras', descricao: 'Filtrar pelo portal de origem do edital.', campos: ['portais'] },
  { id: 'filtro-modalidades', rotulo: 'Modalidades', descricao: 'Pregão, dispensa, concorrência etc.', campos: ['modalidades'] },
  { id: 'filtro-orgao', rotulo: 'Órgão', descricao: 'Escolher um órgão encontrado na consulta.', campos: ['orgao'] },
  { id: 'filtro-max-itens', rotulo: 'Quantidade máxima de itens', campos: ['maxItens'] },
  { id: 'filtro-valor-total', rotulo: 'Valor total mínimo e máximo', campos: ['minimo', 'maximo'] },
  { id: 'filtro-valor-item', rotulo: 'Valor unitário do item', descricao: 'Faixa de valor unitário dos itens do edital.', campos: ['itemMinimo', 'itemMaximo'] },
  { id: 'filtro-nao-divulgado', rotulo: 'Valor não divulgado', descricao: 'Somente compras com valor total não divulgado ou zerado.', campos: ['naoDivulgado'] },
  { id: 'filtro-me-epp', rotulo: 'Item exclusivo para ME/EPP', campos: ['exclusivo'] },
  { id: 'filtro-excluir-srp', rotulo: 'Excluir registro de preços', campos: ['excluirSrp'] },
]

/** Valor de cada campo quando o filtro não está disponível para o cliente. */
const PADRAO: Partial<FiltrosOportunidades> = { ...filtrosExtras, uf: '', situacao: 'abertas' }

/**
 * Estado efetivo de um filtro. Igual aos módulos: filtro ainda não cadastrado nasce OCULTO.
 * Enquanto o banco não tiver nenhum filtro cadastrado (migração não aplicada) ou a consulta falhar, todos aparecem.
 */
export function estadoFiltro(estados: Estados, id: string): EstadoModulo {
  if (estados === undefined) return 'liberado'
  if (estados === null) return 'oculto'
  if (!Object.keys(estados).some((k) => k.startsWith('filtro-'))) return 'liberado'
  const e = estados[id]
  return e === 'liberado' || e === 'em_breve' ? e : 'oculto'
}

/** Cada modalidade de licitação também é liberada pelo master (id "modalidade-<código PNCP>"), para montar pacotes por cliente. */
export const CATALOGO_MODALIDADES = MODALIDADES.map(([codigo, rotulo]) => ({ id: `modalidade-${codigo}`, codigo: codigo as string, rotulo: rotulo as string }))

/**
 * Estado efetivo de uma modalidade. Enquanto nenhuma modalidade estiver cadastrada no banco (migração não aplicada)
 * ou a consulta falhar, todas ficam liberadas; depois disso, modalidade sem cadastro nasce oculta.
 */
export function estadoModalidade(estados: Estados, codigo: string): EstadoModulo {
  if (estados === undefined) return 'liberado'
  if (estados === null) return 'oculto'
  if (!Object.keys(estados).some((k) => k.startsWith('modalidade-'))) return 'liberado'
  const e = estados[`modalidade-${codigo}`]
  return e === 'liberado' || e === 'em_breve' ? e : 'oculto'
}

/** Códigos das modalidades que o cliente pode pesquisar. */
export function modalidadesLiberadas(estados: Estados): string[] {
  return CATALOGO_MODALIDADES.filter((m) => estadoModalidade(estados, m.codigo) === 'liberado').map((m) => m.codigo)
}

/** Volta ao padrão os campos dos filtros que o cliente não pode usar (ex.: valor guardado de uma busca antiga). */
export function aplicarLiberacao<T extends FiltrosOportunidades>(f: T, estados: Estados): T {
  const r = { ...f }
  for (const filtro of CATALOGO_FILTROS) {
    if (estadoFiltro(estados, filtro.id) === 'liberado') continue
    for (const c of filtro.campos) if (c in PADRAO) (r as Record<string, unknown>)[c] = PADRAO[c]
  }
  // Modalidade não liberada nunca entra na busca, nem quando o cliente não pode escolher modalidades.
  const liberadas = new Set(modalidadesLiberadas(estados))
  r.modalidades = r.modalidades.filter((m) => liberadas.has(m))
  return r
}
