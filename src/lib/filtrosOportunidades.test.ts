import { afterEach, describe, expect, it, vi } from 'vitest'
import { buscarOportunidades, consultarItens, filtrarCompra, filtrarItens, filtrosExtras, validarFiltros, type FiltrosOportunidades } from './filtrosOportunidades'
import { portalCompra, urlOrigem, PORTAIS } from './portais'
import type { CompraPNCP } from './pncp'
const f: FiltrosOportunidades={...filtrosExtras,inicio:'2026-11-09',fim:'2026-11-16',uf:'',modalidade:'6'}
const c: CompraPNCP={numeroControlePNCP:'a',numeroCompra:'1',anoCompra:2026,sequencialCompra:1,objetoCompra:'Aquisição de computadores',modalidadeId:6,modalidadeNome:'Pregão eletrônico',orgaoEntidade:{cnpj:'123',razaoSocial:'Prefeitura'},unidadeOrgao:{ufSigla:'SP',municipioNome:'São Paulo'},valorTotalEstimado:10000,dataPublicacaoPncp:null,dataAberturaProposta:null,dataEncerramentoProposta:null,srp:false,usuarioNome:'Compras.gov.br'}
afterEach(()=>vi.unstubAllGlobals())
describe('filtros de oportunidades',()=>{
 it('classifica todos os portais por domínio, sem confundir endereços parecidos',()=>{
   for(const [id,,dominios] of PORTAIS) for(const dominio of dominios) expect(portalCompra({...c,linkSistemaOrigem:`https://${dominio}/edital`})[0]).toBe(id)
   expect(portalCompra({...c,usuarioNome:'publicador desconhecido',linkSistemaOrigem:'https://compras.gov.br.exemplo.com/'})[0]).toBe('outros')
   expect(urlOrigem({...c,linkSistemaOrigem:'javascript:alert(1)'})).toBeNull()
 })
 it('combina palavras, portal, órgão e valor sem tratar dados ausentes como divulgados',()=>{
   expect(filtrarCompra(c,{...f,busca:'prefeitura computadores',minimo:'10000',maximo:'10000',orgao:'123'})).toBe(true)
   expect(filtrarCompra(c,{...f,orgao:'456'})).toBe(false)
   expect(filtrarCompra(c,{...f,portais:['licitanet']})).toBe(false)
   expect(filtrarCompra({...c,valorTotalEstimado:null},{...f,minimo:'1'})).toBe(false)
   expect(filtrarCompra({...c,valorTotalEstimado:0},{...f,naoDivulgado:true})).toBe(true)
   expect(filtrarCompra({...c,srp:undefined},{...f,excluirSrp:true})).toBe(false)
   expect(filtrarCompra(c,{...f,excluirSrp:true})).toBe(true)
 })
 it('exige que o mesmo item atenda ao valor e ao benefício ME/EPP e respeita sigilo',()=>{
   const itens=[{numeroItem:1,valorUnitarioEstimado:10,tipoBeneficio:1},{numeroItem:2,valorUnitarioEstimado:50,tipoBeneficio:4}]
   expect(filtrarItens(itens,{...f,exclusivo:true,itemMinimo:'40'})).toBe(false)
   expect(filtrarItens(itens,{...f,exclusivo:true,itemMaximo:'20'})).toBe(true)
   expect(filtrarItens(itens,{...f,maxItens:'1'})).toBe(false)
   expect(filtrarItens([{...itens[0],orcamentoSigiloso:true}],{...f,itemMinimo:'1'})).toBe(false)
   expect(filtrarItens([],{...f,exclusivo:true})).toBe(false)
 })
 it('rejeita seleção vazia e intervalos inválidos',()=>{
   expect(()=>validarFiltros({...f,modalidades:[]})).toThrow('Selecione')
   expect(()=>validarFiltros({...f,minimo:'10',maximo:'5'})).toThrow('intervalos')
   expect(()=>validarFiltros({...f,maxItens:'1.5'})).toThrow('inteiro')
 })
 it('consulta as modalidades selecionadas sem aplicar filtros por item desnecessariamente',async()=>{
   const fetch=vi.fn().mockImplementation(async (url:string)=>new Response(JSON.stringify({data:[{...c,numeroControlePNCP:new URL(url).searchParams.get('codigoModalidadeContratacao')}],totalPaginas:1,totalRegistros:1})))
   vi.stubGlobal('fetch',fetch)
   const r=await buscarOportunidades(f,1)
   expect(fetch).toHaveBeenCalledTimes(2); expect(r.data).toHaveLength(2);expect(r.totalRegistros).toBe(2)
 })
 it('não apresenta consulta parcial como resultado válido quando os itens falham',async()=>{
   vi.stubGlobal('fetch',vi.fn().mockImplementation(async(url:string)=>url.includes('/itens?')?new Response('',{status:503}):new Response(JSON.stringify({data:[c],totalPaginas:1,totalRegistros:1}))))
   await expect(buscarOportunidades({...f,modalidades:['6'],exclusivo:true},1)).rejects.toThrow('verificar os itens')
 })
 it('consulta todas as páginas de itens e detecta paginação ignorada',async()=>{
   const lote=Array.from({length:500},(_,i)=>({numeroItem:i+1,valorUnitarioEstimado:1}))
   const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(lote))).mockResolvedValueOnce(new Response(JSON.stringify([{numeroItem:501,valorUnitarioEstimado:2}])))
   vi.stubGlobal('fetch',fetch)
   expect(await consultarItens(c)).toHaveLength(501)
   expect(fetch.mock.calls[1][0]).toContain('pagina=2')
   vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>new Response(JSON.stringify(lote))))
   await expect(consultarItens(c)).rejects.toThrow('paginação')
 })
})
