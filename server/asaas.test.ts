import { describe, expect, it } from 'vitest'
import { cifrar, decifrar, mesmoToken, montarConfig, corpoAssinatura } from './asaas.js'
const env={SUPABASE_SERVICE_ROLE_KEY:'servico-teste'}
describe('Asaas no servidor',()=>{
  it('cifra e decifra credenciais; outra chave de servidor não abre',()=>{
    const c=cifrar('$aact_segredo',env)
    expect(c).not.toContain('segredo');expect(decifrar(c,env)).toBe('$aact_segredo')
    expect(()=>decifrar(c,{SUPABASE_SERVICE_ROLE_KEY:'outra'})).toThrow()
  })
  it('compara token do webhook com segurança',()=>{
    expect(mesmoToken('abc','abc')).toBe(true);expect(mesmoToken('abc','abd')).toBe(false);expect(mesmoToken(null,'abc')).toBe(false)
  })
  it('configuração do painel tem prioridade sobre variáveis de ambiente',()=>{
    const cfg=montarConfig({ativo:true,ambiente:'production',api_key_cifrada:cifrar('chave-painel',env)},{...env,ASAAS_API_KEY:'chave-env'})
    expect(cfg).toMatchObject({origem:'painel',apiKey:'chave-painel',ambiente:'production',ativo:true})
    expect(montarConfig(null,env)).toBeNull()
  })
  it('assinatura usa o valor do banco e a referência interna',()=>{
    const b=corpoAssinatura({id:'a1',forma:'PIX',valor_centavos:39700,ciclo:'anual'},'cus_1','Profissional')
    expect(b).toMatchObject({customer:'cus_1',billingType:'PIX',value:397,cycle:'YEARLY',externalReference:'a1'})
  })
})
