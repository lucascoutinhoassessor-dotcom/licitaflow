import {afterEach,describe,expect,it,vi} from 'vitest'
import handler,{urlPaginaPublica,reduzirCompra} from './oportunidades.js'
afterEach(()=>vi.unstubAllGlobals())
const q={situacao:'abertas',codigoModalidadeContratacao:'6',pagina:'2',uf:'SP'}
describe('consulta pública com cache',()=>{
 it('mantém origem fixa e valida os filtros para evitar consultas arbitrárias',()=>{
  const u=new URL(urlPaginaPublica(q));expect(u.origin).toBe('https://pncp.gov.br');expect(u.pathname).toContain('/proposta');expect(u.searchParams.get('pagina')).toBe('2');expect(u.searchParams.get('uf')).toBe('SP')
  for(const patch of [{pagina:'0'},{uf:'XX'},{codigoModalidadeContratacao:'https://outro'},{situacao:'qualquer'},{pagina:['1','2']}])expect(()=>urlPaginaPublica({...q,...patch})).toThrow()
  expect(()=>urlPaginaPublica({...q,situacao:'publicacoes',inicio:'2026-02-30',fim:'2026-03-01'})).toThrow()
 })
 it('não transfere campos de publicadores fora do contrato de leitura',()=>{
  const c=reduzirCompra({numeroControlePNCP:'1',objetoCompra:'Microcomputador',orgaoEntidade:{cnpj:'123',razaoSocial:'Órgão'},campoDesnecessario:'não transferir',srp:true,valorTotalEstimado:null})
  expect(c).not.toHaveProperty('campoDesnecessario');expect(c.srp).toBe(true);expect(c.valorTotalEstimado).toBeNull()
 })
 it('não armazena falhas como se fossem páginas vazias',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{status:503})))
  const headers={};const res={setHeader:(k,v)=>{headers[k]=v},status:vi.fn().mockReturnThis(),json:vi.fn()}
  await handler({method:'GET',query:q},res);expect(res.status).toHaveBeenCalledWith(503);expect(headers['Cache-Control']).toBe('no-store')
 })
 it('permite cache compartilhado apenas para dados públicos válidos e sem tokens',async()=>{
  const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[{numeroControlePNCP:'1',objetoCompra:'Computador',orgaoEntidade:{cnpj:'123'}}],totalPaginas:1,totalRegistros:1})));vi.stubGlobal('fetch',fetch)
  const headers={};const res={setHeader:(k,v)=>{headers[k]=v},status:vi.fn().mockReturnThis(),json:vi.fn()}
  await handler({method:'GET',query:q},res);expect(headers['Cache-Control']).toContain('s-maxage=300');expect(fetch.mock.calls[0][1]).not.toHaveProperty('headers')
 })
 it('repassa a espera da fonte e nunca armazena um limite como sucesso',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{status:429,headers:{'Retry-After':'120'}})))
  const headers={};const res={setHeader:(k,v)=>{headers[k]=v},status:vi.fn().mockReturnThis(),json:vi.fn()}
  await handler({method:'GET',query:q},res)
  expect(res.status).toHaveBeenCalledWith(429);expect(headers['Retry-After']).toBe('120');expect(headers['Cache-Control']).toBe('no-store')
 })

})
