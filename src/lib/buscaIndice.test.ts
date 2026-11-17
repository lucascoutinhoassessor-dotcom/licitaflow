import {afterEach,describe,expect,it,vi} from 'vitest'
const {rpc,abortSignal}=vi.hoisted(()=>({rpc:vi.fn(),abortSignal:vi.fn()}))
vi.mock('./supabase',()=>({supabase:{rpc}}))
import {pesquisarIndice} from './buscaIndice'
import {filtrosExtras} from './filtrosOportunidades'
const f={...filtrosExtras,busca:'microcomputador',inicio:'2026-11-01',fim:'2026-11-17',uf:'',modalidade:'6',situacao:'abertas' as const}
afterEach(()=>vi.resetAllMocks())
describe('consulta indexada',()=>{
 it('faz uma única RPC paginada sem consultar a fonte externa',async()=>{
  const data={data:[],totalRegistros:141,totalPaginas:8}
  rpc.mockReturnValue({abortSignal});abortSignal.mockResolvedValue({data,error:null})
  const c=new AbortController();expect(await pesquisarIndice(f,3,c.signal)).toEqual(data)
  expect(rpc).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledWith('buscar_oportunidades',{p_filtros:f,p_pagina:3,p_tamanho:20});expect(abortSignal).toHaveBeenCalledWith(c.signal)
 })
 it('não inicia varredura externa se o índice ainda não estiver implantado',async()=>{
  rpc.mockResolvedValue({data:null,error:{code:'PGRST202'}})
  await expect(pesquisarIndice(f,1)).rejects.toThrow('sendo preparado');expect(rpc).toHaveBeenCalledTimes(1)
 })
})
