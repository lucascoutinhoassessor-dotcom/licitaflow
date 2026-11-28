// Regras puras da base no Turso, espelhando as do Postgres (migrations do coletor), para a busca dar o mesmo resultado:
// portal do edital, tipo pelo objeto, dia útil, texto pesquisável e a tradução da palavra-chave para o FTS5.

export const normalizar = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Portais conhecidos: domínio do link de origem e, na falta, nome do sistema (licitaflow_coleta.portais). */
export const PORTAIS = [
  ['comprasnet', ['compras.gov.br', 'comprasnet.gov.br', 'serpro.gov.br'], ['compras.gov.br', 'comprasnet']],
  ['pcp', ['portaldecompraspublicas.com.br'], ['portal de compras publicas']],
  ['licitacoes-e', ['licitacoes-e.com.br'], ['licitacoes-e']],
  ['caixa', ['licitacoes.caixa.gov.br'], ['licitacoes caixa', 'caixa economica federal']],
  ['banrisul', ['banrisul.com.br', 'pregaobanrisul.com.br'], ['banrisul']],
  ['rs', ['compras.rs.gov.br'], ['compras rs']],
  ['bahia', ['comprasnet.ba.gov.br'], ['compras bahia', 'bahia secretaria da administracao']],
  ['amazonas', ['e-compras.am.gov.br'], ['compras amazonas']],
  ['goias', ['comprasnet.go.gov.br', 'sislog.go.gov.br'], ['comprasnet goias', 'sislog']],
  ['rj', ['compras.rj.gov.br'], ['compras rj', 'siga rj']],
  ['recife', ['recife.pe.gov.br'], ['compras recife']],
  ['licitanet', ['licitanet.com.br'], ['licitanet']],
  ['bll', ['bll.org.br', 'bllcompras.com'], ['bll compras', 'bolsa de licitacoes e leiloes']],
  ['elic', ['elic.sc.gov.br', 'portaldecompras.sc.gov.br'], ['e-lic', 'compras santa catarina', 'secretaria de estado da administracao de santa catarina']],
  ['procergs', ['procergs.com.br', 'procergs.rs.gov.br'], ['procergs']],
  ['mg', ['compras.mg.gov.br'], ['compras minas gerais']],
  ['banpara', ['banpara.b.br'], ['banpara']],
  ['pe', ['peintegrado.pe.gov.br'], ['pe integrado', 'secretaria de administracao do estado de pernambuco']],
  ['bnc', ['bnc.org.br'], ['bolsa nacional de compras', 'bnc']],
  // Acrescentados em 28/11/2026: eram metade dos editais abertos caindo em "outros".
  ...PORTAIS_NOVOS_REGRAS(),
]
function PORTAIS_NOVOS_REGRAS() {
  return [
    ['bbmnet', ['bbmnet.com.br'], ['bbmnet']],
    ['licitardigital', ['licitardigital.com.br'], ['licitar digital']],
    ['ammlicita', ['ammlicita.org.br'], ['amm licita']],
    ['parana', ['compras.pr.gov.br', 'comprasparana.pr.gov.br'], ['seap-pr', 'administracao e da previdencia do estado do parana']],
    ['ceara', ['compras.ce.gov.br', 'licitacoes.ce.gov.br'], ['planejamento e gestao do ceara']],
    ['fortaleza', ['compras.sepog.fortaleza.ce.gov.br'], ['prefeitura municipal de fortaleza']],
    ['paraiba', ['centraldecompras.pb.gov.br'], ['central de compras da paraiba']],
    ['para', ['compras.pa.gov.br'], ['compras para']],
    ['sergipe', ['comprasnet.se.gov.br', 'aracajucompras.se.gov.br'], ['compras sergipe']],
    ['licitamais', ['licitamaisbrasil.com.br'], ['licita + brasil', 'licita mais brasil']],
    ['municipais', ['licitapp.com.br', 'dcfiorilli.com.br', 'balkertecnologia.com.br', 'emunicipio.com.br', 'gp.srv.br', 'slicx.com.br', 'agilicloud.com.br'],
      ['ipm sistemas', 'elotech', 'smarapd', 'az informatica', 'e & l producoes', 'betha sistemas', 'governancabrasil', 'conam consultoria', 'publica tecnologia',
        'megasoft', 'equiplano', 'j brasil sistemas', 'fiorilli', 'tecnosweb', 'embras', 'startgov', 'prodata informatica', 'sh3 informatica', 'top down consultoria', 'br conectado',
        'instituto municipal de administracao publica', 'ibdm modernizacao', 'planejar consultores', 'digifred', 'contass', 'elmar tecnologia', 'abase sistemas', 'memory projetos', 'hlh assessoria', '3tecnos', 'sonner sistemas', 'novoserv', '4r tecnologia', 'sisvetor', 'instar tecnologia', 'govtec', 'gcaspp', 'tche informatica', 'system desenvolvimento', 'sigep', 'assesi', 'eddydata', 'contratosgov', 'publicenter', 'coplan', 'slicx', 'agili software', 'procede bahia', 'empro tecnologia', 'licitacon', 'centi']],
  ]
}
/** Portais acrescentados depois: um filtro salvo antes deles, que marcava "outros", continua vendo esses editais. */
export const PORTAIS_NOVOS = PORTAIS_NOVOS_REGRAS().map((p) => p[0])
export const IDS_PORTAIS = [...PORTAIS.map((p) => p[0]), 'outros']

