import { portalCompra } from './portais'
import type { Modalidade } from './dominio'

export interface CompraPNCP {
  usuarioNome?: string
  linkSistemaOrigem?: string | null
  srp?: boolean
  numeroControlePNCP: string
  numeroCompra: string
  anoCompra: number
  sequencialCompra: number
  objetoCompra: string
  modalidadeId: number
  modalidadeNome: string
  orgaoEntidade: { cnpj: string; razaoSocial: string }
  unidadeOrgao: { ufSigla: string; municipioNome: string }
  valorTotalEstimado: number | null
  dataPublicacaoPncp: string | null
  dataAberturaProposta: string | null
  dataEncerramentoProposta: string | null
}

export interface FiltrosPNCP { inicio: string; fim: string; modalidade: string; uf: string }

export function urlConsulta(f: FiltrosPNCP, pagina: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(f.fim) || f.inicio > f.fim) {
    throw new Error('Informe um período válido de publicação.')
  }
  const p = new URLSearchParams({ dataInicial: f.inicio.replace(/-/g, ''), dataFinal: f.fim.replace(/-/g, ''), codigoModalidadeContratacao: f.modalidade, pagina: String(pagina), tamanhoPagina: '50' })
  if (f.uf) p.set('uf', f.uf)
  return `https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?${p}`
}

export async function consultarPNCP(f: FiltrosPNCP, pagina: number, signal?: AbortSignal): Promise<{ data: CompraPNCP[]; totalPaginas: number; totalRegistros: number }> {
  const r = await fetch(urlConsulta(f, pagina), { signal })
  if (r.status === 204) return { data: [], totalPaginas: 0, totalRegistros: 0 }
  if (!r.ok) throw new Error('A fonte de oportunidades não respondeu à consulta. Tente novamente em alguns instantes.')
  const dados = await r.json()
  if (!Array.isArray(dados.data)) throw new Error('A fonte de oportunidades retornou uma resposta inesperada. Tente novamente.')
  return dados
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
    numero: c.numeroCompra, objeto: c.objetoCompra,
    orgao_nome: c.orgaoEntidade.razaoSocial, orgao_cnpj: c.orgaoEntidade.cnpj,
    uf: c.unidadeOrgao?.ufSigla ?? null, municipio: c.unidadeOrgao?.municipioNome ?? null,
    pncp_controle: c.numeroControlePNCP, portal: portalCompra(c)[1], link_edital: linkCompra(c),
    valor_estimado: c.valorTotalEstimado, data_publicacao: c.dataPublicacaoPncp,
    data_abertura: c.dataAberturaProposta, data_limite_proposta: c.dataEncerramentoProposta,
  }
}
