import type { AtasCompra, TipoOcorrencia } from './atas'
import type { ItemCompraFederal } from './compraFederal'

// Todas as empresas que disputaram um item (ou o grupo/lote dele), juntando:
// - resultados homologados (vencedora e cadastro de reserva, com colocação e valores);
// - resultados cancelados (com o motivo publicado);
// - desclassificadas, inabilitadas, recusadas e sem proposta lidas nas atas do PNCP, quando a ata cita o item ou o grupo;
// - empresas por item lidas no termo de julgamento enviado pelo usuário (valor, situação e motivo de cada uma);
// - todas as propostas de cada item capturadas no Compras.gov.br pelo botão favorito (fonte 'portal', a mais completa);
// - demais empresas citadas na ata, que só se ligam ao item quando a compra tem um item (ou um grupo) só.

export type SituacaoConcorrente = 'vencedora' | 'classificada' | 'cancelado' | TipoOcorrencia | 'participou'

export interface Concorrente {
  chave: string; cnpj: string | null; nome: string | null; porte: string | null; meEpp: boolean
  colocacao: number | null; valorUnitario: number | null; valorTotal: number | null
  situacao: SituacaoConcorrente; motivo: string | null; fonte: 'oficial' | 'ata' | 'portal'
  marca?: string | null; valorInicial?: number | null
}

/** "Itens 1, 3 a 5" → { tipo: 'item', numeros: {1,3,4,5} }. Lote e grupo viram 'grupo'. */
export function numerosCitados(texto: string | null): { tipo: 'item' | 'grupo'; numeros: Set<number> } | null {
  if (!texto) return null
  const m = /^(ite(?:m|ns)|lotes?|grupos?)\s+(.+)$/i.exec(texto.trim())
  if (!m) return null
  const numeros = new Set<number>()
  for (const parte of m[2].split(/\s*(?:,|\be\b)\s*/)) {
    const faixa = /^(\d{1,4})\s*(?:a|-|até)\s*(\d{1,4})$/i.exec(parte.trim())
    if (faixa) {
      const [a, b] = [Number(faixa[1]), Number(faixa[2])]
      if (b >= a && b - a <= 500) for (let n = a; n <= b; n++) numeros.add(n)
    } else if (/^\d{1,4}$/.test(parte.trim())) numeros.add(Number(parte))
  }
  return numeros.size ? { tipo: /^ite/i.test(m[1]) ? 'item' : 'grupo', numeros } : null
}

/** A ocorrência fala deste item? Pelo número do item ou do grupo/lote; sem indicação, só se a compra tem um item/grupo. */
function citaItem(itens: string | null, item: ItemCompraFederal, unico: boolean): boolean | null {
  const c = numerosCitados(itens)
  if (!c) return unico ? true : null
  if (c.tipo === 'item') return c.numeros.has(item.numero)
  return item.grupo != null && item.grupo > 0 ? c.numeros.has(item.grupo) : unico
}

const so = (s: string | null) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const PRIORIDADE: Record<SituacaoConcorrente, number> = { vencedora: 0, classificada: 1, recusa: 2, desclassificacao: 3, inabilitacao: 4, cancelado: 5, sem_proposta: 6, participou: 7 }

/**
 * Concorrentes do item, em ordem: vencedora, classificadas pela colocação, recusadas, desclassificadas,
 * inabilitadas, canceladas, sem proposta. `semItem` são empresas da ata que não dá para ligar ao item.
 */
