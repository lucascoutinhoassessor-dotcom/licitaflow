import {supabase} from './supabase'
import type {CompraPNCP} from './pncp'
import type {StatusCatalogo} from './buscaIndice'

/** Situação do item no PNCP: 4 = Deserto (ninguém propôs), 5 = Fracassado (nenhuma proposta válida). */
export type SituacaoDeserta = 4 | 5
export interface ItemDeserto {
 numeroItem:number;situacao:SituacaoDeserta;descricao:string;quantidade?:number;unidadeMedida?:string
 valorUnitarioEstimado?:number;orcamentoSigiloso?:boolean;tipoBeneficio?:number
}
export interface CompraDeserta extends CompraPNCP {
 desertos:number;fracassados:number;itensDesertos:ItemDeserto[];valorDesertos:number|null
}
export interface FiltrosDesertas {
 busca:string;uf:string
 /** Portal de origem (id de portais.ts); '' = todos. */
 portal:string
 /** Sessões dos últimos N dias (1 a 30). */
 dias:number
 /** '' = desertos e fracassados. */
 tipo:''|'4'|'5'
 inverter:boolean
}
export const FILTROS_DESERTAS:FiltrosDesertas={busca:'',uf:'',portal:'',dias:30,tipo:'',inverter:false}
export const PERIODOS_DESERTAS=[[7,'7 dias'],[15,'15 dias'],[30,'30 dias']] as const
export interface ResultadoDesertas {data:CompraDeserta[];totalRegistros:number;totalPaginas:number;catalogo:StatusCatalogo|null}

/** Modalidades pesquisadas nas desertas (pregão, concorrência, dispensa etc.). */
export const MODALIDADES_DESERTAS=['2','4','5','6','7','8']

export function nomeSituacao(s:SituacaoDeserta){return s===4?'Deserto':'Fracassado'}

export async function pesquisarDesertas(f:FiltrosDesertas,pagina:number,signal?:AbortSignal,liberadas?:string[]):Promise<ResultadoDesertas>{
 if(f.busca.length>300)throw new Error('Use no máximo 300 caracteres nos termos da pesquisa.')
 // Só as modalidades que o master liberou para o cliente entram na busca.
 const modalidades=liberadas?MODALIDADES_DESERTAS.filter(m=>liberadas.includes(m)):MODALIDADES_DESERTAS
 if(!modalidades.length)throw new Error('Nenhuma modalidade está liberada para a sua conta.')
 const pedido=supabase.rpc('buscar_desertas',{p_filtros:{...f,modalidades},p_pagina:pagina,p_tamanho:20})
 const {data,error}=await(signal?pedido.abortSignal(signal):pedido)
 if(error){
  if(signal?.aborted)throw signal.reason
  if(['PGRST202','PGRST205','42883'].includes(error.code))throw new Error('A pesquisa de desertas está sendo preparada. Tente novamente em instantes.')
  if(error.message?.includes('palavra-chave'))throw new Error('Informe uma palavra-chave para pesquisar.')
  throw new Error('Não foi possível pesquisar as desertas. Tente novamente.')
 }
 if(!data||!Array.isArray(data.data)||!Number.isInteger(data.totalRegistros)||!Number.isInteger(data.totalPaginas))throw new Error('A pesquisa retornou uma resposta inesperada.')
 return data as ResultadoDesertas
}
