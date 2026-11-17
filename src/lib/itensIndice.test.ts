import {afterEach,describe,expect,it,vi} from 'vitest'
const {rpc,fonte}=vi.hoisted(()=>({rpc:vi.fn(),fonte:vi.fn()}))
vi.mock('./supabase',()=>({supabase:{rpc}}))
vi.mock('./filtrosOportunidades',()=>({consultarItens:fonte}))
import {itensDoEdital} from './itensIndice'
const compra={numeroControlePNCP:'123-1-1/2026'} as any
afterEach(()=>vi.resetAllMocks())
describe('itens já coletados',()=>{
 it('retorna detalhes persistidos sem consultar a fonte',async()=>{
  rpc.mockResolvedValue({data:[{numeroItem:1}],error:null})
  expect(await itensDoEdital(compra)).toEqual([{numeroItem:1}]);expect(fonte).not.toHaveBeenCalled()
 })
 it('solicita somente a identificação do edital e consulta pontualmente quando ainda não coletado',async()=>{
  rpc.mockImplementation(nome=>nome==='solicitar_itens_oportunidade'?Promise.resolve({error:null}):Promise.resolve({data:null,error:null}))
  fonte.mockResolvedValue([{numeroItem:2}]);expect(await itensDoEdital(compra)).toEqual([{numeroItem:2}])
  expect(rpc).toHaveBeenCalledWith('solicitar_itens_oportunidade',{p_controle:compra.numeroControlePNCP});expect(fonte).toHaveBeenCalledTimes(1)
 })
 it('não inicia outra chamada após cancelamento',async()=>{
  rpc.mockReturnValue({abortSignal:()=>Promise.resolve({data:null,error:null})})
  const controle=new AbortController();controle.abort()
  await expect(itensDoEdital(compra,controle.signal)).rejects.toThrow();expect(fonte).not.toHaveBeenCalled()
 })
})
