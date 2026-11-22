import { supabase } from './supabase'
import type { CompraPNCP } from './pncp'
import type { ItemCompra } from './filtrosOportunidades'

/** Código da compra no Compras.gov (UASG+modalidade+número+ano), tirado do link de origem do edital. */
export function idCompraComprasnet(c: Pick<CompraPNCP, 'linkSistemaOrigem'>) {
  try {
    const codigo = new URL(c.linkSistemaOrigem ?? '').searchParams.get('compra') ?? ''
    return /^\d{17}$/.test(codigo) ? codigo : null
  } catch { return null }
}

/** Número do grupo de cada item no Compras.gov (o PNCP não publica). Falha vira "sem grupos". */
export async function gruposDaCompra(idCompra: string, signal?: AbortSignal): Promise<Record<string, number>> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) return {}
  const r = await fetch(`/api/compra?so=grupos&idCompra=${encodeURIComponent(idCompra)}`, { headers: { Authorization: `Bearer ${data.session.access_token}` }, signal })
  const corpo = await r.json().catch(() => null)
  return r.ok && corpo?.grupos && typeof corpo.grupos === 'object' ? corpo.grupos : {}
}

/** Uma colocação homologada de um item (PNCP). Ordem 1 = vencedora; 2, 3... = cadastro de reserva do registro de preço. */
export interface ColocacaoItem { item: number; cnpj: string; nome: string | null; ordem: number | null; valorUnitario: number | null; valorTotal: number | null }

const MAX_ITENS = 60

/** Resultados homologados dos itens que já têm resultado, direto do PNCP (até 60 itens, 6 por vez). */
export async function resultadosDoEdital(c: CompraPNCP, itens: ItemCompra[], signal?: AbortSignal): Promise<ColocacaoItem[]> {
  const alvo = itens.filter((i) => i.temResultado).slice(0, MAX_ITENS)
  const base = `https://pncp.gov.br/api/pncp/v1/orgaos/${encodeURIComponent(c.orgaoEntidade.cnpj)}/compras/${c.anoCompra}/${c.sequencialCompra}/itens`
  const saida: ColocacaoItem[] = []
  for (let k = 0; k < alvo.length; k += 6) {
    const lotes = await Promise.all(alvo.slice(k, k + 6).map(async (i) => {
      try {
        const r = await fetch(`${base}/${i.numeroItem}/resultados`, { signal })
        if (!r.ok) return []
        const lista = await r.json()
        return Array.isArray(lista) ? lista : []
      } catch (e) { if (signal?.aborted) throw e; return [] }
    }))
    for (const lista of lotes) for (const r of lista) {
      if (r?.dataCancelamento || !/^\d{14}$/.test(String(r?.niFornecedor ?? ''))) continue
      saida.push({
        item: Number(r.numeroItem), cnpj: String(r.niFornecedor), nome: r.nomeRazaoSocialFornecedor ?? null,
        ordem: Number.isInteger(r.ordemClassificacaoSrp) ? r.ordemClassificacaoSrp : null,
        valorUnitario: Number(r.valorUnitarioHomologado) || null, valorTotal: Number(r.valorTotalHomologado) || null,
      })
    }
  }
  return saida
}
