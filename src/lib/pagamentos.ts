import { supabase } from './supabase'
export const NOMES_GATEWAY: Record<string,string> = {stripe:'Stripe',asaas:'Asaas',mercadopago:'Mercado Pago',infinitepay:'InfinitePay'}
export async function pagamentoAPI(dados: Record<string,unknown>) {
  const {data}=await supabase.auth.getSession()
  if(!data.session) throw new Error('Entre na sua conta novamente.')
  const r=await fetch('/api/pagamentos',{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(dados)})
  if(!r.headers.get('content-type')?.includes('application/json')) throw new Error('API de pagamentos indisponível nesta publicação.')
  const json=await r.json()
  if(!r.ok) throw new Error(json.error ?? 'Falha na integração de pagamentos')
  return json
}
export interface Cobranca {id:string;org_id:string;descricao:string;valor_centavos:number;vencimento:string;gateway:string;status:string;checkout_url:string|null;confirmado_em:string|null}