export function concorrentesDoItem(item: ItemCompraFederal, todos: ItemCompraFederal[], atas?: AtasCompra | null): { lista: Concorrente[]; semItem: Concorrente[] } {
  const grupos = new Set(todos.map((i) => (i.grupo && i.grupo > 0 ? `g${i.grupo}` : `i${i.numero}`)))
  const unico = grupos.size <= 1
  const lista: Concorrente[] = []
  // Mesmo CNPJ; sem CNPJ de um dos lados, nome contido no outro (a ata costuma abreviar a razão social).
  const mesmoNome = (a: string | null, b: string | null) => { const [x, y] = [so(a), so(b)]; return x.length >= 5 && y.length >= 5 && (x.includes(y) || y.includes(x)) }
  const achar = (cnpj: string | null, nome: string | null) =>
    lista.find((c) => (cnpj && c.cnpj ? c.cnpj === cnpj : mesmoNome(c.nome, nome)))

  item.resultados.forEach((r, i) => {
    const colocacao = r.ordem ?? (item.resultados.length === 1 ? 1 : i + 1)
    lista.push({ chave: `r${i}`, cnpj: r.cnpj, nome: r.fornecedor, porte: r.porte, meEpp: r.meEpp, colocacao, valorUnitario: r.valorUnitario, valorTotal: r.valorTotal, situacao: colocacao === 1 ? 'vencedora' : 'classificada', motivo: null, fonte: 'oficial' })
  })
  ;(item.cancelados ?? []).forEach((r, i) => {
    if (achar(r.cnpj, r.fornecedor)) return
    lista.push({ chave: `c${i}`, cnpj: r.cnpj, nome: r.fornecedor, porte: r.porte, meEpp: r.meEpp, colocacao: null, valorUnitario: r.valorUnitario, valorTotal: r.valorTotal, situacao: 'cancelado', motivo: r.motivoCancelamento ?? null, fonte: 'oficial' })
  })

  const semItem: Concorrente[] = []
  const vistosSemItem = new Set<string>(), deOutroItem = new Set<string>()
  const juntar = (cnpj: string | null, nome: string | null, tipo: TipoOcorrencia, itens: string | null, motivo: string, colocacao: number | null = null) => {
    const cita = citaItem(itens, item, unico)
    if (cita === false) { if (cnpj) deOutroItem.add(cnpj); return }
    if (cita === null) {
      const k = cnpj ?? so(nome)
      if (k && !vistosSemItem.has(k)) { vistosSemItem.add(k); semItem.push({ chave: `s${k}`, cnpj, nome, porte: null, meEpp: false, colocacao: null, valorUnitario: null, valorTotal: null, situacao: tipo, motivo, fonte: 'ata' }) }
      return
    }
    const atual = achar(cnpj, nome)
    if (atual) {
      // O resultado oficial vale mais que a leitura da ata (a empresa pode ter caído em outra fase e voltado no recurso).
      if (atual.fonte === 'oficial' || atual.fonte === 'portal') return
      if (PRIORIDADE[tipo] < PRIORIDADE[atual.situacao]) atual.situacao = tipo
      atual.motivo ??= motivo
      return
    }
    lista.push({ chave: `a${lista.length}`, cnpj, nome, porte: null, meEpp: false, colocacao, valorUnitario: null, valorTotal: null, situacao: tipo, motivo, fonte: 'ata' })
  }

  // Termo de julgamento enviado: seção do próprio item (ou do grupo dele) traz todas as propostas com valor.
  // Propostas do portal primeiro: são o registro oficial da disputa, e a leitura de PDF só completa o que faltar.
  const secoes = [...(atas?.itens ?? [])].sort((a, b) => Number(b.fonte === 'portal') - Number(a.fonte === 'portal'))
  for (const sec of secoes) {
    const portal = sec.fonte === 'portal'
    const doItem = sec.tipo === 'item' ? sec.numero === item.numero : item.grupo != null && item.grupo > 0 ? sec.numero === item.grupo : unico
    for (const e of sec.empresas) {
      if (!doItem) { deOutroItem.add(e.cnpj); continue }
      const atual = achar(e.cnpj, e.nome)
      if (atual) {
        if (atual.fonte === 'oficial' || atual.fonte === 'portal') { atual.marca ??= e.marca ?? null; atual.valorInicial ??= e.valorInicial ?? null; continue }
        if (e.situacao !== 'participou' && e.situacao !== 'classificada' && PRIORIDADE[e.situacao] > PRIORIDADE[atual.situacao]) atual.situacao = e.situacao
        atual.valorUnitario ??= e.valor
        atual.motivo ??= e.motivo
        continue
      }
      lista.push({ chave: `t${lista.length}`, cnpj: e.cnpj, nome: e.nome, porte: portal && e.meEpp ? 'ME/EPP' : null, meEpp: false, colocacao: e.colocacao ?? null, valorUnitario: e.valor, valorTotal: e.valorTotal ?? null, situacao: portal && e.adjudicada ? 'vencedora' : e.situacao, motivo: e.motivo, fonte: portal ? 'portal' : 'ata', marca: e.marca ?? null, valorInicial: e.valorInicial ?? null })
    }
  }
  for (const c of lista) if (c.cnpj) deOutroItem.delete(c.cnpj)

  for (const p of atas?.participantes ?? []) for (const s of p.situacoes ?? []) juntar(p.cnpj, p.nome, s.tipo, s.itens, s.motivo)
  for (const o of atas?.ocorrencias ?? []) if (o.empresa || o.cnpj) juntar(o.cnpj, o.empresa, o.tipo, o.itens, o.motivo)

  // Demais citadas na ata, sem situação: concorrentes do item só quando a compra tem um item/grupo.
  for (const p of atas?.participantes ?? []) {
    if (achar(p.cnpj, p.nome) || vistosSemItem.has(p.cnpj) || deOutroItem.has(p.cnpj)) continue
    const c: Concorrente = { chave: `p${p.cnpj}`, cnpj: p.cnpj, nome: p.nome, porte: null, meEpp: false, colocacao: unico ? p.colocacao ?? null : null, valorUnitario: null, valorTotal: null, situacao: unico && p.colocacao ? 'classificada' : 'participou', motivo: null, fonte: 'ata' }
    if (unico) lista.push(c)
    else { vistosSemItem.add(p.cnpj); semItem.push(c) }
  }

  lista.sort((a, b) => PRIORIDADE[a.situacao] - PRIORIDADE[b.situacao] || (a.colocacao ?? 999) - (b.colocacao ?? 999) || (a.valorUnitario ?? Infinity) - (b.valorUnitario ?? Infinity))
  return { lista, semItem }
}
