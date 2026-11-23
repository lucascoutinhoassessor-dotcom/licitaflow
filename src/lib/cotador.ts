import type { ItemCompra } from './filtrosOportunidades'
import type { EstatisticaUnidade } from './precos'

/** Preço de mercado guardado no item (Painel de Preços, últimos 12 meses). */
export interface MercadoItem {
  unidade: string; n: number; minimo: number; maximo: number; media: number; mediana: number
  consultado_em: string; outra_unidade?: boolean
}

const PALAVRAS_VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com', 'sem', 'a', 'o', 'as', 'os', 'tipo', 'tamanho', 'modelo',
  'aquisicao', 'contratacao', 'fornecimento', 'servico', 'servicos', 'material', 'unidade', 'cor', 'medindo', 'aproximadamente', 'minimo', 'maximo', 'ref', 'marca'])
const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** "UNIDADE (UN)" → "UN"; "Metro" → "M"; "caixa com 10" → "CX". Só para comparar unidades. */
export function unidadeCurta(u: string | null | undefined): string {
  const t = sem(String(u ?? '')).trim()
  const sigla = /\(([a-z0-9]{1,6})\)/.exec(t)?.[1]
  const base = sigla ?? t
  const mapa: Record<string, string> = { unidade: 'UN', und: 'UN', unid: 'UN', un: 'UN', und_: 'UN', peca: 'UN', pc: 'UN', pca: 'UN', metro: 'M', metros: 'M', m: 'M',
    caixa: 'CX', cx: 'CX', pacote: 'PCT', pct: 'PCT', resma: 'RESMA', litro: 'L', litros: 'L', l: 'L', quilograma: 'KG', kg: 'KG', par: 'PAR', rolo: 'RL', rl: 'RL',
    frasco: 'FR', fr: 'FR', galao: 'GL', gl: 'GL', servico: 'SV', sv: 'SV', mes: 'MES', hora: 'H', h: 'H', diaria: 'DIA', dia: 'DIA' }
  const primeira = base.split(/[\s/,-]+/)[0] ?? ''
  return mapa[base] ?? mapa[primeira] ?? base.toUpperCase().slice(0, 12)
}

/** Termo para procurar o item no catálogo: as primeiras palavras que dizem o que é (sem medidas e detalhes). */
export function termoDeBusca(descricao: string, palavras = 3): string {
  const antes = descricao.split(/[,;:(]|\s-\s/)[0] ?? descricao
  return sem(antes).replace(/[^a-z\s]/g, ' ').split(/\s+/)
    .filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p)).slice(0, palavras).join(' ')
}

/** Linha de processo_itens a partir de um item do edital no PNCP. */
export function itemDoEdital(i: ItemCompra) {
  const lote = i.numeroLote ?? i.lote ?? i.numeroGrupo ?? i.grupo
  return {
    numero_item: i.numeroItem,
    lote: lote != null && String(lote) !== '0' ? String(lote) : null,
    descricao: String(i.descricao ?? `Item ${i.numeroItem}`).replace(/\s+/g, ' ').trim().slice(0, 4000),
    unidade: i.unidadeMedida ? unidadeCurta(i.unidadeMedida) : null,
    quantidade: Number(i.quantidade) > 0 ? Number(i.quantidade) : 1,
    valor_ref_unit: i.orcamentoSigiloso ? null : (Number(i.valorUnitarioEstimado) > 0 ? Number(i.valorUnitarioEstimado) : null),
    origem: 'edital' as const,
    catalogo_tipo: i.materialOuServico === 'S' ? ('S' as const) : i.materialOuServico === 'M' ? ('M' as const) : null,
  }
}

/** Estatística do mercado na mesma unidade do item; se não houver, a unidade com mais compras (marcada). */
export function escolherEstatistica(unidades: EstatisticaUnidade[], unidadeItem: string | null): (EstatisticaUnidade & { outra_unidade: boolean }) | null {
  if (!unidades.length) return null
  const alvo = unidadeCurta(unidadeItem)
  const mesma = unidades.filter((u) => unidadeCurta(u.unidade) === alvo).sort((a, b) => b.n - a.n)[0]
  if (mesma) return { ...mesma, outra_unidade: false }
  const maior = [...unidades].sort((a, b) => b.n - a.n)[0]
  return { ...maior, outra_unidade: !!alvo }
}

