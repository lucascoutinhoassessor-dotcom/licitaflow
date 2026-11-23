import { codigoComprasnet, portalCompra } from './portais'
import type { Modalidade } from './dominio'

export interface CompraPNCP {
  usuarioNome?: string
  linkSistemaOrigem?: string | null
  srp?: boolean
  numeroControlePNCP: string
  numeroCompra: string
  anoCompra: number
  sequencialCompra: number
  informacaoComplementar?: string | null
  objetoCompra: string
  modalidadeId: number
  modalidadeNome: string
  orgaoEntidade: { cnpj: string; razaoSocial: string; esferaId?: string; poderId?: string }
  unidadeOrgao: { ufSigla: string; municipioNome: string; codigoIbge?: string }
  valorTotalEstimado: number | null
  dataPublicacaoPncp: string | null
  dataAberturaProposta: string | null
  dataEncerramentoProposta: string | null
  /** Preenchidos pelo catálogo indexado quando conhecidos. */
  modoDisputaId?: number
  materialOuServico?: 'M' | 'S' | 'MS'
  /** true quando o tipo foi deduzido do objeto (itens ainda não coletados). */
  tipoEstimado?: boolean
}

export interface FiltrosPNCP { inicio: string; fim: string; modalidade: string; uf: string; situacao?: 'abertas' | 'publicacoes' }

/** Endereço interno (no LicitaForce) da página de um edital. */
export function rotaOportunidade(c: Pick<CompraPNCP, 'orgaoEntidade' | 'anoCompra' | 'sequencialCompra'>) {
  return `/app/oportunidades/${c.orgaoEntidade.cnpj}/${c.anoCompra}/${c.sequencialCompra}`
}

export function linkCompra(c: CompraPNCP) {
  return `https://pncp.gov.br/app/editais/${encodeURIComponent(c.orgaoEntidade.cnpj)}/${c.anoCompra}/${c.sequencialCompra}`
}

export function dadosProcesso(c: CompraPNCP, empresaId: string) {
  const modalidades: Record<number, Modalidade> = { 4: 'concorrencia_eletronica', 5: 'concorrencia', 6: 'pregao_eletronico', 7: 'pregao_presencial', 8: 'dispensa', 9: 'inexigibilidade' }
  // O PNCP informa dispensa sem garantir que a disputa seja eletrônica.
  return {
    empresa_id: empresaId, etapa: 'captacao', prioridade: 'media',
    modalidade: modalidades[c.modalidadeId] ?? 'outra',
    numero: codigoComprasnet(c)?.numero ?? c.numeroCompra, uasg: codigoComprasnet(c)?.uasg ?? null, objeto: c.objetoCompra,
    orgao_nome: c.orgaoEntidade.razaoSocial, orgao_cnpj: c.orgaoEntidade.cnpj,
    uf: c.unidadeOrgao?.ufSigla ?? null, municipio: c.unidadeOrgao?.municipioNome ?? null,
    pncp_controle: c.numeroControlePNCP, portal: portalCompra(c)[1], link_edital: linkCompra(c),
    valor_estimado: c.valorTotalEstimado, data_publicacao: c.dataPublicacaoPncp,
    data_abertura: c.dataAberturaProposta, data_limite_proposta: c.dataEncerramentoProposta,
  }
}
