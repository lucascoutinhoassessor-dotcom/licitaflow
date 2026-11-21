import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from '../api/pagamentos.js'
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
    ambiente();const fetch=vi.fn().mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json([])).mockResolvedValueOnce(Response.json([{id:'11111111-1111-1111-1111-111111111111',gateway:'stripe',status:'rascunho',vencimento:'2099-01-01'}])).mockResolvedValueOnce(Response.json([]));vi.stubGlobal('fetch',fetch);const r=res()
    await handler({method:'POST',headers:{authorization:'Bearer master'},body:{acao:'checkout',id:'11111111-1111-1111-1111-111111111111'}},r)
    expect(r.status).toHaveBeenCalledWith(409);expect(fetch).toHaveBeenCalledTimes(4)
    expect(fetch.mock.calls.every(([url])=>!url.includes('api.stripe.com'))).toBe(true)
  })
  it('cliente comum não chega às ações exclusivas do master (chave do Asaas)',async()=>{
    ambiente();const fetch=vi.fn().mockResolvedValue(Response.json(false));vi.stubGlobal('fetch',fetch);const r=res()
    await handler({method:'POST',headers:{authorization:'Bearer usuario'},body:{acao:'asaas_salvar',api_key:'x'.repeat(40)}},r)
    expect(r.status).toHaveBeenCalledWith(403);expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('master salva a chave do Asaas cifrada, nunca em texto puro',async()=>{
    ambiente();const fetch=vi.fn().mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json([{id:'asaas'}])).mockResolvedValueOnce(Response.json([{id:'asaas'}]));vi.stubGlobal('fetch',fetch);const r=res()
    const chave='$aact_'+'a'.repeat(60)
    await handler({method:'POST',headers:{authorization:'Bearer master'},body:{acao:'asaas_salvar',api_key:chave,ativo:true}},r)
    expect(r.json).toHaveBeenCalledWith({ok:true})
    const corpo=fetch.mock.calls[2][1].body
    expect(corpo).not.toContain(chave);expect(JSON.parse(corpo).api_key_cifrada).toMatch(/^v1:/)
  })
  it('cliente só assina com o Asaas ativado pela plataforma',async()=>{
    ambiente();const fetch=vi.fn().mockResolvedValueOnce(Response.json(false)).mockResolvedValueOnce(Response.json([{id:'asaas',ativo:false}]));vi.stubGlobal('fetch',fetch);const r=res()
    await handler({method:'POST',headers:{authorization:'Bearer usuario'},body:{acao:'assinar',org:'11111111-1111-1111-1111-111111111111',plano:'essencial',ciclo:'mensal',documento:'12345678909'}},r)
    expect(r.status).toHaveBeenCalledWith(503);expect(fetch.mock.calls.every(([url])=>!String(url).includes('asaas.com'))).toBe(true)
  })
})

