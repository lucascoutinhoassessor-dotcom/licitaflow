-- LicitaFlow · Tipo de item (material/serviço) também pelo objeto do edital.
-- Comparação em 20/11/2026 (RJ, dispensa, Comprasnet, abertura 20/11–04/12): o catálogo tinha os mesmos 373 editais
-- do PNCP, mas só 84 já com itens coletados — o filtro "Serviço" mostrava 22, enquanto a referência de mercado mostrava 105.
-- Além disso, o campo materialOuServico dos itens vem muitas vezes errado na origem (ex.: "prestação de serviços de buffet"
-- marcado como material). Agora um edital entra no filtro quando os itens OU o objeto indicam o tipo pedido.
-- Regra do objeto conferida contra 4.135 editais com itens: ~81% de acerto em material e ~80% em serviço.

create or replace function public.oportunidades_tipo_objeto(p_objeto text) returns text
language sql immutable parallel safe set search_path='' as $$
 select case
  when o ~ '(prestacao de servic|servicos? (de|continuad|comum|especializad|tecnic|terceirizad)|contratacao de servic)' then 'S'
  when o ~ '(aquisic|^compra|compra de|fornecimento|registro de precos? para (a )?(futura|eventual|eventuais|possivel)|^material|^materiais|^equipamento|generos alimenticios|medicamento)' then 'M'
  when o ~ '(servic|manutenc|locacao|obra|reforma|execucao|consultoria|assessoria|transporte|limpeza|vigilanc|instalacao|treinamento|curso|capacitacao|evento|seguro|hospedagem|conserto|reparo|dedetizacao|terceirizacao|elaboracao de projeto|exames|recarga)' then 'S'
  when o ~ '(material|materiais|equipamento|insumo|peca|mobiliario|veiculo|uniforme)' then 'M'
 end
 from (select public.oportunidades_normalizar(coalesce(p_objeto,'')) o) x
$$;
revoke all on function public.oportunidades_tipo_objeto(text) from public,anon;
grant execute on function public.oportunidades_tipo_objeto(text) to authenticated;

