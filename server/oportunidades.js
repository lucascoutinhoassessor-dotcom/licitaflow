// Consulta somente páginas de dados públicos; nenhum token ou dado de cliente é usado.
const ufs = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '))
const dataValida = s => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s
export function urlPaginaPublica(query) {
  const valor = k => typeof query[k] === 'string' ? query[k] : ''
  const situacao=valor('situacao') || 'publicacoes', modalidade=valor('codigoModalidadeContratacao'), pagina=Number(valor('pagina')), uf=valor('uf')
  if (!['abertas','publicacoes'].includes(situacao) || !/^(4|5|6|7|8|9)$/.test(modalidade) || !Number.isInteger(pagina) || pagina<1 || pagina>10000 || (uf && !ufs.has(uf))) throw new Error('Consulta inválida.')
  const params=new URLSearchParams({codigoModalidadeContratacao:modalidade,pagina:String(pagina),tamanhoPagina:'50'})
  if(uf)params.set('uf',uf)
  if(situacao==='abertas') params.set('dataFinal','20991231')
  else {
    const inicio=valor('inicio'),fim=valor('fim')
    if(!dataValida(inicio)||!dataValida(fim)||inicio>fim || (Date.parse(fim)-Date.parse(inicio))/86400000>366) throw new Error('Selecione um período de publicação de até 366 dias.')
    params.set('dataInicial',inicio.replace(/-/g,''));params.set('dataFinal',fim.replace(/-/g,''))
  }
  return `https://pncp.gov.br/api/consulta/v1/contratacoes/${situacao==='abertas'?'proposta':'publicacao'}?${params}`
}
export function reduzirCompra(c) {
  if(!c || typeof c.numeroControlePNCP!=='string' || typeof c.objetoCompra!=='string' || !c.orgaoEntidade?.cnpj) throw new Error('Resposta inesperada da fonte.')
  return {
    numeroControlePNCP:c.numeroControlePNCP,numeroCompra:c.numeroCompra,anoCompra:c.anoCompra,sequencialCompra:c.sequencialCompra,
    objetoCompra:c.objetoCompra,informacaoComplementar:c.informacaoComplementar??null,modalidadeId:c.modalidadeId,modalidadeNome:c.modalidadeNome,
    orgaoEntidade:{cnpj:c.orgaoEntidade.cnpj,razaoSocial:c.orgaoEntidade.razaoSocial},
    unidadeOrgao:{ufSigla:c.unidadeOrgao?.ufSigla??'',municipioNome:c.unidadeOrgao?.municipioNome??''},
    usuarioNome:c.usuarioNome,linkSistemaOrigem:c.linkSistemaOrigem,srp:c.srp,
    valorTotalEstimado:c.valorTotalEstimado??null,dataPublicacaoPncp:c.dataPublicacaoPncp??null,
    dataAberturaProposta:c.dataAberturaProposta??null,dataEncerramentoProposta:c.dataEncerramentoProposta??null,
  }
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store')
  if(req.method!=='GET')return res.status(405).json({error:'Método não permitido.'})
  let url
  try { url=urlPaginaPublica(req.query??{}) } catch { return res.status(400).json({error:'Filtros inválidos. Confira modalidade, UF, página e período.'}) }
  try {
    const r=await fetch(url,{signal:AbortSignal.timeout(20000)})
    if(r.status===204) {res.setHeader('Cache-Control','public, max-age=0, s-maxage=120');return res.json({data:[],totalPaginas:0,totalRegistros:0})}
    if(r.status===429){
      const segundos=Math.max(30,Math.min(300,Number(r.headers.get('retry-after'))||60))
      res.setHeader('Retry-After',String(segundos))
      return res.status(429).json({error:'A fonte pediu uma pausa temporária na consulta.',retryAfter:segundos})
    }
    if(!r.ok)throw new Error('Fonte indisponível.')
    const d=await r.json()
    if(!Array.isArray(d.data) || !Number.isInteger(d.totalPaginas) || !Number.isInteger(d.totalRegistros))throw new Error('Resposta inválida.')
    const data=d.data.map(reduzirCompra)
    res.setHeader('Cache-Control','public, max-age=0, s-maxage=300, stale-while-revalidate=300')
    return res.json({data,totalPaginas:d.totalPaginas,totalRegistros:d.totalRegistros})
  } catch { return res.status(503).json({error:'A fonte está temporariamente indisponível. Tente retomar a consulta em instantes.'}) }
}
