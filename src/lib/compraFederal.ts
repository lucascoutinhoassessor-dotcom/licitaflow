import { supabase } from './supabase'

export interface ResultadoItemFederal {
  fornecedor: string | null; cnpj: string | null; porte: string | null; quantidade: number | null
  valorUnitario: number | null; valorTotal: number | null; ordem: number | null; meEpp: boolean; desconto: number | null; situacao: string | null
}
export interface ItemCompraFederal {
  numero: number; descricao: string; resumo: string | null; tipo: string | null; quantidade: number | null; unidade: string | null
  valorEstimado: number | null; sigiloso: boolean; situacao: string | null; criterio: string | null; beneficio: string | null
  grupo: number | null; marca: string | null; resultados: ResultadoItemFederal[]
}
export interface CompraFederal {
  idCompra: string | null; controle: string | null; objeto: string | null; orgao: string | null; unidade: string | null
  uf: string | null; municipio: string | null; modalidade: string | null; numero: string | null; ano: number | null; srp: boolean | null
  situacao: string | null; valorEstimado: number | null; valorHomologado: number | null; abertura: string | null
  encerramento: string | null; publicacao: string | null; itens: ItemCompraFederal[]
}

/** Compra federal completa (itens, vencedores, marcas), consultada na hora nos dados abertos. */
export async function abrirCompra(idCompra: string, signal?: AbortSignal): Promise<CompraFederal> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Entre na sua conta para ver a compra.')
  const r = await fetch(`/api/compra?idCompra=${encodeURIComponent(idCompra)}`, { headers: { Authorization: `Bearer ${data.session.access_token}` }, signal })
  const corpo = await r.json().catch(() => null)
  if (!r.ok) throw new Error(corpo?.error ?? 'Não foi possível abrir a compra agora.')
  return corpo as CompraFederal
}

/** Página pública de acompanhamento da compra no Compras.gov.br. */
export function linkCompraComprasGov(idCompra: string) {
  return `https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra?compra=${encodeURIComponent(idCompra)}`
}

/** Número de controle do PNCP de uma compra federal (para abrir a página do edital). */
export async function controleDaCompra(idCompra: string, signal?: AbortSignal): Promise<string> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Entre na sua conta.')
  const r = await fetch(`/api/compra?so=controle&idCompra=${encodeURIComponent(idCompra)}`, { headers: { Authorization: `Bearer ${data.session.access_token}` }, signal })
  const corpo = await r.json().catch(() => null)
  if (!r.ok || !corpo?.controle) throw new Error(corpo?.error ?? 'Não foi possível abrir o edital desta compra.')
  return corpo.controle as string
}
