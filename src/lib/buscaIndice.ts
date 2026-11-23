import {supabase} from './supabase'
import type {CompraPNCP} from './pncp'
import type {FiltrosOportunidades} from './filtrosOportunidades'
export interface StatusCatalogo {
 iniciado_em:string|null;ultima_coleta_em:string|null;ultima_carga_completa_em:string|null
 carga_inicial_concluida:boolean;editais_indexados:number;editais_com_itens:number
 paginas_coletadas:number;paginas_planejadas:number;pausado_ate:string|null;aviso:string|null;fonte?:'turso'
 /** Histórico de encerrados: dia de publicação até onde já carregou; null = completo; 'pendente' = não começou. */
 historico_ate?:string|null
}
export interface ResultadoIndice {
 data:CompraPNCP[];totalRegistros:number;totalPaginas:number
 orgaos:{cnpj:string;razaoSocial:string}[];catalogo:StatusCatalogo;detalhesPendentes:number
 /** Inclui editais encerrados (histórico de 12 meses no Turso). */
 historico?:boolean
 /** O total passou do limite de contagem (mostra "mais de"). */
 totalLimitado?:boolean
 /** Base rápida: os órgãos não vêm na busca; o app pede com pesquisarOrgaos quando o seletor abre. */
 orgaosSobDemanda?:boolean
}
/** Órgãos dos editais do filtro, na base rápida (só quando o usuário abre o seletor de órgão). */
export async function pesquisarOrgaos(f:FiltrosOportunidades,signal?:AbortSignal):Promise<{cnpj:string;razaoSocial:string}[]>{
 const {data:s}=await supabase.auth.getSession()
 if(!s.session)return []
 const r=await fetch('/api/oportunidades?acao=turso-orgaos',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.session.access_token}`},body:JSON.stringify({filtros:f}),signal})
 const corpo=await r.json().catch(()=>null)
 if(!r.ok||!Array.isArray(corpo?.orgaos))throw new Error(corpo?.error??'Não foi possível carregar os órgãos.')
 return corpo.orgaos
}
/** Data de hoje (AAAA-MM-DD) em Brasília. */
const hojeSP=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})
/** A busca inclui encerrados: abertura a partir de um dia passado, ou por data de publicação. */
export function buscaHistorica(f:Pick<FiltrosOportunidades,'situacao'|'aberturaDe'>){return f.situacao==='publicacoes'||(!!f.aberturaDe&&f.aberturaDe<hojeSP())}
const ERRO_HISTORICO='O histórico de editais encerrados está fora do ar agora. Tente de novo em alguns minutos ou pesquise a partir de hoje.'
const valido=(d:unknown):d is ResultadoIndice=>!!d&&Array.isArray((d as ResultadoIndice).data)&&Number.isInteger((d as ResultadoIndice).totalRegistros)&&Number.isInteger((d as ResultadoIndice).totalPaginas)

// Quando a base rápida responde "ainda carregando", o app fica alguns minutos só no Postgres (sem pagar duas idas).
let tursoPausadoAte=0
/** Base rápida (Turso): "por data de abertura" e, com o histórico, "por data de publicação". null quando não pode responder e o Postgres assume. */
async function pesquisarTurso(f:FiltrosOportunidades,pagina:number,token:string,signal?:AbortSignal):Promise<ResultadoIndice|null>{
 // Encerrados só existem no Turso: tenta sempre e, se falhar, avisa (o Postgres devolveria só os abertos).
 const historico=buscaHistorica(f)
 if(!historico&&(f.situacao!=='abertas'||Date.now()<tursoPausadoAte))return null
 try{
  const r=await fetch('/api/oportunidades?acao=turso-buscar',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({filtros:f,pagina}),signal})
  const corpo=await r.json().catch(()=>null)
  if(r.ok&&valido(corpo))return corpo
  if(r.status===400&&corpo?.error)throw new Error(corpo.error)
  if(historico&&f.situacao==='abertas')throw new Error(r.status===429&&corpo?.error?corpo.error:ERRO_HISTORICO)
  if(r.status===409&&corpo?.codigo!=='turso_itens')tursoPausadoAte=Date.now()+3*60_000
  // Turso fora (ex.: cota do plano estourada): 10 min só no Postgres, sem esperar a ida ao Turso em cada busca.
  if(r.status>=500)tursoPausadoAte=Date.now()+10*60_000
  return null
 }catch(e){
  if(signal?.aborted)throw e
  if(e instanceof Error&&!(e instanceof TypeError))throw e
  if(historico&&f.situacao==='abertas')throw new Error(ERRO_HISTORICO)
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
