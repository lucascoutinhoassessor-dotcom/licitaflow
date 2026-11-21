import { GRUPOS_NAV, IA, NAV_CONTA, type GrupoNav, type ItemNav } from './navegacao'

export type EstadoModulo = 'liberado' | 'teste' | 'em_breve' | 'oculto'

/** Telas essenciais da conta: sempre disponíveis, não entram no controle de liberação. */
const ESSENCIAIS = new Set(['empresas', 'equipe', 'plano', 'cobrancas', 'avisos', 'suporte', 'configuracoes'])

/** Identificador do módulo a partir da rota: /app/processos → processos, /suporte → suporte. */
export function idModulo(rota: string): string | null {
  const m = rota.match(/^\/(?:app\/)?([a-z0-9-]+)/)
  if (!m || rota === '/app' || rota === '/app/') return null
  return m[1] === 'app' ? null : m[1]
}

export function moduloControlavel(rota: string) {
  const id = idModulo(rota)
  return !!id && !ESSENCIAIS.has(id)
}

export interface ModuloCatalogo { id: string; rotulo: string; grupo: string; descricao?: string; icone: ItemNav['icone'] }

/** Todos os módulos que o master pode liberar, na ordem do menu do cliente. Novos itens do menu entram sozinhos. */
export const CATALOGO_MODULOS: ModuloCatalogo[] = [
  ...GRUPOS_NAV.flatMap((g) => g.itens.map((i) => ({ i, grupo: g.rotulo }))),
  { i: IA, grupo: 'Inteligência artificial' },
  ...NAV_CONTA.map((i) => ({ i, grupo: 'Conta' })),
]
  .filter(({ i }) => moduloControlavel(i.rota))
  .map(({ i, grupo }) => ({ id: idModulo(i.rota)!, rotulo: i.rotulo, grupo, descricao: i.descricao, icone: i.icone }))
  // Vários itens do menu na mesma área (/app/juridico/recurso, /app/juridico/impugnacao…) = um módulo só, com o nome do grupo.
  .reduce<ModuloCatalogo[]>((lista, m) => {
    const igual = lista.find((x) => x.id === m.id)
    if (igual) igual.rotulo = igual.grupo
    else lista.push(m)
    return lista
  }, [])

/** Estados recebidos do banco; null = ainda carregando (esconde o controlável); undefined = indisponível (mostra tudo). */
export type Estados = Record<string, string> | null | undefined

/**
 * Estado efetivo. Módulo que ainda não foi cadastrado no banco (um módulo novo, recém-publicado) nasce OCULTO:
 * só aparece para os clientes quando o master liberar em Funcionalidades.
 * Se a consulta falhar (estados undefined), o menu fica como no código para não travar o app.
 */
export function estadoDe(estados: Estados, rota: string): EstadoModulo {
  if (!moduloControlavel(rota)) return 'liberado'
  if (estados === null) return 'oculto'
  if (estados === undefined) return 'liberado'
  const e = estados[idModulo(rota)!]
  return e === 'liberado' || e === 'em_breve' || e === 'teste' ? e : 'oculto'
}

/** Aplica os estados à navegação: oculto some, em breve ganha o selo "em breve". */
export function filtrarItens(itens: ItemNav[], estados: Estados): ItemNav[] {
  return itens.flatMap((i) => {
    const e = estadoDe(estados, i.rota)
    if (e === 'oculto') return []
    if (e === 'em_breve') return [{ ...i, fase: i.fase ?? 'em breve' }]
    // Liberado pelo master: tira o selo "em breve" que vinha fixo no código.
    return [moduloControlavel(i.rota) && estados && estados[idModulo(i.rota)!] === 'liberado' ? { ...i, fase: undefined } : i]
  })
}

export function filtrarGrupos(grupos: GrupoNav[], estados: Estados): GrupoNav[] {
  return grupos.map((g) => ({ ...g, itens: filtrarItens(g.itens, estados) })).filter((g) => g.itens.length > 0)
}
