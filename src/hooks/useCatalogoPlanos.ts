import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
export interface PlanoCatalogo {id:string;nome:string;mensal_centavos:number;anual_centavos:number;limite_empresas:number|null;limite_usuarios:number|null;limite_processos:number|null;ativo:boolean;limites_ia?:Record<string,number|null>}
export function useCatalogoPlanos(publico=false) {
  return useQuery({queryKey:['catalogo-planos',publico],queryFn:async()=>{
    let q=supabase.from('plataforma_planos').select('*').order('mensal_centavos')
    if(publico)q=q.eq('ativo',true)
    const {data,error}=await q;if(error)throw error;return data as PlanoCatalogo[]
  },retry:false})
}
