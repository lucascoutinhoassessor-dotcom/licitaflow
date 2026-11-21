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
    ?? PORTAIS.flatMap(p=>p[3].map(n=>({p,n}))).sort((a,b)=>b.n.length-a.n.length).find(({n})=>normalizar(c.usuarioNome??'').includes(n))?.p
    ?? PORTAIS[PORTAIS.length - 1]
}

/**
 * UASG e número completo da compra no Compras.gov (ComprasNet), como o fornecedor digita ao cadastrar a proposta.
 * Vêm do código da compra no link do edital: UASG (6) + modalidade (2) + número (5) + ano (4), ex.: 168008 05 00283 2026.
 */
export function codigoComprasnet(c: Pick<CompraPNCP, 'linkSistemaOrigem'>): { uasg: string; numero: string } | null {
  let codigo = ''
  try { codigo = new URL(c.linkSistemaOrigem ?? '').searchParams.get('compra') ?? '' } catch { return null }
  const m = /^(\d{6})(\d{2})(\d{5})(\d{4})$/.exec(codigo)
  return m ? { uasg: m[1], numero: `${m[3]}/${m[4]}` } : null
}

export function rotuloPortal(portal: string | null | undefined) {
  return portal?.trim().toUpperCase() === 'PNCP' ? 'Fonte oficial de compras' : portal
}

/** Domínio usado para o ícone de cada portal e endereços diretos conhecidos (conferidos em 20/11/2026). */
const ICONES: Record<string, { dominio: string; direto?: string }> = {
  comprasnet: { dominio: 'www.gov.br' }, pcp: { dominio: 'portaldecompraspublicas.com.br' }, 'licitacoes-e': { dominio: 'www.licitacoes-e.com.br' },
  caixa: { dominio: 'www.caixa.gov.br' }, banrisul: { dominio: 'www.banrisul.com.br' }, rs: { dominio: 'www.compras.rs.gov.br' },
  bahia: { dominio: 'www.comprasnet.ba.gov.br' }, amazonas: { dominio: 'www.e-compras.am.gov.br', direto: 'https://www.e-compras.am.gov.br/favicon.ico' },
  goias: { dominio: 'www.comprasnet.go.gov.br', direto: 'https://www.comprasnet.go.gov.br/favicon.ico' }, rj: { dominio: 'compras.rj.gov.br' },
  recife: { dominio: 'www.recife.pe.gov.br' }, licitanet: { dominio: 'licitanet.com.br' }, bll: { dominio: 'bllcompras.com' },
  elic: { dominio: 'www.portaldecompras.sc.gov.br' }, procergs: { dominio: 'www.procergs.rs.gov.br' }, mg: { dominio: 'www.compras.mg.gov.br' },
  banpara: { dominio: 'www.banpara.b.br' }, pe: { dominio: 'www.pe.gov.br' }, bnc: { dominio: 'bnccompras.com' }, outros: { dominio: '' },
}
/** Endereços do ícone do portal, do mais confiável ao reserva. */
export function iconesPortal(id: string) {
  const i = ICONES[id] ?? ICONES.outros
  // Sem domínio (outros portais): mostra só as iniciais, sem ícone de nenhuma fonte.
  if (!i.dominio) return []
  return [
    `https://www.google.com/s2/favicons?domain=${i.dominio}&sz=64`,
    ...(i.direto ? [i.direto] : []),
    `https://icons.duckduckgo.com/ip3/${i.dominio.replace(/^www\./, '')}.ico`,
  ]
}
