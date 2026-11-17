import {afterEach,describe,expect,it,vi} from 'vitest'
import handler from './oportunidades.js'
afterEach(()=>vi.unstubAllGlobals())
describe('retirada da varredura durante consultas',()=>{
 it('encerra o endpoint antigo sem chamar a fonte externa',()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch)
  const res={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()}
  handler({method:'GET',query:{pagina:'1',codigoModalidadeContratacao:'6'}},res)
  expect(res.status).toHaveBeenCalledWith(410);expect(fetch).not.toHaveBeenCalled()
 })
})
