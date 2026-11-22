import {supabase} from './supabase'
import type {CompraPNCP} from './pncp'
import type {FiltrosOportunidades} from './filtrosOportunidades'
export interface StatusCatalogo {
 iniciado_em:string;ultima_coleta_em:string|null;ultima_carga_completa_em:string|null
 carga_inicial_concluida:boolean;editais_indexados:number;editais_com_itens:number
 paginas_coletadas:number;paginas_planejadas:number;pausado_ate:string|null;aviso:string|null
}
export interface ResultadoIndice {
 data:CompraPNCP[];totalRegistros:number;totalPaginas:number
 orgaos:{cnpj:string;razaoSocial:string}[];catalogo:StatusCatalogo;detalhesPendentes:number
}
export async function pesquisarIndice(f: FiltrosOportunidades,pagina:number,signal?:AbortSignal):Promise<ResultadoIndice>{
 const pedido=supabase.rpc('buscar_oportunidades',{p_filtros:f,p_pagina:pagina,p_tamanho:20})
 const {data,error}=await(signal?pedido.abortSignal(signal):pedido)
 if(error){
  if(signal?.aborted)throw signal.reason
  if(['PGRST202','PGRST205','42883'].includes(error.code))throw new Error('O catálogo de pesquisa está sendo preparado. Tente novamente em instantes.')
  // 57014: a busca passou do tempo limite do banco (ex.: banco sobrecarregado ou filtro muito amplo).
  if(error.code==='57014')throw new Error('A pesquisa demorou mais que o esperado. Tente novamente ou reduza o período, a UF ou as modalidades.')
  throw new Error('Não foi possível pesquisar o catálogo. Tente novamente.')
 }
 if(!data||!Array.isArray(data.data)||!Number.isInteger(data.totalRegistros)||!Number.isInteger(data.totalPaginas))throw new Error('O catálogo retornou uma resposta inesperada.')
 return data as ResultadoIndice
}
