import { createHash } from 'node:crypto'
// Propostas capturadas pelo botão favorito no Compras.gov.br ficam em atas_enviadas, numa linha por compra
// com este hash fixo (a coluna pede 64 hex). Usado pelas atas (gravação) e pelo histórico de preços (leitura).
export const HASH_PORTAL = createHash('sha256').update('compras.gov.br/propostas').digest('hex')

/** Propostas guardadas das compras pedidas: { idCompra: ItemAta[] }. Falha vira vazio (o histórico segue sem elas). */
export async function propostasGuardadas(base, apikey, token, idsCompra) {
  const ids = [...new Set(idsCompra.filter((id) => /^\d{15,20}$/.test(id)))].slice(0, 400)
  if (!ids.length) return {}
  try {
    const r = await fetch(`${base}/rest/v1/atas_enviadas?hash=eq.${HASH_PORTAL}&id_compra=in.(${ids.join(',')})&select=id_compra,resultado`, { headers: { apikey, Authorization: token }, signal: AbortSignal.timeout(10000) })
    if (!r.ok) return {}
    return Object.fromEntries((await r.json()).map((l) => [l.id_compra, l.resultado?.itens ?? []]))
  } catch { return {} }
}

/** Junta a cada compra do histórico as propostas do mesmo item (todas as colocações, com marca e situação). */
export function comPropostas(compras, guardadas) {
  return compras.map((c) => {
    const item = (guardadas[c.idCompra] ?? []).find((i) => i.tipo === 'item' && i.numero === c.numeroItem)
    if (!item) return c
    const propostas = item.empresas.map((e) => ({
      colocacao: e.colocacao ?? null, fornecedor: e.nome, cnpj: e.cnpj, marca: e.marca ?? null, modelo: e.modelo ?? null, quantidade: e.quantidade ?? null,
      preco: e.valor, precoInicial: e.valorInicial ?? null, situacao: e.adjudicada ? 'vencedora' : e.situacao, motivo: e.motivo,
    })).sort((a, b) => (a.colocacao ?? 9999) - (b.colocacao ?? 9999) || (a.preco ?? Infinity) - (b.preco ?? Infinity))
    return { ...c, propostas }
  })
}
