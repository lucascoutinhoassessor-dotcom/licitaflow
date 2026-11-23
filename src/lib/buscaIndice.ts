import {supabase} from './supabase'
import type {CompraPNCP} from './pncp'
import type {FiltrosOportunidades} from './filtrosOportunidades'
export interface StatusCatalogo {
 iniciado_em:string|null;ultima_coleta_em:string|null;ultima_carga_completa_em:string|null
 carga_inicial_concluida:boolean;editais_indexados:number;editais_com_itens:number
 paginas_coletadas:number;paginas_planejadas:number;pausado_ate:string|null;aviso:string|null;fonte?:'turso'
}
export interface ResultadoIndice {
 data:CompraPNCP[];totalRegistros:number;totalPaginas:number
 orgaos:{cnpj:string;razaoSocial:string}[];catalogo:StatusCatalogo;detalhesPendentes:number
}
const valido=(d:unknown):d is ResultadoIndice=>!!d&&Array.isArray((d as ResultadoIndice).data)&&Number.isInteger((d as ResultadoIndice).totalRegistros)&&Number.isInteger((d as ResultadoIndice).totalPaginas)

// Quando a base rápida responde "ainda carregando", o app fica alguns minutos só no Postgres (sem pagar duas idas).
let tursoPausadoAte=0
/** Base rápida (Turso): só para "por data de abertura". null quando não pode responder e o Postgres assume. */
async function pesquisarTurso(f:FiltrosOportunidades,pagina:number,token:string,signal?:AbortSignal):Promise<ResultadoIndice|null>{
 if(f.situacao!=='abertas'||Date.now()<tursoPausadoAte)return null
 try{
  const r=await fetch('/api/oportunidades?acao=turso-buscar',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({filtros:f,pagina}),signal})
  const corpo=await r.json().catch(()=>null)
  if(r.ok&&valido(corpo))return corpo
  if(r.status===400&&corpo?.error)throw new Error(corpo.error)
  if(r.status===409&&corpo?.codigo!=='turso_itens')tursoPausadoAte=Date.now()+3*60_000
  // Turso fora (ex.: cota do plano estourada): 10 min só no Postgres, sem esperar a ida ao Turso em cada busca.
  if(r.status>=500)tursoPausadoAte=Date.now()+10*60_000
  return null
 }catch(e){
  if(signal?.aborted)throw e
  if(e instanceof Error&&!(e instanceof TypeError))throw e
  tursoPausadoAte=Date.now()+10*60_000
  return null
 }
}

export async function pesquisarIndice(f: FiltrosOportunidades,pagina:number,signal?:AbortSignal):Promise<ResultadoIndice>{
 const {data:s}=await supabase.auth.getSession()
 if(s.session){const rapido=await pesquisarTurso(f,pagina,s.session.access_token,signal);if(rapido)return rapido}
 const pedido=supabase.rpc('buscar_oportunidades',{p_filtros:f,p_pagina:pagina,p_tamanho:20})
 const {data,error}=await(signal?pedido.abortSignal(signal):pedido)
 if(error){
  if(signal?.aborted)throw signal.reason
  if(['PGRST202','PGRST205','42883'].includes(error.code))throw new Error('O catálogo de pesquisa está sendo preparado. Tente novamente em instantes.')
  // 57014: a busca passou do tempo limite do banco (ex.: banco sobrecarregado ou filtro muito amplo).
  if(error.code==='57014')throw new Error('A pesquisa demorou mais que o esperado. Tente novamente ou reduza o período, a UF ou as modalidades.')
  throw new Error('Não foi possível pesquisar o catálogo. Tente novamente.')
 }
 if(!valido(data))throw new Error('O catálogo retornou uma resposta inesperada.')
 return data
}
