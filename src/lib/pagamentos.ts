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

export type StatusAssinatura = 'pendente'|'ativa'|'atrasada'|'cancelada'
export interface Assinatura {
  id:string; org_id:string; plano_id:string; ciclo:'mensal'|'anual'; valor_centavos:number; forma:string; status:StatusAssinatura
  gateway_assinatura_id:string|null; proximo_vencimento:string|null; pago_ate:string|null; link_pagamento:string|null
  erro:string|null; created_at:string; cancelada_em:string|null
}
export interface Fatura {
  id:string; assinatura_id:string; org_id:string; gateway_pagamento_id:string; valor_centavos:number; valor_liquido_centavos:number|null
  status:'pendente'|'paga'|'atrasada'|'cancelada'|'estornada'; vencimento:string|null; pago_em:string|null; forma:string|null; link:string|null
}

export const STATUS_ASSINATURA: Record<StatusAssinatura,{rotulo:string;cor:'verde'|'amarelo'|'vermelho'|'neutro'}> = {
  pendente:{rotulo:'Aguardando 1º pagamento',cor:'amarelo'}, ativa:{rotulo:'Ativa',cor:'verde'},
  atrasada:{rotulo:'Em atraso',cor:'vermelho'}, cancelada:{rotulo:'Cancelada',cor:'neutro'},
}
export const STATUS_FATURA: Record<Fatura['status'],{rotulo:string;cor:'verde'|'amarelo'|'vermelho'|'neutro'}> = {
  pendente:{rotulo:'Em aberto',cor:'amarelo'}, paga:{rotulo:'Paga',cor:'verde'}, atrasada:{rotulo:'Vencida',cor:'vermelho'},
  cancelada:{rotulo:'Cancelada',cor:'neutro'}, estornada:{rotulo:'Estornada',cor:'neutro'},
}
export const FORMAS: Record<string,string> = {UNDEFINED:'Cliente escolhe (Pix, boleto ou cartão)',PIX:'Pix',BOLETO:'Boleto',CREDIT_CARD:'Cartão de crédito'}

/** Assinatura em vigor da organização e as faturas recentes (RLS: dono/admin da org ou master). */
export async function carregarAssinatura(org:string) {
  const [a,f]=await Promise.all([
    supabase.from('assinaturas').select('*').eq('org_id',org).neq('status','cancelada').maybeSingle(),
    supabase.from('assinatura_faturas').select('*').eq('org_id',org).order('vencimento',{ascending:false}).limit(24),
  ])
  if(a.error) throw a.error
  if(f.error) throw f.error
  return {assinatura:a.data as Assinatura|null, faturas:(f.data ?? []) as Fatura[]}
}
