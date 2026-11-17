import type { CompraPNCP } from './pncp'

export const PORTAIS = [
  ['comprasnet', 'Comprasnet', ['compras.gov.br','comprasnet.gov.br','serpro.gov.br'], ['compras.gov.br','comprasnet']],
  ['pcp', 'Portal de Compras Públicas', ['portaldecompraspublicas.com.br'], ['portal de compras publicas']],
  ['licitacoes-e', 'Licitações-e', ['licitacoes-e.com.br'], ['licitacoes-e']],
  ['caixa', 'Licitações Caixa', ['licitacoes.caixa.gov.br'], ['licitacoes caixa']],
  ['banrisul', 'Banrisul', ['banrisul.com.br'], ['banrisul']],
  ['rs', 'Compras RS', ['compras.rs.gov.br'], ['compras rs']],
  ['bahia', 'Compras Bahia', ['comprasnet.ba.gov.br'], ['compras bahia']],
  ['amazonas', 'Compras Amazonas', ['e-compras.am.gov.br'], ['compras amazonas']],
  ['goias', 'Comprasnet Goiás', ['comprasnet.go.gov.br','sislog.go.gov.br'], ['comprasnet goias','sislog']],
  ['rj', 'Compras RJ', ['compras.rj.gov.br'], ['compras rj','siga rj']],
  ['recife', 'Compras Recife', ['recife.pe.gov.br'], ['compras recife']],
  ['licitanet', 'Licitanet', ['licitanet.com.br'], ['licitanet']],
  ['bll', 'BLL Compras', ['bll.org.br','bllcompras.com'], ['bll compras','bolsa de licitacoes e leiloes']],
  ['elic', 'Portal e-LIC · Santa Catarina', ['elic.sc.gov.br','portaldecompras.sc.gov.br'], ['e-lic','compras santa catarina']],
  ['procergs', 'Procergs', ['procergs.com.br','procergs.rs.gov.br'], ['procergs']],
  ['mg', 'Compras Minas Gerais', ['compras.mg.gov.br'], ['compras minas gerais']],
  ['banpara', 'Banpará', ['banpara.b.br'], ['banpara']],
  ['pe', 'PE Integrado', ['peintegrado.pe.gov.br'], ['pe integrado']],
  ['bnc', 'BNC', ['bnc.org.br'], ['bolsa nacional de compras','bnc']],
  ['outros', 'Outros portais', [], []],
] as const
export const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
export function urlOrigem(c: CompraPNCP): string | null {
  try { const u = new URL(c.linkSistemaOrigem ?? ''); return u.protocol === 'https:' ? u.href : null } catch { return null }
}
export function portalCompra(c: CompraPNCP) {
  const origem = urlOrigem(c), host = origem ? new URL(origem).hostname : ''
  // URL do edital tem precedência sobre o nome do publicador, que pode atender vários portais.
  return PORTAIS.find(p => p[2].some(d => host === d || host.endsWith(`.${d}`)))
    ?? PORTAIS.find(p => p[3].some(n => normalizar(c.usuarioNome ?? '').includes(n)))
    ?? PORTAIS[PORTAIS.length - 1]
}

export function rotuloPortal(portal: string | null | undefined) {
  return portal?.trim().toUpperCase() === 'PNCP' ? 'Fonte oficial de compras' : portal
}
