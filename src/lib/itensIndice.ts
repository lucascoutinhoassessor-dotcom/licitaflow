import {supabase} from './supabase'
import {consultarItens,type ItemCompra} from './filtrosOportunidades'
import type {CompraPNCP} from './pncp'

/** Itens guardados na base rápida (Turso). null quando ainda não foram coletados ou a base não respondeu. */
async function itensTurso(controle:string,signal?:AbortSignal):Promise<ItemCompra[]|null>{
 try{
  const {data}=await supabase.auth.getSession()
  if(!data.session)return null
  const r=await fetch(`/api/oportunidades?acao=turso-itens&controle=${encodeURIComponent(controle)}`,{headers:{Authorization:`Bearer ${data.session.access_token}`},signal})
  if(!r.ok)return null
  const j=await r.json().catch(()=>null)
  return Array.isArray(j?.itens)?j.itens:null
 }catch(e){if(signal?.aborted)throw e;return null}
}

/** Reserva da página do edital quando o PNCP falha: base rápida, depois a cópia do Postgres, por fim o PNCP de novo. */
export async function itensDoEdital(compra:CompraPNCP,signal?:AbortSignal):Promise<ItemCompra[]>{
 const rapido=await itensTurso(compra.numeroControlePNCP,signal)
 if(rapido)return rapido
 const p=supabase.rpc('itens_oportunidade_indexados',{p_controle:compra.numeroControlePNCP})
 const {data,error}=await(signal?p.abortSignal(signal):p)
 signal?.throwIfAborted()
 if(!error&&Array.isArray(data)&&data.length)return data
 return consultarItens(compra,signal)
}
