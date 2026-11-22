import {afterEach,describe,expect,it,vi} from 'vitest'
const {rpc,abortSignal,getSession}=vi.hoisted(()=>({rpc:vi.fn(),abortSignal:vi.fn(),getSession:vi.fn()}))
vi.mock('./supabase',()=>({supabase:{rpc,auth:{getSession}}}))
import {pesquisarIndice} from './buscaIndice'
import {filtrosExtras} from './filtrosOportunidades'
const f={...filtrosExtras,busca:'microcomputador',inicio:'2026-11-01',fim:'2026-11-17',uf:'',modalidade:'6',situacao:'abertas' as const}
afterEach(()=>{vi.resetAllMocks();vi.unstubAllGlobals()})
const semSessao=()=>getSession.mockResolvedValue({data:{session:null}})
const comSessao=()=>getSession.mockResolvedValue({data:{session:{access_token:'tk'}}})
describe('consulta indexada',()=>{
 it('faz uma única RPC paginada sem consultar a fonte externa',async()=>{
  semSessao()
  const data={data:[],totalRegistros:141,totalPaginas:8}
  rpc.mockReturnValue({abortSignal});abortSignal.mockResolvedValue({data,error:null})
  const c=new AbortController();expect(await pesquisarIndice(f,3,c.signal)).toEqual(data)
  expect(rpc).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledWith('buscar_oportunidades',{p_filtros:f,p_pagina:3,p_tamanho:20});expect(abortSignal).toHaveBeenCalledWith(c.signal)
 })
 it('não inicia varredura externa se o índice ainda não estiver implantado',async()=>{
  semSessao();rpc.mockResolvedValue({data:null,error:{code:'PGRST202'}})
  await expect(pesquisarIndice(f,1)).rejects.toThrow('sendo preparado');expect(rpc).toHaveBeenCalledTimes(1)
 })
 it('explica quando a busca passa do tempo limite do banco',async()=>{
  semSessao();rpc.mockResolvedValue({data:null,error:{code:'57014'}})
  await expect(pesquisarIndice(f,1)).rejects.toThrow('demorou mais que o esperado')
 })
 it('usa a base rápida (Turso) quando ela responde, sem chamar o Postgres',async()=>{
  comSessao()
  const data={data:[],totalRegistros:3,totalPaginas:1,catalogo:{fonte:'turso'}}
  const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify(data),{status:200}));vi.stubGlobal('fetch',fetch)
  expect(await pesquisarIndice(f,1)).toEqual(data)
  expect(rpc).not.toHaveBeenCalled();expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({filtros:f,pagina:1})
 })
 it('volta ao Postgres quando a base rápida ainda está carregando, e não insiste por alguns minutos',async()=>{
  comSessao()
  const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({codigo:'turso_carregando'}),{status:409}));vi.stubGlobal('fetch',fetch)
  const data={data:[],totalRegistros:1,totalPaginas:1}
  rpc.mockResolvedValue({data,error:null})
  expect(await pesquisarIndice(f,1)).toEqual(data);expect(await pesquisarIndice(f,2)).toEqual(data)
  expect(fetch).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledTimes(2)
 })
})