export function portalDe(c) {
  // Vários portais ainda publicam o link com http:// (sem o "s").
  const host = /^https?:\/\/([^/:?#]+)/.exec(String(c?.linkSistemaOrigem ?? '').toLowerCase())?.[1] ?? ''
  if (host) for (const [id, dominios] of PORTAIS) if (dominios.some((d) => host === d || host.endsWith(`.${d}`))) return id
  const nome = normalizar(c?.usuarioNome)
  let melhor = null
  for (const [id, , nomes] of PORTAIS) for (const n of nomes) if (nome.includes(n) && (!melhor || n.length > melhor[1])) melhor = [id, n.length]
  return melhor?.[0] ?? 'outros'
}

/** M (material) ou S (serviço) deduzido pelo objeto (public.oportunidades_tipo_objeto). */
export function tipoPeloObjeto(objeto) {
  const o = normalizar(objeto)
  if (/(prestacao de servic|servicos? (de|continuad|comum|especializad|tecnic|terceirizad)|contratacao de servic)/.test(o)) return 'S'
  if (/(aquisic|^compra|compra de|fornecimento|registro de precos? para (a )?(futura|eventual|eventuais|possivel)|^material|^materiais|^equipamento|generos alimenticios|medicamento)/.test(o)) return 'M'
  if (/(servic|manutenc|locacao|obra|reforma|execucao|consultoria|assessoria|transporte|limpeza|vigilanc|instalacao|treinamento|curso|capacitacao|evento|seguro|hospedagem|conserto|reparo|dedetizacao|terceirizacao|elaboracao de projeto|exames|recarga)/.test(o)) return 'S'
  if (/(material|materiais|equipamento|insumo|peca|mobiliario|veiculo|uniforme)/.test(o)) return 'M'
  return null
}

/** Datas do PNCP vêm sem fuso (horário de Brasília) ou com fuso; devolve ISO em UTC. */
export function tempo(v) {
  const s = String(v ?? '').trim()
  if (!s) return null
  const d = new Date(/([zZ]|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s.length === 10 ? `${s}T00:00:00` : s}-03:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const FERIADOS = new Set(['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'])
/** Segunda a sexta, fora dos feriados nacionais fixos, no horário de Brasília (public.oportunidades_dia_util). */
export function diaUtil(iso) {
  if (!iso) return 0
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000)
  const dia = d.getUTCDay(), md = `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  return dia >= 1 && dia <= 5 && !FERIADOS.has(md) ? 1 : 0
}

/** Texto da busca por palavra: o que se contrata, o órgão (nome e CNPJ) e o número do edital. */
export function textoEdital(c) {
  return [c.objetoCompra, c.informacaoComplementar, c.orgaoEntidade?.razaoSocial, c.orgaoEntidade?.cnpj, c.numeroControlePNCP, c.numeroCompra].filter(Boolean).join(' ').slice(0, 20000)
}

/** Edital do jeito que a tela usa (o mesmo "compra" que o Postgres guarda). */
export function compraEnxuta(c) {
  return {
    numeroControlePNCP: c.numeroControlePNCP, numeroCompra: c.numeroCompra ?? null, anoCompra: c.anoCompra ?? null, sequencialCompra: c.sequencialCompra ?? null,
    objetoCompra: c.objetoCompra ?? '', informacaoComplementar: c.informacaoComplementar ?? null,
    orgaoEntidade: { cnpj: c.orgaoEntidade?.cnpj ?? '', razaoSocial: c.orgaoEntidade?.razaoSocial ?? '' },
    unidadeOrgao: { ufSigla: c.unidadeOrgao?.ufSigla ?? '', municipioNome: c.unidadeOrgao?.municipioNome ?? '' },
    modalidadeId: c.modalidadeId ?? null, modalidadeNome: c.modalidadeNome ?? null, usuarioNome: c.usuarioNome ?? null, linkSistemaOrigem: c.linkSistemaOrigem ?? null,
    srp: c.srp ?? null, valorTotalEstimado: c.valorTotalEstimado ?? null, dataPublicacaoPncp: c.dataPublicacaoPncp ?? null,
    dataAberturaProposta: c.dataAberturaProposta ?? null, dataEncerramentoProposta: c.dataEncerramentoProposta ?? null,
  }
}

// Palavras que o dicionário "portuguese" do Postgres descarta.
const VAZIAS = new Set('a o e de da do das dos em no na nos nas um uma uns umas para por com sem ao aos as os que se ou the of'.split(' '))
/** Raiz simples (o Postgres usa o stemmer do português): tira plural e terminações comuns, e busca por prefixo. */
export function raiz(p) {
  if (p.length <= 4 || /^\d/.test(p)) return p
  for (const [fim, novo] of [['coes', 'c'], ['cao', 'c'], ['oes', ''], ['aes', ''], ['ais', ''], ['eis', 'e'], ['res', 'r'], ['zes', 'z'], ['ses', 's'], ['ns', 'm'], ['s', '']]) {
    if (p.endsWith(fim) && p.length - fim.length + novo.length >= 4) return p.slice(0, p.length - fim.length) + novo
  }
  return p
}
/** Uma parte da pesquisa vira "todas estas palavras (por prefixo)"; null se não sobrar palavra. */
function parteFts(texto) {
  const palavras = [...new Set((normalizar(texto).match(/[a-z0-9]+/g) ?? []).filter((p) => !VAZIAS.has(p) && (p.length > 1 || /\d/.test(p))).map(raiz))].slice(0, 8)
  return palavras.length ? palavras.map((p) => `"${p}"*`).join(' AND ') : null
}
/** "notebook; computador" = qualquer um dos termos separados por ";" (como na busca do Postgres). */
export function consultaFts(texto) {
  const partes = String(texto ?? '').split(';').map(parteFts).filter(Boolean).slice(0, 10)
  return partes.length ? partes.map((p) => `(${p})`).join(' OR ') : null
}

/** Confere as mesmas alternativas e prefixos numa descrição, após recortar pelo edital. */
export function filtroDescricao(texto) {
  let coluna = "lower(coalesce(i.descricao, ''))"
  for (const letra of 'áàâãäéèêëíìîïóòôõöúùûüç') {
    coluna = `replace(replace(${coluna}, '${letra}', '${normalizar(letra)}'), '${letra.toUpperCase()}', '${normalizar(letra)}')`
  }
  for (const separador of ['-', '/', '.', ',', ';', ':', '(', ')', '[', ']', '"', "'", '_', '+', '\n', '\r', '\t']) {
    coluna = `replace(${coluna}, '${separador.replaceAll("'", "''")}', ' ')`
  }
  const args = []
  const partes = (consultaFts(texto) ?? '').split(' OR ').filter(Boolean).map(parte => {
    const palavras = [...parte.matchAll(/"([a-z0-9]+)"/g)].map(m => m[1])
    return '(' + palavras.map(p => { args.push(`% ${p}%`); return `(' ' || ${coluna}) like ?` }).join(' and ') + ')'
  })
  return { sql: partes.length ? '(' + partes.join(' or ') + ')' : '0', args }
}
