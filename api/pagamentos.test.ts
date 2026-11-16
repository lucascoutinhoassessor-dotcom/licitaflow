import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from './pagamentos.js'
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
function res() {return {setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()}}
function ambiente(){vi.stubEnv('SUPABASE_URL','https://teste.supabase.co');vi.stubEnv('SUPABASE_ANON_KEY','publica');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','privada');vi.stubEnv('BILLING_PUBLIC_URL','https://exemplo.com');vi.stubEnv('PAYMENTS_ENABLED_PROVIDERS','stripe');vi.stubEnv('STRIPE_SECRET_KEY','segredo')}
describe('API de pagamentos',()=>{
  it('exige autenticação antes de acessar o banco',async()=>{
    ambiente();const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const r=res()
    await handler({method:'POST',headers:{},body:{}},r)
    expect(r.status).toHaveBeenCalledWith(401);expect(fetch).not.toHaveBeenCalled()
  })
  it('bloqueia conta comum antes de consultar credenciais ou criar checkout',async()=>{
    ambiente();const fetch=vi.fn().mockResolvedValue(Response.json(false));vi.stubGlobal('fetch',fetch);const r=res()
    await handler({method:'POST',headers:{authorization:'Bearer usuario'},body:{acao:'checkout'}},r)
    expect(r.status).toHaveBeenCalledWith(403);expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('não repete criação se outra sessão já reservou a cobrança',async()=>{
    ambiente();const fetch=vi.fn().mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json([{id:'11111111-1111-1111-1111-111111111111',gateway:'stripe',status:'rascunho',vencimento:'2099-01-01'}])).mockResolvedValueOnce(Response.json([]));vi.stubGlobal('fetch',fetch);const r=res()
    await handler({method:'POST',headers:{authorization:'Bearer master'},body:{acao:'checkout',id:'11111111-1111-1111-1111-111111111111'}},r)
    expect(r.status).toHaveBeenCalledWith(409);expect(fetch).toHaveBeenCalledTimes(3)
    expect(fetch.mock.calls.every(([url])=>!url.includes('api.stripe.com'))).toBe(true)
  })
})
