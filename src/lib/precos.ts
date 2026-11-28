import { supabase } from './supabase'

export interface ItemCatalogo { tipo: 'M' | 'S'; codigo: number; nome: string; classe: string; sinonimo?: boolean }
export interface EstatisticaUnidade { unidade: string; n: number; minimo: number; maximo: number; media: number; mediana: number }
export interface CompraPreco {
  data: string | null; preco: number; quantidade: number | null; unidade: string; descricao: string
  fornecedor: string | null; cnpj: string | null; marca: string | null; orgao: string | null; uasg: string | null
  uf: string | null; municipio: string | null; modalidade: number | null; idCompra: string
  numeroItem: number | null; objeto: string | null; detalhe: string | null; dataCompra: string | null; unidadeCompradora: string | null
  /** Todas as propostas do item (qualquer colocação), quando alguém trouxe a compra do Compras.gov.br pelo botão favorito. */
  propostas?: PropostaPreco[]
}
export interface PropostaPreco {
  colocacao: number | null; fornecedor: string | null; cnpj: string; marca: string | null; modelo: string | null; quantidade?: number | null
  preco: number | null; precoInicial: number | null; situacao: 'vencedora' | 'classificada' | 'participou' | 'recusa' | 'desclassificacao' | 'inabilitacao'; motivo: string | null
}
export interface HistoricoPrecos {
  tipo: 'M' | 'S'; codigo: number; incompleto: boolean; total: number
  unidades: EstatisticaUnidade[]; marcas: { marca: string; n: number }[]; compras: CompraPreco[]
  /** Compras consultadas antes dos filtros (o total já vem filtrado). */
  semFiltro?: number
  /** Valores que existem nas compras consultadas, para os chips dos filtros. */
  opcoes?: { modalidades: { valor: number; n: number }[]; unidades: { valor: string; n: number }[]; municipios: { valor: string; n: number }[] }
}

/** Filtros do histórico que valem sobre as compras consultadas, com as chaves do endereço da página. */
export const CHAVES_FILTRO_PRECO = ['mod', 'un', 'mun', 'org', 'forn', 'marca', 'pmin', 'pmax', 'qmin', 'commarca'] as const
export type FiltrosPreco = Record<(typeof CHAVES_FILTRO_PRECO)[number], string>

/**
 * Nomes do dia a dia que o catálogo do governo chama de outro jeito (ex.: o papel A4 é "PAPEL PARA IMPRESSÃO
 * FORMATADO"; "A4" é só uma característica do item). Esses itens vêm primeiro na busca, marcados como sinônimo.
 */
const SINONIMOS: { termo: RegExp; itens: ItemCatalogo[] }[] = [
  {
    termo: /\b(a4|sulfite|resma|chamex|papel (oficio|para impressao|de impressao|de copia|xerox))\b/,
    itens: [
      { tipo: 'M', codigo: 19746, nome: 'PAPEL PARA IMPRESSÃO FORMATADO', classe: 'PAPEL A4, SULFITE E OFÍCIO' },
      { tipo: 'M', codigo: 126, nome: 'PAPEL CÓPIA', classe: 'PAPEL A4 (MODELO ANTIGO DO CATÁLOGO)' },
    ],
  },
  {
    // O catálogo não tem "smartphone": o celular é "APARELHO TELEFÔNICO CELULAR" (PDM 1243).
    termo: /\b(smart ?phones?|iphones?|celular(es)?|telefones? (celular|movel)|galaxy|redmi|moto g)\b/,
    itens: [
      { tipo: 'M', codigo: 1243, nome: 'APARELHO TELEFÔNICO CELULAR', classe: 'SMARTPHONE E CELULAR' },
      { tipo: 'M', codigo: 13528, nome: 'APARELHO TELEFÔNICO CELULAR / ACESSÓRIOS', classe: 'SMARTPHONE COM ACESSÓRIOS' },
    ],
  },
]
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export function sinonimosDoCatalogo(termo: string, tipo: '' | 'M' | 'S'): ItemCatalogo[] {
  const t = semAcento(termo)
  return SINONIMOS.filter((s) => s.termo.test(t)).flatMap((s) => s.itens).filter((i) => !tipo || i.tipo === tipo).map((i) => ({ ...i, sinonimo: true }))
}

export async function buscarCatalogo(termo: string, tipo: '' | 'M' | 'S', signal?: AbortSignal): Promise<{ data: ItemCatalogo[]; catalogo: { itens: number } }> {
  const p = supabase.rpc('buscar_catalogo', { p_termo: termo, p_tipo: tipo })
  const { data, error } = await (signal ? p.abortSignal(signal) : p)
  if (error) {
    if (['PGRST202', 'PGRST205', '42883'].includes(error.code)) throw new Error('O catálogo de preços está sendo preparado. Tente novamente em instantes.')
    throw new Error('Não foi possível pesquisar o catálogo. Tente novamente.')
  }
  const extras = sinonimosDoCatalogo(termo, tipo)
  if (!extras.length) return data
  const chaves = new Set(extras.map((i) => `${i.tipo}${i.codigo}`))
  return { ...data, data: [...extras, ...(data.data as ItemCatalogo[]).filter((i) => !chaves.has(`${i.tipo}${i.codigo}`))] }
}

export async function historicoPrecos(item: Pick<ItemCatalogo, 'tipo' | 'codigo'>, filtros: Record<string, string>, signal?: AbortSignal): Promise<HistoricoPrecos> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Entre na sua conta para consultar preços.')
  const qs = new URLSearchParams({ tipo: item.tipo, codigo: String(item.codigo) })
  for (const [k, v] of Object.entries(filtros)) if (v) qs.set(k, v)
  // no-cache: as propostas trazidas do Compras.gov.br aparecem logo (o servidor ainda guarda a consulta por 10 min).
  const r = await fetch(`/api/precos?${qs}`, { headers: { Authorization: `Bearer ${data.session.access_token}` }, signal, cache: 'no-cache' })
  const corpo = await r.json().catch(() => null)
  if (!r.ok) throw new Error(corpo?.error ?? 'Não foi possível consultar os preços agora.')
  return corpo as HistoricoPrecos
}

export const MODALIDADES_SIASG: Record<number, string> ={ 1: 'Convite', 2: 'Tomada de preços', 3: 'Concorrência', 4: 'Concurso', 5: 'Pregão eletrônico', 6: 'Dispensa', 7: 'Inexigibilidade', 20: 'Concorrência eletrônica', 22: 'Leilão' }
/** Nome da modalidade (código do Compras.gov) e número/ano da compra a partir do código idCompra (UASG+modalidade+número+ano). */
export function identificacaoCompra(idCompra: string, modalidade: number | null) {
  const m = /^(\d{6})(\d{2})(\d{5})(\d{4})$/.exec(idCompra)
  const nome = MODALIDADES_SIASG[modalidade ?? (m ? Number(m[2]) : 0)] ?? 'Compra'
  return m ? `${nome} Nº ${Number(m[3])}/${m[4]}` : nome
}
/** Pesquisa da marca no Google (abre em nova aba). */
export function linkPesquisaMarca(marca: string, descricao?: string | null) {
  const termo = [marca, (descricao ?? '').split(/[,:]/)[0]].filter(Boolean).join(' ').slice(0, 120)
  return `https://www.google.com/search?q=${encodeURIComponent(termo)}`
}