export type SituacaoPreco = 'competitivo' | 'apertado' | 'prejuizo' | 'sem_custo' | 'sem_dados'
export interface Sugestao { preco: number | null; situacao: SituacaoPreco; texto: string }

/**
 * Preço sugerido para a proposta e quão competitivo é o item.
 * - Proposta: o valor do órgão (teto aceitável); sem ele, a mediana do mercado. Nunca abaixo do seu preço-limite.
 * - Competitivo: o preço-limite (custo + margem) fica abaixo da mediana do mercado, com folga para lances.
 * - Apertado: o limite fica entre a mediana e o valor do órgão. Prejuízo: o limite passa do valor do órgão.
 */
export function sugerirPreco({ referencia, mediana, limite }: { referencia: number | null; mediana: number | null; limite: number | null }): Sugestao {
  const r2 = (v: number) => Math.round(v * 100) / 100
  const base = referencia ?? mediana
  if (base == null) return { preco: limite != null ? r2(limite) : null, situacao: 'sem_dados', texto: 'Sem valor do órgão nem preço de mercado para comparar.' }
  if (limite == null) return { preco: r2(base), situacao: 'sem_custo', texto: 'Informe custo e margem para saber até onde você pode baixar o lance.' }
  if (referencia != null && limite > referencia) {
    return { preco: r2(limite), situacao: 'prejuizo', texto: `Seu preço-limite fica ${pct(limite, referencia)} acima do valor do órgão: não dá para ganhar sem prejuízo.` }
  }
  if (mediana != null && limite > mediana) {
    return { preco: r2(Math.max(base, limite)), situacao: 'apertado', texto: `Seu preço-limite fica ${pct(limite, mediana)} acima da mediana do mercado: pouco espaço para lances.` }
  }
  const folga = mediana != null ? ` Folga de ${pct(mediana, limite)} sobre o seu limite em relação à mediana.` : ''
  return { preco: r2(Math.max(base, limite)), situacao: 'competitivo', texto: `Preço-limite abaixo do mercado e do valor do órgão.${folga}` }
}
const pct = (a: number, b: number) => `${Math.round(((a - b) / b) * 1000) / 10}%`.replace('.', ',')

export const NOME_SITUACAO: Record<SituacaoPreco, { rotulo: string; cor: 'verde' | 'amarelo' | 'vermelho' | 'neutro' | 'azul' }> = {
  competitivo: { rotulo: 'Competitivo', cor: 'verde' }, apertado: { rotulo: 'Apertado', cor: 'amarelo' }, prejuizo: { rotulo: 'Prejuízo', cor: 'vermelho' },
  sem_custo: { rotulo: 'Falta o custo', cor: 'azul' }, sem_dados: { rotulo: 'Sem referência', cor: 'neutro' },
}

export interface LinhaPlanilha { numero_item: number | null; lote: string | null; descricao: string; unidade: string | null; quantidade: number; marca_modelo: string | null; preco: number | null }

/** Planilha da proposta em CSV (separador ";" e vírgula decimal, abre direto no Excel em português). */
export function planilhaProposta(cab: { empresa: string; cnpj: string; processo: string; orgao: string | null }, linhas: LinhaPlanilha[]): string {
  const num = (v: number | null | undefined, casas = 2) => (v == null ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }))
  const campo = (s: string | null | undefined) => {
    let t = String(s ?? '').replace(/\r?\n/g, ' ')
    if (/^[=+\-@\t]/.test(t)) t = `'${t}` // evita fórmula ao abrir no Excel
    return /[";]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const cnpj = cab.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  const total = linhas.reduce((s, l) => s + (l.preco ?? 0) * l.quantidade, 0)
  const saida = [
    `PROPOSTA DE PREÇOS;${campo(cab.processo)}`,
    `Empresa;${campo(cab.empresa)}`, `CNPJ;${cnpj}`, ...(cab.orgao ? [`Órgão;${campo(cab.orgao)}`] : []), '',
    'Item;Lote;Descrição;Unidade;Quantidade;Marca/Modelo;Preço unitário (R$);Preço total (R$)',
    ...linhas.map((l) => [l.numero_item ?? '', campo(l.lote), campo(l.descricao), campo(l.unidade), num(l.quantidade, l.quantidade % 1 ? 4 : 0), campo(l.marca_modelo),
      num(l.preco), num(l.preco != null ? l.preco * l.quantidade : null)].join(';')),
    '', `;;;;;;TOTAL GERAL;${num(total)}`,
  ]
  return '﻿' + saida.join('\r\n')
}
