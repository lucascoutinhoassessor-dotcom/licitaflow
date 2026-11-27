import { afterEach, describe, expect, it, vi } from 'vitest'
import { apresentarPagamento, dadosCartao } from './checkout.js'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
const cfg = {apiKey:'teste',ambiente:'sandbox'}
const dados = () => ({ cartao:{nome:'Titular Teste',numero:'5162 3062 1937 8829',mes:'12',ano:String(new Date().getFullYear()+2),cvv:'318'},
  titular:{nome:'Titular Teste',email:'pessoa@example.com',documento:'24971563792',cep:'89223-005',numero:'277',telefone:'47998781877'} })

describe('checkout transparente', () => {
  it('normaliza os dados do cartão e identifica o IP original na Vercel', () => {
    vi.stubEnv('VERCEL','1')
    const r=dadosCartao(dados(),{headers:{'x-forwarded-for':'203.0.113.10, 10.0.0.1'},socket:{remoteAddress:'10.0.0.1'}})
    expect(r.remoteIp).toBe('203.0.113.10')
    expect(r.creditCard.number).toBe('5162306219378829')
    expect(r.creditCardHolderInfo.postalCode).toBe('89223005')
  })
  it('recusa dados incompletos, cartão vencido e IP inválido antes de cobrar', () => {
    const req={headers:{},socket:{remoteAddress:'::ffff:127.0.0.1'}}
    expect(() => dadosCartao({},req)).toThrow(/cartão/)
    const d=dados(); d.cartao.ano='2000'
    expect(() => dadosCartao(d,req)).toThrow(/validade/)
    expect(() => dadosCartao(dados(),{headers:{},socket:{}})).toThrow(/dispositivo/)
    const t=dados(); t.titular.cep='123'
    expect(() => dadosCartao(t,req)).toThrow(/titular/)
  })
  it('devolve QR Code e copia e cola sem credenciais nem dados privados', async () => {
    const fetch=vi.fn().mockResolvedValue(Response.json({encodedImage:'aW1hZ2Vt',payload:'000201teste',expirationDate:'2027-01-01'}));vi.stubGlobal('fetch',fetch)
    const r=await apresentarPagamento(cfg,{id:'pay_1',value:197,dueDate:'2027-01-01',status:'PENDING',billingType:'PIX',customer:'cus_1',creditCard:{creditCardToken:'segredo'}})
    expect(r).toMatchObject({valor_centavos:19700,pago:false,pix:{codigo:'000201teste'}})
    expect(JSON.stringify(r)).not.toMatch(/segredo|customer|creditCard/)
    expect(String(fetch.mock.calls[0][0])).toContain('/payments/pay_1/pixQrCode')
  })
  it('mostra linha digitável e só permite URL HTTPS para baixar boleto',async () => {
    vi.stubGlobal('fetch',vi.fn().mockImplementation(async () => Response.json({identificationField:'123456'})))
    const r=await apresentarPagamento(cfg,{id:'pay_2',value:10,status:'PENDING',billingType:'BOLETO',bankSlipUrl:'javascript:alert(1)'})
    expect(r.boleto).toEqual({linha:'123456',url:null})
  })
  it('um pagamento confirmado não consulta códigos nem expõe token',async () => {
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch)
    const r=await apresentarPagamento(cfg,{id:'pay_3',value:10,status:'CONFIRMED',billingType:'CREDIT_CARD',creditCard:{creditCardToken:'privado'}})
    expect(r.pago).toBe(true);expect(fetch).not.toHaveBeenCalled();expect(JSON.stringify(r)).not.toContain('privado')
  })
  it('falha temporária ao obter QR Code mantém o checkout recuperável',async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({errors:[{description:'aguarde'}]},{status:400})))
    const r=await apresentarPagamento(cfg,{id:'pay_4',value:10,status:'PENDING',billingType:'PIX'})
    expect(r.pix).toBeNull();expect(r.aviso).toMatch(/Atualize/)
  })
})
