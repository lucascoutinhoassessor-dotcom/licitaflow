import {supabase} from './supabase'
import {consultarItens,type ItemCompra} from './filtrosOportunidades'
import type {CompraPNCP} from './pncp'
export async function itensDoEdital(compra:CompraPNCP,signal?:AbortSignal):Promise<ItemCompra[]>{
 const p=supabase.rpc('itens_oportunidade_indexados',{p_controle:compra.numeroControlePNCP})
 const {data,error}=await(signal?p.abortSignal(signal):p)
 signal?.throwIfAborted()
 if(!error&&Array.isArray(data))return data
 // A leitura pontual de itens não participa da pesquisa por palavras-chave.
 void supabase.rpc('solicitar_itens_oportunidade',{p_controle:compra.numeroControlePNCP}).then(()=>undefined,()=>undefined)
 return consultarItens(compra,signal)
}
