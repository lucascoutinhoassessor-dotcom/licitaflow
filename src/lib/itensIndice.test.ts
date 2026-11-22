import {afterEach,describe,expect,it,vi} from 'vitest'
const {rpc,fonte,getSession}=vi.hoisted(()=>({rpc:vi.fn(),fonte:vi.fn(),getSession:vi.fn()}))
vi.mock('./supabase',()=>({supabase:{rpc,auth:{getSession}}}))
vi.mock('./filtrosOportunidades',()=>({consultarItens:fonte}))
import {itensDoEdital} from './itensIndice'
const compra={numeroControlePNCP:'123-1-1/2026'} as any
afterEach(()=>{vi.resetAllMocks();vi.unstubAllGlobals()})
describe('itens já coletados',()=>{
 it('usa os itens da base rápida (Turso) quando ela já tem',async()=>{
  getSession.mockResolvedValue({data:{session:{access_token:'tk'}}})
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({itens:[{numeroItem:7}]}))))
  expect(await itensDoEdital(compra)).toEqual([{numeroItem:7}]);expect(rpc).not.toHaveBeenCalled();expect(fonte).not.toHaveBeenCalled()
 })
 it('sem a base rápida, retorna os detalhes do Postgres sem consultar a fonte',async()=>{
  getSession.mockResolvedValue({data:{session:null}})
  rpc.mockResolvedValue({data:[{numeroItem:1}],error:null})
  expect(await itensDoEdital(compra)).toEqual([{numeroItem:1}]);expect(fonte).not.toHaveBeenCalled()
 })
 it('sem itens guardados em nenhuma base, consulta a fonte uma vez (sem pôr na fila do Postgres)',async()=>{
  getSession.mockResolvedValue({data:{session:{access_token:'tk'}}})
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:404})))
  rpc.mockResolvedValue({data:[],error:null})
  fonte.mockResolvedValue([{numeroItem:2}]);expect(await itensDoEdital(compra)).toEqual([{numeroItem:2}])
  expect(rpc).toHaveBeenCalledTimes(1);expect(fonte).toHaveBeenCalledTimes(1)
 })
 it('não inicia outra chamada após cancelamento',async()=>{
  getSession.mockResolvedValue({data:{session:null}})
  rpc.mockReturnValue({abortSignal:()=>Promise.resolve({data:null,error:null})})
  const controle=new AbortController();controle.abort()
  await expect(itensDoEdital(compra,controle.signal)).rejects.toThrow();expect(fonte).not.toHaveBeenCalled()
 })
})
