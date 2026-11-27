import { afterEach, describe, expect, it, vi } from 'vitest'
import { atualizarPeriodoRapido, comUfs, consultarItens, filtrosExtras, MODALIDADES, periodoAbertura, periodoEntre, periodoPublicacao, periodoRapidoDe, resumoFiltros, ufsDe, validarFiltros, type FiltrosOportunidades } from './filtrosOportunidades'
import { portalCompra, urlOrigem, PORTAIS } from './portais'
import type { CompraPNCP } from './pncp'
const f: FiltrosOportunidades={...filtrosExtras,modalidades:['6','8'],busca:'computadores',inicio:'2026-11-09',fim:'2026-11-16',uf:'',modalidade:'6'}
const c: CompraPNCP={numeroControlePNCP:'a',numeroCompra:'1',anoCompra:2026,sequencialCompra:1,objetoCompra:'Aquisição de computadores',modalidadeId:6,modalidadeNome:'Pregão eletrônico',orgaoEntidade:{cnpj:'123',razaoSocial:'Prefeitura'},unidadeOrgao:{ufSigla:'SP',municipioNome:'São Paulo'},valorTotalEstimado:10000,dataPublicacaoPncp:null,dataAberturaProposta:null,dataEncerramentoProposta:null,srp:false,usuarioNome:'Compras.gov.br'}
afterEach(()=>vi.unstubAllGlobals())
describe('filtros de oportunidades',()=>{
 it('classifica todos os portais por domínio, sem confundir endereços parecidos',()=>{
   for(const [id,,dominios] of PORTAIS) for(const dominio of dominios) expect(portalCompra({...c,linkSistemaOrigem:`https://${dominio}/edital`})[0]).toBe(id)
   expect(portalCompra({...c,usuarioNome:'publicador desconhecido',linkSistemaOrigem:'https://compras.gov.br.exemplo.com/'})[0]).toBe('outros')
   expect(urlOrigem({...c,linkSistemaOrigem:'javascript:alert(1)'})).toBeNull()
 })


 it('oferece e marca por padrão todas as 13 modalidades do PNCP',()=>{
   expect(MODALIDADES.map(m=>Number(m[0])).sort((a,b)=>a-b)).toEqual([1,2,3,4,5,6,7,8,9,10,11,12,13])
   expect(filtrosExtras.modalidades).toHaveLength(13)
 })

 it('períodos rápidos de abertura: N dias corridos contando hoje',()=>{
   const hoje=new Date('2026-11-20T15:00:00-03:00')
   expect(periodoAbertura(7,hoje)).toEqual({aberturaDe:'2026-11-20',aberturaAte:'2026-11-26'})
   expect(periodoAbertura(15,hoje).aberturaAte).toBe('2026-12-04')
   expect(periodoAbertura(30,hoje).aberturaAte).toBe('2026-12-19')
   expect(periodoAbertura(null,hoje)).toEqual({aberturaDe:'',aberturaAte:''})
   expect(filtrosExtras.diasUteis).toBe(true)
 })

 it('próximas disputas: hoje, amanhã e janelas a partir de hoje',()=>{
   const hoje=new Date('2026-11-30T23:30:00-03:00')
   expect(periodoEntre(0,0,hoje)).toEqual({aberturaDe:'2026-11-30',aberturaAte:'2026-11-30'})
   expect(periodoEntre(1,1,hoje)).toEqual({aberturaDe:'2026-12-01',aberturaAte:'2026-12-01'})
   expect(periodoEntre(0,7,hoje).aberturaAte).toBe('2026-12-07')
 })

 it('publicação: últimos N dias contando hoje; 12 meses no "todo o período"',()=>{
   const hoje=new Date('2026-11-27T10:00:00-03:00')
   expect(periodoPublicacao(7,hoje)).toEqual({inicio:'2026-11-21',fim:'2026-11-27'})
   expect(periodoPublicacao(30,hoje)).toEqual({inicio:'2026-10-29',fim:'2026-11-27'})
   expect(periodoPublicacao(null,hoje).inicio).toBe('2025-11-27')
 })

 it('o botão aceso casa exatamente com as datas pesquisadas',()=>{
   const hoje=new Date('2026-11-27T10:00:00-03:00')
   const ab=(aberturaDe:string,aberturaAte:string)=>periodoRapidoDe({situacao:'abertas',aberturaDe,aberturaAte,inicio:'',fim:''},hoje)
   expect(ab('2026-11-27','2026-12-03')).toBe(7)
   expect(ab('2026-11-27','2026-12-11')).toBe(15)
   expect(ab('2026-11-27','2026-12-04')).toBeUndefined()
   expect(ab('','')).toBeNull()
   expect(periodoRapidoDe({situacao:'publicacoes',aberturaDe:'',aberturaAte:'',inicio:'2026-11-13',fim:'2026-11-27'},hoje)).toBe(15)
 })

 it('busca guardada de outro dia: o período rápido volta a contar de hoje; datas à mão ficam',()=>{
   const hoje=new Date('2026-11-27T10:00:00-03:00')
   const ontem={situacao:'abertas' as const,aberturaDe:'2026-11-26',aberturaAte:'2026-12-10',inicio:'',fim:''}
   expect(atualizarPeriodoRapido(ontem,15,hoje)).toMatchObject({aberturaDe:'2026-11-27',aberturaAte:'2026-12-11'})
   expect(atualizarPeriodoRapido(ontem,undefined,hoje)).toBe(ontem)
   // Formato antigo (hoje + 15): passa a ser 15 dias contando hoje.
   expect(atualizarPeriodoRapido({...ontem,aberturaDe:'2026-11-27',aberturaAte:'2026-12-12'},undefined,hoje)).toMatchObject({aberturaAte:'2026-12-11'})
   const pub={situacao:'publicacoes' as const,aberturaDe:'',aberturaAte:'',inicio:'2026-10-20',fim:'2026-11-20'}
   expect(atualizarPeriodoRapido(pub,7,hoje)).toMatchObject({inicio:'2026-11-21',fim:'2026-11-27'})
 })

 it('rejeita seleção vazia e intervalos inválidos',()=>{
   expect(()=>validarFiltros({...f,modalidades:[]})).toThrow('Selecione')
   expect(()=>validarFiltros({...f,minimo:'10',maximo:'5'})).toThrow('intervalos')
   expect(()=>validarFiltros({...f,maxItens:'1.5'})).toThrow('inteiro')
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

describe('resumoFiltros', () => {
  const base: FiltrosOportunidades = { ...filtrosExtras, inicio: '', fim: '', situacao: 'abertas', modalidade: '6', uf: '', aberturaDe: '2026-11-22', aberturaAte: '2026-12-07', portais: ['pncp'], tipoItem: 'M' }
  const r = resumoFiltros(base, MODALIDADES.length, PORTAIS.length)
  const achar = (rotulo: string) => r.find((x) => x.rotulo === rotulo)
  it('padrões não têm X; os demais voltam ao padrão ao serem tirados', () => {
    expect(r.map((x) => x.rotulo)).toEqual(['Brasil inteiro', 'Abertura: 22/11/2026 a 07/12/2026', 'Só dias úteis', '1 portal', 'Somente materiais'])
    expect(achar('Brasil inteiro')?.remover).toBeUndefined()
    expect(achar('Só dias úteis')?.remover).toEqual({ diasUteis: false })
    expect(achar('1 portal')?.remover).toEqual({ portais: filtrosExtras.portais })
    expect(achar('Somente materiais')?.remover).toEqual({ tipoItem: '' })
    const semPeriodo = { ...base, ...achar('Abertura: 22/11/2026 a 07/12/2026')!.remover }
    expect(resumoFiltros(semPeriodo, MODALIDADES.length, PORTAIS.length).find((x) => x.rotulo === 'Abertura: todo o período')?.remover).toBeUndefined()
  })
})

describe('vários estados', () => {
  it('lê a lista nova e a UF única das buscas antigas, e mantém uf em dia', () => {
    expect(ufsDe({ uf: 'SP', ufs: [] })).toEqual(['SP'])
    expect(ufsDe({ uf: '', ufs: ['SP', 'RJ', 'XX'] })).toEqual(['RJ', 'SP'])
    expect(comUfs(['RJ'])).toEqual({ ufs: ['RJ'], uf: 'RJ' })
    expect(comUfs(['SP', 'RJ'])).toEqual({ ufs: ['RJ', 'SP'], uf: '' })
    const rotulos = (x: Partial<FiltrosOportunidades>) => resumoFiltros({ ...f, ...x }, MODALIDADES.length, PORTAIS.length).map((r) => r.rotulo)
    expect(rotulos({ ufs: ['SP', 'RJ'] })).toContain('UF: RJ, SP')
    expect(rotulos({ ufs: ['AC', 'AL', 'AP', 'AM', 'BA'] })).toContain('5 estados')
    expect(rotulos({ ufs: [] })).toContain('Brasil inteiro')
  })
})
