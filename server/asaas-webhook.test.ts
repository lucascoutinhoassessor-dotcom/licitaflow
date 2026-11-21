import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from '../api/asaas-webhook.js'
import { cifrar } from './asaas.js'
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
function res() {return {setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()}}
function ambiente(){vi.stubEnv('SUPABASE_URL','https://teste.supabase.co');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','privada')}
const linha=()=>[{webhook_token_cifrado:cifrar('token-certo-1234567890',{SUPABASE_SERVICE_ROLE_KEY:'privada'})}]
describe('webhook do Asaas',()=>{
  it('rejeita token errado sem gravar nada',async()=>{
    ambiente();const fetch=vi.fn().mockResolvedValueOnce(Response.json(linha()));vi.stubGlobal('fetch',fetch);const r=res()
    await handler({method:'POST',headers:{'asaas-access-token':'errado'},body:{id:'evt_1',event:'PAYMENT_RECEIVED',payment:{id:'pay_1'}}},r)
    expect(r.status).toHaveBeenCalledWith(401);expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('evento repetido não é processado de novo',async()=>{
    ambiente();const fetch=vi.fn().mockResolvedValueOnce(Response.json(linha())).mockResolvedValueOnce(Response.json([]));vi.stubGlobal('fetch',fetch);const r=res()
    await handler({method:'POST',headers:{'asaas-access-token':'token-certo-1234567890'},body:{id:'evt_1',event:'PAYMENT_RECEIVED',payment:{id:'pay_1'}}},r)
    expect(r.json).toHaveBeenCalledWith({recebido:true,duplicado:true});expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('pagamento novo vai para o processamento no banco',async()=>{
    ambiente();const fetch=vi.fn().mockResolvedValueOnce(Response.json(linha())).mockResolvedValueOnce(Response.json([{id:'evt_2'}])).mockResolvedValueOnce(Response.json('acesso liberado')).mockResolvedValueOnce(new Response(null,{status:204}));vi.stubGlobal('fetch',fetch);const r=res()
    await handler({method:'POST',headers:{'asaas-access-token':'token-certo-1234567890'},body:{id:'evt_2',event:'PAYMENT_RECEIVED',payment:{id:'pay_2'}}},r)
    expect(String(fetch.mock.calls[2][0])).toContain('processar_pagamento_asaas')
    expect(r.json).toHaveBeenCalledWith({recebido:true,resultado:'acesso liberado'})
  })
})