create or replace function public.buscar_oportunidades(p_filtros jsonb default '{}',p_pagina integer default 1,p_tamanho integer default 20)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare q tsquery;termo text:=trim(coalesce(p_filtros->>'busca',''));mods integer[];portais text[];v_uf text:=coalesce(p_filtros->>'uf','');org text:=nullif(p_filtros->>'orgao','');modo text:=coalesce(p_filtros->>'situacao','abertas');
 de date;ate date;v_min numeric:=nullif(p_filtros->>'minimo','')::numeric;v_max numeric:=nullif(p_filtros->>'maximo','')::numeric;i_min numeric:=nullif(p_filtros->>'itemMinimo','')::numeric;i_max numeric:=nullif(p_filtros->>'itemMaximo','')::numeric;
 max_itens integer:=nullif(p_filtros->>'maxItens','')::integer;excluir text:=trim(coalesce(p_filtros->>'excluir',''));q_ex tsquery;v_tipo text:=coalesce(p_filtros->>'tipoItem','');modos integer[];parte text;ab_de date:=nullif(p_filtros->>'aberturaDe','')::date;ab_ate date:=nullif(p_filtros->>'aberturaAte','')::date;exclusivo boolean:=coalesce((p_filtros->>'exclusivo')::boolean,false);sem_valor boolean:=coalesce((p_filtros->>'naoDivulgado')::boolean,false);sem_srp boolean:=coalesce((p_filtros->>'excluirSrp')::boolean,false);por_item boolean;res jsonb;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária';end if;
 if p_pagina is null or p_tamanho is null or p_pagina not between 1 and 100000 or p_tamanho not between 1 and 50 or length(termo)>300 or length(excluir)>300 or v_tipo not in ('','M','S') or modo not in ('abertas','publicacoes') then raise exception 'Filtros inválidos';end if;
 select array_agg(x::integer) into mods from jsonb_array_elements_text(coalesce(p_filtros->'modalidades','[1,2,3,4,5,6,7,8,9,10,11,12,13]')) x;
 select array_agg(x) into portais from jsonb_array_elements_text(coalesce(p_filtros->'portais','["comprasnet","pcp","licitacoes-e","caixa","banrisul","rs","bahia","amazonas","goias","rj","recife","licitanet","bll","elic","procergs","mg","banpara","pe","bnc","outros"]')) x;
 if coalesce(array_length(mods,1),0)=0 or coalesce(array_length(portais,1),0)=0 then raise exception 'Selecione modalidade e portal';end if;
 if modo='publicacoes' then de:=(p_filtros->>'inicio')::date;ate:=(p_filtros->>'fim')::date;if de is null or ate is null or de>ate then raise exception 'Período inválido';end if;end if;
 if ab_de>ab_ate then raise exception 'Período de abertura inválido';end if;
 if v_min<0 or v_max<0 or i_min<0 or i_max<0 or v_min>v_max or i_min>i_max or max_itens<1 then raise exception 'Valores inválidos';end if;
 -- Vários termos separados por ";" valem como "qualquer um deles".
 foreach parte in array string_to_array(termo,';') loop
  if public.oportunidades_termos(parte) is not null then q:=case when q is null then public.oportunidades_termos(parte) else q||public.oportunidades_termos(parte) end;end if;
 end loop;
 if termo<>'' and q is null then raise exception 'Informe uma palavra-chave para pesquisar';end if;
 foreach parte in array string_to_array(excluir,';') loop
  if public.oportunidades_termos(parte) is not null then q_ex:=case when q_ex is null then public.oportunidades_termos(parte) else q_ex||public.oportunidades_termos(parte) end;end if;
 end loop;
 select array_agg(x::integer) into modos from jsonb_array_elements_text(coalesce(p_filtros->'modosDisputa','[]')) x;
 por_item:=i_min is not null or i_max is not null or max_itens is not null or exclusivo;
 with candidatos as materialized (
  select controle from public.oportunidades_indice where q is null
  union select controle from public.oportunidades_indice where busca @@ q
  union select controle from public.oportunidades_indice where busca_itens @@ q
 ), base as materialized (
  select o.controle,o.publicacao,o.encerramento,o.orgao_cnpj,o.orgao_nome,o.itens_completos,o.quantidade_itens,o.tipo_itens,case when v_tipo<>'' then public.oportunidades_tipo_objeto(o.objeto) end tipo_objeto from candidatos c join public.oportunidades_indice o using(controle)
  where o.modalidade=any(mods) and o.portal_id=any(portais) and (v_uf='' or o.uf=v_uf) and (org is null or o.orgao_cnpj=org)
   and (case when modo='abertas' then o.encerramento>=greatest(now(),coalesce(ab_de::timestamp at time zone 'America/Sao_Paulo','-infinity'::timestamptz))
     and (ab_ate is null or o.encerramento<((ab_ate+1)::timestamp at time zone 'America/Sao_Paulo')) and coalesce(o.situacao,1)=1 else o.publicacao >= (de::timestamp at time zone 'America/Sao_Paulo') and o.publicacao < ((ate+1)::timestamp at time zone 'America/Sao_Paulo') end)
   and (not sem_srp or o.srp=false)
   and (q_ex is null or not (o.busca @@ q_ex))
   and (coalesce(array_length(modos,1),0)=0 or o.modo_disputa=any(modos))
   and (case when sem_valor then coalesce(o.valor,0)=0 else (v_min is null or o.valor>0 and o.valor>=v_min) and (v_max is null or o.valor>0 and o.valor<=v_max) end)
 ), filtrados as materialized (
  select b.* from base b where (v_tipo='' or position(v_tipo in coalesce(b.tipo_itens,'')||coalesce(b.tipo_objeto,''))>0) and (not por_item or (
   b.itens_completos and (max_itens is null or b.quantidade_itens<=max_itens) and
   ((i_min is null and i_max is null and not exclusivo) or exists(select 1 from public.oportunidades_itens_indice i where i.controle=b.controle
    and (not exclusivo or i.beneficio=1) and ((i_min is null and i_max is null) or not i.sigiloso and i.valor_unitario>0 and (i_min is null or i.valor_unitario>=i_min) and (i_max is null or i.valor_unitario<=i_max))))
  ))
 ), pagina as (
  select o.compra||jsonb_strip_nulls(jsonb_build_object('modoDisputaId',o.modo_disputa,'materialOuServico',coalesce(o.tipo_itens,public.oportunidades_tipo_objeto(o.objeto)),'tipoEstimado',case when o.tipo_itens is null and public.oportunidades_tipo_objeto(o.objeto) is not null then true end)) compra,f.publicacao,f.encerramento,f.controle from filtrados f join public.oportunidades_indice o using(controle)
  order by case when modo='abertas' then f.encerramento end asc nulls last,f.publicacao desc nulls last,f.controle limit p_tamanho offset (p_pagina-1)*p_tamanho
 )
 select jsonb_build_object('data',coalesce((select jsonb_agg(compra order by case when modo='abertas' then encerramento end asc nulls last,publicacao desc nulls last,controle) from pagina),'[]'::jsonb),'totalRegistros',(select count(*) from filtrados),
 'totalPaginas',ceil((select count(*) from filtrados)::numeric/p_tamanho),'orgaos',coalesce((select jsonb_agg(x) from (select orgao_cnpj cnpj,min(orgao_nome) "razaoSocial" from base group by orgao_cnpj order by min(orgao_nome) limit 200) x),'[]'::jsonb),
 'catalogo',(select to_jsonb(s)-'id' from public.oportunidades_catalogo_status s where id),
 'detalhesPendentes',case when por_item then (select count(*) from base where not itens_completos) else 0 end) into res;
 return res;
end;$$;
revoke all on function public.buscar_oportunidades(jsonb,integer,integer) from public,anon;
grant execute on function public.buscar_oportunidades(jsonb,integer,integer) to authenticated;
